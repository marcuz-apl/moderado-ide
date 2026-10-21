import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { ImageAttachmentSchema, saveImageContext, loadImageContext, type ImageAttachment } from './attachments.js';
import { AgentLoop, PolicyManager, Router } from '@moderado/core';
import { FakeProviderAdapter } from '@moderado/providers';
import { z } from 'zod';
import { createDefaultToolRegistry, generateDiffPreview, resolveInJail } from '@moderado/tools';
import {
  AgentEvent,
  ApprovalDecision,
  ApprovalRequest,
  ChatMessage,
  IApprovalHandler,
  IProviderAdapter,
  IToolDefinition,
  IToolRegistry,
  ModelInventoryEntry,
} from '@moderado/contracts';
import { ApprovalCoordinator, RawDecision } from './approval.js';
import { ConfigState, canonicalWorkspaceRoot, configPath, readConfig } from './profile.js';
import { CredentialStore, MemoryCredentialStore, resolveCredential } from './credentials.js';
import { SessionStore, StoredSession, conversationOf, createSession, saveSessionChecked } from './sessions.js';
import { DESKTOP_PROVIDER_PRESETS } from './provider-catalog.js';
import { fetchGatewayRoutes, type GatewayRoute } from './provider-discovery.js';
import { DesktopOpenAIAdapter } from './provider-transport.js';
import { DesktopModelRouter } from './model-router.js';
import type { SettingsPreferences } from './settings-preferences.js';
import { validateProviderBaseUrl } from './provider-setup.js';

export interface AgentHostOptions {
  workspaceRoot: string;
  /** Receives validated events for rendering. Never receives provider secrets. */
  onEvent: (event: AgentEvent) => void;
  /** Asks the human for a decision. The renderer supplies only the answer. */
  promptForApproval: (request: ApprovalRequest, signal: AbortSignal) => Promise<RawDecision | undefined>;
  approvalTimeoutMs?: number;
  nonInteractive?: boolean;
  getPreferences?: () => SettingsPreferences;
  /**
   * True when this tool's category may run without asking the human.
   *
   * The vendored read and web tools never request approval, so the composer's
   * category switches would otherwise have no effect. When this returns false
   * for such a tool, the host adds an approval requirement; it never removes
   * one. Omitted, the registry keeps its own approval policy.
   */
  isAutoApproved?: (toolName: string) => boolean;
  allowPaid?: boolean;
  allowUnknown?: boolean;
  pinnedModelId?: string;
  /** Overrides the shared `~/.moderado` home; tests pass an isolated fixture. */
  moderadoHome?: string;
  /**
   * Where provider keys are read from. Production injects
   * `WindowsCredentialStore`; the default is in-memory so a test or a
   * non-Windows host never touches the real keychain.
   */
  credentialStore?: CredentialStore;
  /** Offline tests inject HTTP; production uses the native fetch transport. */
  fetchImpl?: typeof fetch;
}

/**
 * Resolves the provider adapter for a run from the shared `~/.moderado` config.
 *
 * The key is resolved here and injected into the adapter. It is never written to
 * an editor setting, returned to a renderer, or placed in an event. The adapter
 * is a Desktop-owned class, not a model-directed object, so this keeps the "no
 * renderer holds provider secrets" boundary intact.
 */

/** A connection as stored in `config.json`, validated at this boundary. */
export interface ProviderConnection {
  id: string;
  displayName?: string;
  kind?: string;
  baseUrl?: string;
  /** Credential Manager target, never the key itself. */
  credentialReference?: string;
  /** Legacy plaintext key, still honoured by the CLI's resolution order. */
  apiKey?: string;
  defaultModel?: string;
  authMethod?: 'public' | 'manual' | 'browser';
  credentialExpiresAt?: number;
}

export interface ProviderResolution {
  adapter: IProviderAdapter;
  /** Set when the run fell back to the fake provider, for user-facing events. */
  reason?: string;
  /** Display/profile-safe identity. Never includes a resolved key. */
  connectionId?: string;
  defaultModel?: string;
  /** Validated Gateway metadata retained separately from the core inventory. */
  discoverGatewayRoutes?: (signal?: AbortSignal) => Promise<GatewayRoute[]>;
}

/** The provider environment variable the CLI would consult for this connection. */
function envVarFor(connectionId: string): string {
  return `MODERADO_${connectionId.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`;
}

const ModelIdSchema = z.string().min(1).refine(value => value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value));
const ConnectionSchema = z.object({
  id: z.string().min(1).refine(value => /^[a-zA-Z0-9_-]+$/.test(value)),
  displayName: z.string().optional(),
  kind: z.enum(['nvidia-nim', 'openai-compatible']).optional(),
  baseUrl: z.string().optional(),
  credentialReference: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  defaultModel: ModelIdSchema.optional(),
  authMethod: z.enum(['public', 'manual', 'browser']).optional(),
  credentialExpiresAt: z.number().finite().optional(),
});

function fakeResolution(reason: string): ProviderResolution {
  const adapter = new FakeProviderAdapter();
  // The demo inventory lacks prices. Add explicit evidence only to this
  // built-in fake fixture; no real catalog inherits the core's cost heuristics.
  const fixtureRouter = new Router();
  adapter.models = adapter.models.map(entry => ({ ...entry, pricing: {
    prompt: fixtureRouter.classifyModel(entry.id).accessTier === 'paid' ? '1' : '0', completion: '0',
  } }));
  return { adapter, reason };
}

/**
 * Builds the adapter for `state`'s active connection.
 *
 * Returns the fake adapter when no usable connection is configured, so the
 * editor still opens and the failure is visible as a reason rather than a
 * thrown error at run time.
 */
export async function resolveProvider(
  state: ConfigState,
  store: CredentialStore = new MemoryCredentialStore(),
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
  imageContext?: ReadonlyMap<string, readonly ImageAttachment[]>,
  profilePath: string = configPath(),
): Promise<ProviderResolution> {
  const unavailable = (reason: string): ProviderResolution => {
    if (imageContext?.size) throw new Error('Image attachments require a configured image-capable provider. ' + reason);
    return fakeResolution(reason);
  };
  if (state.kind === 'missing') {
    return unavailable(`No provider settings found at ${profilePath}. Open Settings → API Config, enter URL/key, load models and Save settings.`);
  }
  if (state.kind === 'invalid') {
    // JSON parser diagnostics can quote plaintext config contents. Expose only
    // the failure category and an OS error code, never the raw diagnostic.
    const errorCode = state.error.match(/^Unreadable config\.json: (E[A-Z0-9]+):/)?.[1];
    const cause = state.error.startsWith('config.json is not valid JSON:') ? 'config.json is not valid JSON.'
      : state.error === 'config.json is empty.' || state.error === 'config.json is not a JSON object.' ? state.error
      : `config.json could not be read${errorCode ? ` (${errorCode})` : ''}.`;
    return unavailable(`Provider settings at ${profilePath} are invalid or unreadable: ${cause} Fix the file or its permissions before saving; existing data has not been replaced.`);
  }

  const parsedConnections = z.record(z.unknown()).safeParse(state.config.connections ?? {});
  if (!parsedConnections.success) throw new Error('The saved provider connections are malformed.');
  const connections = parsedConnections.data;
  const activeId = state.config.activeConnectionId;
  if (activeId !== undefined && typeof activeId !== 'string') throw new Error('The active provider connection is malformed.');
  const connectionId = typeof activeId === 'string' ? activeId : Object.keys(connections)[0];
  if (connectionId === undefined) {
    return unavailable('No provider connection is configured. Run "Moderado: Configure Provider Connection".');
  }
  const parsed = ConnectionSchema.safeParse(connections[connectionId]);
  if (!parsed.success || parsed.data.id !== connectionId) throw new Error('The saved provider connection is malformed. Open Moderado Settings to review it.');
  const connection = parsed.data;
  const preset = DESKTOP_PROVIDER_PRESETS.find(item => item.id === connectionId);
  const rawBaseUrl = connection.baseUrl?.trim() || preset?.baseUrl;
  if (!rawBaseUrl) throw new Error('A base URL is required for the saved provider connection.');
  const baseUrl = validateProviderBaseUrl(rawBaseUrl);
  if (connectionId === 'moderado-cloud' && connection.authMethod === 'browser'
    && (connection.credentialExpiresAt === undefined || connection.credentialExpiresAt <= Date.now())) {
    throw new Error('Gateway browser credential has expired. Open Moderado Settings to sign in again.');
  }

  const apiKey = await resolveCredential(
    env[envVarFor(connection.id)],
    connection.credentialReference,
    connection.apiKey,
    store,
  );

  // A local runtime (Ollama, LM Studio) needs no key, so a missing key is only
  // an error when the preset actually requires one.
  const requiresKey = connectionId === 'moderado-cloud' && connection.authMethod && connection.authMethod !== 'public'
    ? true : preset?.requiresApiKey ?? true;
  if (requiresKey && !apiKey) {
    return unavailable(`No API key resolved for connection '${connection.id}'.`);
  }

  return {
    adapter: new DesktopOpenAIAdapter({
      apiKey,
      baseUrl,
      id: connection.id,
      name: connection.displayName ?? preset?.label ?? connection.id,
      fetchImpl,
      imageContext,
    }),
    connectionId,
    defaultModel: connection.defaultModel,
    ...(connectionId === 'moderado-cloud' ? {
      discoverGatewayRoutes: (signal?: AbortSignal) => fetchGatewayRoutes(baseUrl, { fetchImpl, signal }),
    } : {}),
  };
}

  /** The outcome of one bounded agent turn. */
export interface RunOutcome {
  status: string;
  finalMessage: string | null;
  model: string;
  totalSteps: number;
  sessionId: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/** A discovered model paired with its cost classification, for the picker. */
export interface ModelOption {
  id: string;
  accessTier: string;
  toolSupport: string;
  isFree: boolean;
  provider?: string;
  ownedBy?: string;
  capabilities?: string[];
  dataNote?: string;
}

/**
 * Composition root for the Desktop agent.
 *
 * It injects the vendored core loop with a concrete provider, the jailed tool
 * registry, the fail-closed approval handler, and an event consumer. The
 * renderer can ask for a run and answer approvals; it cannot grant itself tool
 * permissions or supply credentials.
 */
export class AgentHost implements IApprovalHandler {
  private readonly options: AgentHostOptions;
  private approvals: ApprovalCoordinator;
  private approvalTimeoutMs: number | undefined;
  private router = new DesktopModelRouter({ providerId: 'fake', inventory: [], allowPaid: false, allowUnknown: false, requireTools: true });
  private catalogConnectionId = 'fake';
  /**
   * Where provider keys come from. Overridable so tests never reach the real
   * Windows Credential Manager; production injects `WindowsCredentialStore`.
   */
  private readonly credentials: CredentialStore;
  private controller: AbortController | null = null;
  private running = false;
  private readonly sessions: SessionStore;
  private current: StoredSession | null = null;
  /** Set by `startNewSession` so the next run does not resume the latest chat. */
  private newSessionPending = false;

  constructor(options: AgentHostOptions) {
    this.options = options;
    this.approvalTimeoutMs = options.getPreferences ? options.getPreferences().approvalTimeoutSeconds * 1000 : options.approvalTimeoutMs;
    this.approvals = new ApprovalCoordinator({
      prompt: options.promptForApproval,
      timeoutMs: this.approvalTimeoutMs,
      nonInteractive: options.nonInteractive,
    });
    this.sessions = new SessionStore(options.moderadoHome);
    this.credentials = options.credentialStore ?? new MemoryCredentialStore();
  }

  /** The session the current turn belongs to, if one has started. */
  get session(): StoredSession | null {
    return this.current;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Cancels the active run and denies anything awaiting a decision. */
  cancel(reason = 'Cancelled by the user.'): void {
    this.controller?.abort();
    this.approvals.denyAll('cancelled', reason);
  }

  /** Starts a fresh session: the next run creates a chat instead of resuming one. */
  startNewSession(): void {
    this.current = null;
    this.newSessionPending = true;
  }

  /** Resumes a recorded session for the next run; validated by the caller. */
  resumeRecordedSession(session: StoredSession): void {
    this.current = session;
    this.newSessionPending = false;
  }

  /** Remove one recorded chat after the editor has confirmed the user's request. */
  deleteSession(id: string): boolean {
    if (this.controller || this.running) throw new Error('Chat history cannot be deleted while a run is active.');
    const deleted = this.sessions.deleteSession(this.options.workspaceRoot, id);
    if (this.current?.id === id) this.current = null;
    return deleted;
  }

  /** Denies pending approvals, e.g. when the chat view is disposed. */
  dispose(): void {
    this.cancel('The Moderado view was closed.');
  }

  /**
   * The core's approval entry point. Routed through the coordinator so the
   * returned decision id is matched, a real deadline is enforced, and a missing
   * preview, closed view, or cancellation denies instead of approving.
   */
  async requestApproval(request: ApprovalRequest, signal?: AbortSignal): Promise<ApprovalDecision> {
    return this.approvals.requestApproval(request, signal);
  }

  /**
   * Runs one bounded agent turn against the vendored core.
   *
   * Plan mode is enforced as read-only through core policy, so a plan-mode run
   * cannot mutate files or run commands regardless of any earlier approval.
   */
  async startRun(input: {
    task: string;
    images?: ImageAttachment[];
    planMode?: boolean;
    conversationHistory?: ChatMessage[];
    session?: StoredSession;
    modelId?: string;
  }): Promise<RunOutcome> {
    if (this.running) throw new Error('A Moderado run is already in progress.');

    const configuredPreferences = this.options.getPreferences?.();
    const preferences = configuredPreferences ? { ...configuredPreferences } : undefined;
    const timeoutMs = preferences ? preferences.approvalTimeoutSeconds * 1000 : this.options.approvalTimeoutMs;
    if (timeoutMs !== this.approvalTimeoutMs) {
      this.approvals.denyAll('cancelled', 'Approval settings changed before the next task.');
      this.approvalTimeoutMs = timeoutMs;
      this.approvals = new ApprovalCoordinator({ prompt: this.options.promptForApproval,
        timeoutMs, nonInteractive: this.options.nonInteractive });
    }
    const controller = new AbortController();
    this.controller = controller;
    this.running = true;

    // Resume the supplied session, or the latest for this workspace, or start
    // a new one. Resuming keeps the conversation the CLI can also read. After
    // `startNewSession`, skip the latest chat so New Session really is new.
    const freshSession = () => createSession(this.options.workspaceRoot, { mode: input.planMode ? 'Plan' : 'Execute' });
    const session =
      input.session ??
      (this.newSessionPending
        ? freshSession()
        : this.sessions.loadLatestSession(this.options.workspaceRoot) ?? freshSession());
    this.newSessionPending = false;
    this.current = session;

    try {
      const history = input.conversationHistory ?? conversationOf(session.messages);
      const scope = { workspaceRoot: this.options.workspaceRoot, sessionId: session.id, home: this.options.moderadoHome };
      const images = input.images?.map(image => ImageAttachmentSchema.parse(image)) ?? [];
      if (images.length) saveImageContext(input.task, images, scope);
      const imageContext = loadImageContext([...history, { role: 'user', content: input.task }], scope);
      // The provider is resolved from the shared profile. When no usable
      // connection exists it falls back to the fake adapter and says so, rather
      // than silently pretending a real run happened.
      const state = readConfig(this.options.moderadoHome);
      const resolution = await resolveProvider(
        state,
        this.credentials,
        process.env,
        this.options.fetchImpl,
        imageContext,
        configPath(this.options.moderadoHome),
      );
      const { adapter: provider, reason } = resolution;
      if (reason) {
        this.options.onEvent({
          type: 'error',
          code: 'provider_unavailable',
          message: reason,
          recoverable: true,
          timestamp: Date.now(),
        });
      }
      const { inventory, routes } = await this.discoverInventory(resolution, controller.signal);
      this.catalogConnectionId = resolution.connectionId ?? provider.id;
      this.router = this.routerFor(resolution, inventory, routes, preferences);
      const requested = input.modelId || this.options.pinnedModelId
        || (state.kind === 'ok' && typeof state.config.defaultModel === 'string' ? state.config.defaultModel : undefined)
        || resolution.defaultModel;
      if (requested !== undefined && !ModelIdSchema.safeParse(requested).success) throw new Error('The selected model ID is malformed.');
      // The GUI passes the host-side selection, but the host still refuses an
      // explicit id the connection cannot serve: it must be AUTO, a discovered
      // route, or a pin already saved in the profile. Saved pins stay valid so
      // a stale catalog cannot brick an existing configuration.
      if (input.modelId && input.modelId !== 'auto') {
        const savedPin = (state.kind === 'ok' && state.config.defaultModel === input.modelId)
          || resolution.defaultModel === input.modelId
          || this.options.pinnedModelId === input.modelId;
        if (!savedPin && !inventory.some((entry) => entry.id === input.modelId)) {
          throw new Error(`The selected model '${input.modelId}' is not available from this connection. Open Moderado Settings to refresh models or choose another.`);
        }
      }
      const policy = new PolicyManager({
        readOnly: input.planMode ?? false,
        nonInteractive: this.options.nonInteractive ?? false,
      });
      const result = await new AgentLoop().run(input.task, {
        workspaceRoot: this.options.workspaceRoot,
        provider,
        tools: this.toolsFor(preferences?.webSearchEnabled ?? true, input.planMode ?? false),
        skillContext: [
          preferences ? `Respond in ${preferences.preferredLanguage}.` : undefined,
          'For simple conversational questions, answer directly and briefly. Do not volunteer the active model or session details unless asked.',
        ].filter(Boolean).join('\n'),
        approvalHandler: this,
        router: this.router,
        policy,
        signal: controller.signal,
        conversationHistory: history,
        modelInventory: inventory,
        eventListener: (event) => this.options.onEvent(event),
        routeOptions: {
          pinnedModelId: requested === 'auto' ? undefined : requested,
          allowPaid: preferences?.allowPaidModels ?? this.options.allowPaid ?? false,
          allowUnknown: preferences?.allowUnknownModels ?? this.options.allowUnknown ?? false,
          requireTools: true,
        },
      });

      // Persist the turn so the conversation survives a restart and stays
      // readable by the CLI. A failed save must not lose the turn's result.
      const usage = result.usage;
      let saved: StoredSession;
      try {
        // Checked save: if the CLI touched this session since it was read, the
        // write is refused rather than silently losing one side's conversation.
        const attempt = saveSessionChecked(
          this.sessions,
          {
            ...session,
            modelId: result.selectedModel.id,
            mode: input.planMode ? 'Plan' : session.mode,
            messages: conversationOf(result.messages),
            usage: usage ? SessionStore.applyUsage(session.usage, usage, true) : session.usage,
          },
          { knownUpdatedAt: session.updatedAt },
        );
        if (!attempt.saved) {
          this.options.onEvent({
            type: 'error',
            code: 'session_conflict',
            message: attempt.conflict.reason,
            recoverable: true,
            timestamp: Date.now(),
          });
          saved = attempt.conflict.existing ?? session;
          this.current = saved;
        } else {
          saved = attempt.session;
          this.current = saved;
        }
      } catch (error) {
        this.options.onEvent({
          type: 'error',
          code: 'session_save_failed',
          message: `The run finished but its session could not be saved: ${(error as Error).message}`,
          recoverable: true,
          timestamp: Date.now(),
        });
        saved = session;
      }

      return {
        status: result.status,
        finalMessage: result.finalMessage,
        model: result.selectedModel.id,
        totalSteps: result.totalSteps,
        sessionId: saved.id,
        usage: saved.usage,
      };
    } finally {
      this.running = false;
      this.controller = null;
    }
  }

  /**
   * The engine's access tier for a model id.
   *
   * Exposed so a surface that lists models labels them with the same tier the
   * agent will route with, rather than re-deriving it and drifting.
   */
  classifyModel(modelId: string): string {
    return this.router.classifyModel(modelId).accessTier;
  }

  /**
   * Whether a model id is free under the engine's policy for a connection.
   *
   * A surface that lists models must mark free ones with the same rule routing
   * uses, or a model shown as free would still be skipped (or vice versa).
   */
  isFreeModel(modelId: string, connectionId?: string): boolean {
    const tier = connectionId && connectionId !== this.catalogConnectionId
      ? new DesktopModelRouter({ providerId: connectionId, inventory: [], allowPaid: false, allowUnknown: false, requireTools: true }).classifyModel(modelId).accessTier
      : this.router.classifyModel(modelId).accessTier;
    return tier === 'free_trial' || tier === 'local';
  }

  /**
   * Lists the discovered models with their cost classification, so the picker
   * can show paid and unknown-cost models behind their explicit opt-ins.
   */
  async discoverModels(): Promise<ModelOption[]> {
    const preferences = this.options.getPreferences?.();
    const resolution = await resolveProvider(
      readConfig(this.options.moderadoHome),
      this.credentials,
      process.env,
      this.options.fetchImpl,
      undefined,
      configPath(this.options.moderadoHome),
    );
    const { inventory, routes } = await this.discoverInventory(resolution);
    this.catalogConnectionId = resolution.connectionId ?? resolution.adapter.id;
    this.router = this.routerFor(resolution, inventory, routes, preferences);

    const models: ModelOption[] = inventory.map((entry) => {
      const classification = this.router.classifyModel(entry.id);
      const route = routes?.find(item => item.id === entry.id);
      return {
        id: entry.id,
        accessTier: classification.accessTier,
        toolSupport: classification.toolSupport,
        isFree: classification.accessTier === 'free_trial' || classification.accessTier === 'local',
        ownedBy: entry.owned_by,
        ...(route ? { provider: route.provider, capabilities: route.capabilities, dataNote: route.data_note } : {}),
      };
    });
    if (resolution.adapter.id !== 'fake') models.unshift({
      id: 'auto', accessTier: 'unknown',
      toolSupport: 'supported', isFree: false,
    });
    return models;
  }

  private routerFor(resolution: ProviderResolution, inventory: ModelInventoryEntry[], routes?: GatewayRoute[], preferences?: SettingsPreferences): DesktopModelRouter {
    return new DesktopModelRouter({ providerId: resolution.connectionId ?? resolution.adapter.id, inventory,
      gatewayAccess: routes ? new Map(routes.flatMap(route => route.access ? [[route.id, route.access] as const] : [])) : undefined,
      allowPaid: preferences?.allowPaidModels ?? this.options.allowPaid ?? false, allowUnknown: preferences?.allowUnknownModels ?? this.options.allowUnknown ?? false, requireTools: true });
  }

  private toolsFor(webSearchEnabled: boolean, planMode: boolean): IToolRegistry {
    const tools = createDefaultToolRegistry();
    const base = webSearchEnabled ? tools : {
      register: tools.register.bind(tools),
      get: (name: string) => name === 'web_search' ? undefined : tools.get(name),
      list: () => tools.list().filter(tool => tool.name !== 'web_search'),
      getDeclarations: () => tools.getDeclarations().filter(tool => tool.name !== 'web_search'),
    };
    const previewed = withToolPreviews(base, this.options.workspaceRoot);
    // Plan mode already denies every approval-gated action before the handler
    // runs. Installing a read gate there would turn "ask before reading" into
    // "cannot read at all", so the category gates apply to Act-mode runs only.
    return planMode ? previewed : withApprovalGates(previewed, this.options.isAutoApproved);
  }

  private async discoverInventory(resolution: ProviderResolution, signal?: AbortSignal): Promise<{ inventory: ModelInventoryEntry[]; routes?: GatewayRoute[] }> {
    if (!resolution.discoverGatewayRoutes) return { inventory: await resolution.adapter.discoverModels(signal) };
    const routes = await resolution.discoverGatewayRoutes(signal);
    return { routes, inventory: routes.map(route => ({ id: route.id, object: 'model', owned_by: route.owned_by ?? route.provider ?? 'moderado-cloud',
      ...(route.capabilities.includes('tools') || route.capabilities.includes('tool_calling') ? { supported_parameters: ['tools'] } : {}),
    })) };
  }

  /** Sessions recorded for this workspace, newest first. */
  listSessions(): ReturnType<SessionStore['listSessions']> {
    return this.sessions.listSessions(canonicalWorkspaceRoot(this.options.workspaceRoot));
  }
}

/** Largest existing file read to build a `write_file` replacement diff. */
const MAX_DIFF_BYTES = 2_000_000;

/**
 * Adds the missing approval preview to workspace-mutating tools.
 *
 * The vendored `write_file` tool implements no preview, and the core only
 * forwards `tool.preview()` into the approval request. Without this the
 * coordinator denies every write as having "no complete preview". The preview
 * is a unified diff of the complete replacement against the jailed target; the
 * coordinator still validates it and the human still decides.
 */
export function withToolPreviews(tools: IToolRegistry, workspaceRoot: string): IToolRegistry {
  const previewing = (tool: IToolDefinition<any>): IToolDefinition<any> => {
    if (tool.name !== 'write_file' || tool.preview) return tool;
    return {
      ...tool,
      preview: async (params, context) => {
        const { targetFile, contentPreview } = previewFor(tool.name, params, context.workspaceRoot);
        const target = typeof targetFile === 'string' ? targetFile : '';
        if (!target) throw new Error('A write preview requires a workspace path.');
        const content = String(contentPreview ?? '');
        const inside = relative(canonicalWorkspaceRoot(workspaceRoot), target);
        const shown = (inside && !inside.startsWith('..') ? inside : target).replace(/\\/g, '/');

        // Read the current content so the human sees the real change. A large
        // or unreadable file falls back to naming the complete replacement
        // rather than failing the approval outright.
        let previous: string | undefined;
        try {
          if (existsSync(target)) {
            if (statSync(target).size > MAX_DIFF_BYTES) {
              return `Replace ${shown} (${Buffer.byteLength(content, 'utf8')} bytes)\n\n${content}`;
            }
            previous = readFileSync(target, 'utf8');
          }
        } catch {
          return `Replace ${shown} (${Buffer.byteLength(content, 'utf8')} bytes)\n\n${content}`;
        }

        if (previous) return generateDiffPreview(shown, previous, previous, content).diffPreview;
        const lines = content === '' ? [] : content.split(/\r?\n/);
        return [
          previous === undefined ? '--- /dev/null' : `--- a/${shown}`,
          `+++ b/${shown}`,
          lines.length ? `@@ -0,0 +1,${lines.length} @@` : '@@ -0,0 +0,0 @@',
          ...lines.map(line => `+${line}`),
        ].join('\n');
      },
    };
  };
  return {
    register: tools.register.bind(tools),
    get: (name) => {
      const tool = tools.get(name);
      return tool ? previewing(tool) : undefined;
    },
    list: () => tools.list().map(previewing),
    getDeclarations: () => tools.getDeclarations(),
  };
}

/**
 * Adds an approval requirement to tools whose auto-approve category is off.
 *
 * The read, search, diff, and web tools ship without `requiresApproval`, so
 * disabling their composer category currently has no effect. This gate only
 * raises the requirement (never lowers it); tools that already ask keep their
 * own behavior, and the coordinator still enforces previews and deadlines.
 */
export function withApprovalGates(
  tools: IToolRegistry,
  isAutoApproved?: (toolName: string) => boolean,
): IToolRegistry {
  if (!isAutoApproved) return tools;
  const gated = (tool: IToolDefinition<any>): IToolDefinition<any> =>
    tool.requiresApproval || isAutoApproved(tool.name) ? tool : { ...tool, requiresApproval: true };
  return {
    register: tools.register.bind(tools),
    get: (name) => {
      const tool = tools.get(name);
      return tool ? gated(tool) : undefined;
    },
    list: () => tools.list().map(gated),
    getDeclarations: () => tools.getDeclarations(),
  };
}

/**
 * Builds the payload shown to the human for a proposed tool call.
 *
 * Every affected path is canonicalized inside the workspace jail, so the preview
 * names the file that would really be written rather than an unvalidated
 * model-supplied string.
 */
export function previewFor(toolName: string, parameters: unknown, workspaceRoot: string): Record<string, unknown> {
  const params = (parameters ?? {}) as Record<string, unknown>;
  const relativePath = typeof params.path === 'string' ? params.path : undefined;
  const target = relativePath && relativePath.trim() ? resolveInJail(workspaceRoot, relativePath) : undefined;

  switch (toolName) {
    case 'write_file':
      return { targetFile: target, contentPreview: String(params.content ?? '') };
    case 'edit_file':
    case 'apply_patch':
      return { targetFile: target, contentPreview: String(params.new_string ?? params.content ?? '') };
    case 'run_command':
      return { command: Array.isArray(params.command) ? params.command : [], cwd: workspaceRoot };
    default:
      return { targetFile: target };
  }
}

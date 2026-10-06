import * as vscode from 'vscode';
import { AgentEvent, ApprovalRequest } from '@moderado/contracts';
import { AgentHost, RunOutcome } from './host.js';
import { RawDecision } from './approval.js';
import { configPath, readConfig } from './profile.js';
import { updateConfigCoordinated } from './coordination.js';
import {
  WindowsCredentialStore,
  MemoryCredentialStore,
  credentialManagerAvailable,
  credentialReference,
  resolveCredential,
} from './credentials.js';
import { ChatViewState, TranscriptEntry, AutoApproveState, chatHtml, viewSnapshot } from './chat-view.js';
import {
  SettingsState,
  SettingsConnectionView,
  emptySettings,
  parseSettingsForm,
  SettingsFormValues,
} from './settings-view.js';
import {
  ProviderConnectionRecord,
  buildProviderChoices,
  buildProviderConnection,
  buildDiscoveryConnection,
  presetConnectionId,
  sortFreeFirst,
  pickDefaultModel,
} from './provider-setup.js';
import type { ConnectProvidersConfig } from './provider-setup.js';
import { discoverModelOptions } from './model-discovery.js';
import { DesktopOpenAIAdapter } from './provider-transport.js';
import { DesktopModelRouter } from './model-router.js';
import { fetchGatewayRoutes } from './provider-discovery.js';
import { authorizeGatewayInBrowser, buildGatewayConnection, persistGatewayLogin } from './gateway-login.js';

/**
 * Model discovery bound for the settings pane.
 *
 * The previous code set "Loading models…" and then re-assigned that same string
 * on success, so the pane never left the loading state. Discovery is also
 * bounded now: an endpoint that accepts the socket and never answers cannot
 * wedge the panel.
 */
const MODEL_DISCOVERY_TIMEOUT_MS = 20_000;

export interface ModeradoApi {
  /** Starts one bounded agent turn. Any mutation still requires human approval. */
  startRun(task: string, options?: { planMode?: boolean }): Promise<RunOutcome>;
  listSessions(): ReturnType<AgentHost['listSessions']>;
  cancel(reason?: string): void;
}

/**
 * The webview view id. Must match `contributes.views.moderado[].id` in
 * package.json; VS Code resolves `<id>.focus` against it.
 */
const chatViewProviderId = 'moderado.chatView';

/**
 * Extension entry point.
 *
 * The renderer boundary is deliberately thin: the webview may post a prompt or
 * an approval answer and nothing else. It never receives provider credentials
 * and cannot grant its own tool permissions.
 */
export function activate(context: vscode.ExtensionContext): ModeradoApi {
  const output = vscode.window.createOutputChannel('Moderado');
  context.subscriptions.push(output);

  const config = () => vscode.workspace.getConfiguration('moderado');
  const pendingApprovals = new Map<string, (raw: RawDecision | undefined) => void>();
  /**
   * The request behind each id, kept so a sidebar "show full diff" action can
   * open the complete proposed change. Deny-by-default: this only ever feeds a
   * read-only preview and can never authorize anything on its own.
   */
  const pendingApprovalRequests = new Map<string, ApprovalRequest>();
  const settings: SettingsState = emptySettings();
  const credentialStore = credentialManagerAvailable() ? new WindowsCredentialStore() : new MemoryCredentialStore();
  let discoveryRequest = 0;
  let settingsBusy = false;
  let loginAbort: AbortController | undefined;
  /** Auto-approve categories. Every one starts denied (AGENTS.md section 4). */
  const autoApprove: AutoApproveState & { requiresApprovalByDefault: boolean } = {
    expanded: false,
    readFiles: false,
    editFiles: false,
    executeCommands: false,
    fetchWeb: false,
    useMcp: false,
    // Recorded so the panel can state the policy rather than implying it.
    requiresApprovalByDefault: true,
  };
  let chatView: vscode.WebviewView | undefined;
  // True once the webview document has been written; see render().
  let documentRendered = false;

  // Prefer the real editor workspace root so a session directory matches what the
  // CLI would derive for the same folder.
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  const view: ChatViewState & { planMode: boolean } = {
    transcript: [],
    running: false,
    pendingApproval: null,
    planMode: false,
    settings,
    autoApprove,
    recents: [],
    workspaceLabel: workspaceRoot.split(/[\\/]/).pop() ?? '',
  };

  /**
   * Refreshes the composer footer's provider/model identity from validated
   * host state only. The webview never contributes to these fields; the model
   * id comes from the shared profile or the validated Settings selection.
   */
  function syncActiveContext(): void {
    // Mirror the run's connection precedence: the active connection, else the
    // first saved one. An unsaved preset selection in the pane is not the
    // connection a run would use, so it never appears here.
    const connectionId = settings.activeConnectionId || settings.savedConnections[0]?.id || '';
    const active = settings.savedConnections.find((c) => c.id === connectionId);
    const choice = settings.providers.find((p) => p.value === connectionId);
    const name = active?.displayName || choice?.label || connectionId;
    view.activeProviderName = name || undefined;
    view.activeModelId = settings.defaultModel || undefined;
  }

  // Seed the footer from the shared profile so the composer shows the active
  // context before Settings is ever opened. A corrupt profile seeds nothing;
  // it is reported when the pane opens rather than guessed at here.
  (() => {
    const state = readConfig();
    if (state.kind !== 'ok') return;
    settings.activeConnectionId =
      typeof state.config.activeConnectionId === 'string' ? state.config.activeConnectionId : '';
    settings.savedConnections = connectionsFromConfig(state.config);
    settings.defaultModel =
      typeof state.config.defaultModel === 'string' ? state.config.defaultModel : '';
    syncActiveContext();
  })();

  const host = new AgentHost({
    workspaceRoot,
    nonInteractive: false,
    // On Windows the key comes from Credential Manager; elsewhere the in-memory
    // default keeps Desktop usable without a keychain.
    credentialStore,
    approvalTimeoutMs: config().get<number>('approvalTimeoutSeconds', 120) * 1000,
    allowPaid: config().get<boolean>('allowPaidModels', false),
    allowUnknown: config().get<boolean>('allowUnknownModels', false),
    onEvent: (event: AgentEvent) => {
      output.appendLine(`[${event.type}] ${JSON.stringify(event, redactKey)}`);
      if (event.type === 'approval_request') {
        view.pendingApproval = event.request;
        render();
      }
      if (event.type === 'error') append({ kind: 'error', label: 'Error', text: event.message });
      if (event.type === 'assistant_delta') appendDelta(event.delta);
    },
    promptForApproval: (request, signal) => askHuman(request, signal),
  });

  context.subscriptions.push({ dispose: () => host.dispose() });

  /** Coalesces streamed assistant text into a single transcript entry. */
  let streaming: { text: string } | null = null;
  function appendDelta(delta: string): void {
    if (!streaming) {
      streaming = { text: '' };
      view.transcript.push({ kind: 'assistant', label: 'Moderado', text: '' });
      if (view.transcript.length > 200) view.transcript.shift();
    }
    streaming.text += delta;
    const entry = view.transcript[view.transcript.length - 1];
    entry.text = streaming.text;
    render();
  }
  function endStreaming(): void {
    streaming = null;
  }

  /**
   * Asks through a modal dialog when no chat view is open, and through the
   * webview's own allow/deny buttons when one is. Both are keyboard reachable;
   * dismissal or a closed view denies.
   */
  async function askHuman(request: ApprovalRequest, signal: AbortSignal): Promise<RawDecision | undefined> {
    if (chatView) {
      view.pendingApproval = request;
      pendingApprovalRequests.set(request.requestId, request);
      render();
      const answer = await new Promise<RawDecision | undefined>((resolve) => {
        pendingApprovals.set(request.requestId, (raw) => {
          pendingApprovals.delete(request.requestId);
          pendingApprovalRequests.delete(request.requestId);
          view.pendingApproval = null;
          endStreaming();
          render();
          resolve(raw);
        });
        signal.addEventListener('abort', () => {
          if (!pendingApprovals.delete(request.requestId)) return;
          view.pendingApproval = null;
          resolve(undefined);
        }, { once: true });
      });
      return answer;
    }

    const label = `Allow ${request.toolName}: ${request.actionSummary}`;
    const detailParts = [
      request.exactPayload.targetFile ? `Target: ${request.exactPayload.targetFile}` : undefined,
      request.exactPayload.command?.length ? `Command: ${request.exactPayload.command.join(' ')}` : undefined,
      request.exactPayload.cwd ? `Working directory: ${request.exactPayload.cwd}` : undefined,
    ].filter(Boolean) as string[];

    const choice = await Promise.race([
      vscode.window.showInformationMessage(label, { modal: true, detail: detailParts.join('\n') }, 'Allow', 'Deny'),
      new Promise<undefined>((resolve) => signal.addEventListener('abort', () => resolve(undefined), { once: true })),
    ]);

    // The view was closed or dismissed without choosing.
    if (choice !== 'Allow') return { requestId: request.requestId, status: 'denied', reason: 'Deny' };
    return { requestId: request.requestId, status: 'approved' };
  }

  /**
 * Opens the full proposed change as a read-only editor tab.
 *
 * The sidebar is too narrow for a diff, but the human must still be able to read
 * the whole thing before deciding. The tab is read-only: the approval decision is
 * made in the sidebar, never in the preview.
 */
async function openDiffTab(requestId: string): Promise<void> {
  const request = pendingApprovalRequests.get(requestId);
  if (!request) return;
  const body = request.exactPayload.diffPreview || request.exactPayload.contentPreview;
  if (!body) return;
  const document = await vscode.workspace.openTextDocument({
    language: 'diff',
    content: body,
  });
  await vscode.window.showTextDocument(document, {
    preview: true,
    viewColumn: vscode.ViewColumn.One,
  });
}

/** A connection as it appears in the profile, with only display-safe fields. */
  function connectionsFromConfig(config: Record<string, unknown>): SettingsConnectionView[] {
    const connections = (config.connections ?? {}) as Record<string, Record<string, unknown>>;
    return Object.entries(connections)
      .filter(([id, value]) => id.trim() && value && typeof value === 'object')
      .map(([id, value]) => ({
        id,
        displayName: typeof value.displayName === 'string' && value.displayName.trim()
          ? value.displayName.trim()
          : id,
        baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
        kind: typeof value.kind === 'string' ? value.kind : 'openai-compatible',
        // Only the presence of a credential is ever surfaced, never the value.
        hasCredential: Boolean(value.credentialReference || value.apiKey),
        defaultModel: typeof value.defaultModel === 'string' ? value.defaultModel : undefined,
      }));
  }

  /**
   * Rebuilds the pane from the shared profile.
   *
   * A corrupt profile blocks the pane instead of rendering empty defaults: the
   * CLI loader would return an empty config here, and saving over that would
   * destroy data that was never successfully read.
   */
  async function loadSettingsState(status?: string, options: { skipModels?: boolean } = {}): Promise<void> {
    const skipModels = options.skipModels === true;
    const state = readConfig();
    settings.open = true;
    settings.profileError = undefined;
    settings.models = [];
    settings.allowPaid = config().get<boolean>('allowPaidModels', false);
    settings.allowUnknown = config().get<boolean>('allowUnknownModels', false);
    if (status) {
      // Show the in-flight text immediately, then let the settled outcome below
      // replace it. Re-using the placeholder as the final value is what left the
      // pane stuck on "Loading models…".
      settings.status = status;
      render();
    }

    // Desktop owns the provider presets; the shared profile controls availability.
    const connectConfig = readConnectProviders(state);
    settings.providers = buildProviderChoices(connectConfig).map((choice) => ({
      value: choice.value,
      label: choice.label,
      description: choice.description,
      tag: choice.tag,
      baseUrl: choice.baseUrl,
      defaultModel: choice.defaultModel,
      requiresApiKey: choice.requiresApiKey,
      custom: choice.value === 'openai-compatible' || choice.value.startsWith('custom:'),
    }));

    if (state.kind === 'invalid') {
      settings.savedConnections = [];
      settings.activeConnectionId = '';
      settings.baseUrl = '';
      settings.displayName = '';
      settings.apiKeyStored = false;
      settings.defaultModel = '';
      settings.profilePath = configPath();
      settings.preset = settings.providers[0]?.value ?? '';
      settings.profileError = state.error;
      render();
      return;
    }

    const profileConfig = state.kind === 'ok' ? state.config : {};
    settings.savedConnections = connectionsFromConfig(profileConfig);
    settings.activeConnectionId =
      typeof profileConfig.activeConnectionId === 'string' ? profileConfig.activeConnectionId : '';
    settings.defaultModel = typeof profileConfig.defaultModel === 'string' ? profileConfig.defaultModel : '';
    // The resolved path is shown so the user can confirm Desktop is reading the
    // same `~/.moderado/config.json` the CLI writes, on Windows included.
    settings.profilePath = configPath();

    // Preselect the provider that is already connected, so reopening the pane
    // shows the current state rather than resetting the user to the first entry.
    settings.preset = settings.activeConnectionId ||
      settings.providers[0]?.value ||
      '';

    const record = (profileConfig.connections ?? {}) as Record<string, Record<string, unknown>>;
    const activeRecord = record[settings.activeConnectionId];
    settings.displayName =
      typeof activeRecord?.displayName === 'string' ? activeRecord.displayName : '';
    settings.baseUrl = typeof activeRecord?.baseUrl === 'string' ? activeRecord.baseUrl : '';
    settings.loginMethod = activeRecord?.authMethod === 'manual' || activeRecord?.authMethod === 'browser' ? activeRecord.authMethod : 'public';

    // Only the *presence* of a credential reaches the renderer. The key itself
    // must never be read back, so it is never loaded here.
    settings.apiKeyStored = Boolean(
      activeRecord?.credentialReference || activeRecord?.apiKey,
    );

    // Model discovery needs a working provider; without one it fails, and that
    // failure is shown rather than leaving an empty, unexplained list.
    //
    // Skipped when the caller is about to load models for a specific preset, so
    // opening the pane does not query one provider and then immediately another.
    if (skipModels) {
      render();
      return;
    }
    const result = await discoverModelOptions(
      () => host.discoverModels(),
      MODEL_DISCOVERY_TIMEOUT_MS,
    );
    settings.models = sortFreeFirst(result.models);
    settings.defaultModel = pickDefaultModel(settings.models, settings.defaultModel);
    // Only an explicit in-flight message may override the settled outcome.
    settings.status = result.status;
    render();
  }

  /** Reads `connectProviders` defensively; the CLI ignores anything malformed. */
  function readConnectProviders(state: ReturnType<typeof readConfig>): ConnectProvidersConfig | undefined {
    if (state.kind !== 'ok') return undefined;
    const raw = state.config.connectProviders;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const record = raw as Record<string, unknown>;
    const custom = Array.isArray(record.custom)
      ? record.custom.filter(
        (item): item is { id: string; name: string; baseUrl: string; defaultModel?: string } =>
          !!item && typeof item === 'object' &&
          typeof (item as Record<string, unknown>).id === 'string' &&
          typeof (item as Record<string, unknown>).name === 'string' &&
          typeof (item as Record<string, unknown>).baseUrl === 'string',
      )
      : undefined;
    const enabled = Array.isArray(record.enabled)
      ? (record.enabled.filter((id): id is string => typeof id === 'string'))
      : undefined;
    return { ...(enabled ? { enabled } : {}), ...(custom ? { custom } : {}) };
  }

  /** Resolve secrets only in the extension host. */
  async function storedKey(id: string, stored: Record<string, unknown> | undefined): Promise<string | undefined> {
    return resolveCredential(
      process.env[`MODERADO_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`],
      typeof stored?.credentialReference === 'string' ? stored.credentialReference : undefined,
      typeof stored?.apiKey === 'string' ? stored.apiKey : undefined,
      credentialStore,
    );
  }

  function connectionRecord(config: Record<string, unknown>, id: string): Record<string, unknown> | undefined {
    const records = config.connections;
    if (!records || typeof records !== 'object' || Array.isArray(records)) return undefined;
    const value = (records as Record<string, unknown>)[id];
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  }

  function applySettingsForm(form: SettingsFormValues): void {
    settings.preset = form.preset;
    settings.displayName = form.displayName;
    settings.baseUrl = form.baseUrl;
    settings.loginMethod = form.loginMethod;
    if (form.modelId) settings.defaultModel = form.modelId;
  }

  /** Discover a pending connection without requiring or revealing a new key. */
  async function loadModelsForPreset(preset: string, pending?: SettingsFormValues): Promise<void> {
    const request = ++discoveryRequest;
    settings.open = true;
    const profile = readConfig();
    if (profile.kind === 'invalid') {
      settings.profileError = profile.error;
      settings.status = profile.error;
      render();
      return;
    }
    const profileConfig = profile.kind === 'ok' ? profile.config : {};
    const stored = connectionRecord(profileConfig, presetConnectionId(preset));
    const choice = settings.providers.find(p => p.value === preset);
    settings.preset = preset;
    settings.models = [];
    settings.baseUrl = pending?.baseUrl || (typeof stored?.baseUrl === 'string' ? stored.baseUrl : choice?.baseUrl ?? '');
    settings.displayName = pending?.displayName || (typeof stored?.displayName === 'string' ? stored.displayName : '');
    settings.loginMethod = pending?.loginMethod ?? (stored?.authMethod === 'manual' || stored?.authMethod === 'browser' ? stored.authMethod : 'public');
    const currentModel = pending?.modelId || (profileConfig.activeConnectionId === presetConnectionId(preset) && typeof profileConfig.defaultModel === 'string' ? profileConfig.defaultModel : undefined)
      || (typeof stored?.defaultModel === 'string' ? stored.defaultModel : 'auto');
    settings.defaultModel = currentModel;
    settings.status = 'Loading models?';
    render();

    const result = await discoverModelOptions(async () => {
      const apiKey = settings.loginMethod === 'public' && preset === 'moderado-cloud' ? undefined : await storedKey(presetConnectionId(preset), stored);
      // A public catalog may work without a stored credential.
      const connection = buildDiscoveryConnection({ preset, apiKey, storedBaseUrl: settings.baseUrl,
        displayName: settings.displayName, defaultModel: currentModel }, readConnectProviders(profile));
      if (choice) { choice.hasCredential = Boolean(apiKey); choice.storedBaseUrl = connection.baseUrl; }
      if (request === discoveryRequest) settings.apiKeyStored = Boolean(apiKey);
      const routes = connection.id === 'moderado-cloud' ? await fetchGatewayRoutes(connection.baseUrl) : undefined;
      const inventory = routes ? routes.map(route => ({ id: route.id, object: 'model' as const, owned_by: route.owned_by ?? route.provider ?? 'moderado-cloud',
        ...(route.capabilities.includes('tools') || route.capabilities.includes('tool_calling') ? { supported_parameters: ['tools'] } : {}) }))
        : await new DesktopOpenAIAdapter({ id: connection.id, name: connection.displayName, baseUrl: connection.baseUrl, apiKey }).discoverModels();
      const router = new DesktopModelRouter({ providerId: connection.id, inventory, allowPaid: settings.allowPaid ?? false,
        allowUnknown: settings.allowUnknown ?? false, requireTools: true });
      return [{ id: 'auto', accessTier: routes ? 'free_trial' : 'unknown', isFree: Boolean(routes), toolSupport: 'supported' }, ...inventory.map(entry => {
        const classification = router.classifyModel(entry.id);
        const route = routes?.find(item => item.id === entry.id);
        return { id: entry.id, accessTier: classification.accessTier, toolSupport: classification.toolSupport,
          isFree: classification.accessTier === 'free_trial' || classification.accessTier === 'local',
          ownedBy: entry.owned_by, ...(route ? { provider: route.provider, capabilities: route.capabilities, dataNote: route.data_note } : {}) };
      })];
    }, MODEL_DISCOVERY_TIMEOUT_MS);
    if (request !== discoveryRequest || !settings.open) return;
    settings.models = sortFreeFirst(result.models);
    settings.defaultModel = pickDefaultModel(settings.models, currentModel);
    settings.status = result.status;
    render();
  }

  async function openSettingsPane(): Promise<void> {
    await loadSettingsState(undefined, { skipModels: true });
    if (!settings.profileError) await loadModelsForPreset(settings.preset || settings.providers[0]?.value || 'moderado-cloud');
  }

  async function refreshModelsForPendingForm(message: unknown): Promise<void> {
    const parsed = parseSettingsForm(message);
    settings.open = true;
    if (!parsed.ok) { settings.status = parsed.error; render(); return; }
    await loadModelsForPreset(parsed.value.preset, parsed.value);
  }

  /** Points an existing profile connection at being active. */
  async function useConnection(id: string): Promise<void> {
    const state = readConfig();
    if (state.kind !== 'ok') {
      settings.status = state.kind === 'invalid' ? state.error : 'No profile to update.';
      render();
      return;
    }
    const record = (state.config.connections ?? {}) as Record<string, unknown>;
    if (!record[id]) {
      settings.status = 'That connection is no longer in the shared profile.';
      render();
      return;
    }
    const result = updateConfigCoordinated(configPath(), { activeConnectionId: id });
    if (!result.written) {
      settings.status = result.conflict?.reason ?? result.reason ?? 'Could not switch connection.';
      render();
      return;
    }
    await loadSettingsState(`Active connection is now ${id}.`);
  }

  /** Nonsecret form values are validated before native login or coordinated writes. */
  async function saveSettings(message: unknown, action: 'save' | 'key' | 'browser' = 'save'): Promise<void> {
    settings.open = true;
    const parsed = parseSettingsForm(message);
    if (!parsed.ok) { settings.status = parsed.error; render(); return; }
    if (settingsBusy) return;
    const profile = readConfig();
    if (profile.kind === 'invalid') { settings.profileError = profile.error; settings.status = profile.error; render(); return; }
    const form = parsed.value;
    const profileConfig = profile.kind === 'ok' ? profile.config : {};
    const connectConfig = readConnectProviders(profile);
    const choice = buildProviderChoices(connectConfig).find(item => item.value === form.preset);
    if (!choice) { settings.status = 'That provider is no longer available.'; render(); return; }
    if (action === 'browser' && (form.preset !== 'moderado-cloud' || form.loginMethod !== 'browser')) return;
    if (action === 'key' && form.preset === 'moderado-cloud' && form.loginMethod !== 'manual') return;
    applySettingsForm(form);
    settingsBusy = true;
    loginAbort = new AbortController();
    const signal = loginAbort.signal;
    try {
      // Validate the endpoint before collecting a credential or opening a browser.
      const discovery = buildDiscoveryConnection({ preset: form.preset, storedBaseUrl: form.baseUrl,
        displayName: form.displayName, defaultModel: form.modelId || 'auto' }, connectConfig);
      const stored = connectionRecord(profileConfig, discovery.id);
      let apiKey = await storedKey(discovery.id, stored);
      let connection: ProviderConnectionRecord;
      if (discovery.id === 'moderado-cloud') {
        if (form.loginMethod === 'public') {
          connection = buildGatewayConnection('public', { baseUrl: discovery.baseUrl });
        } else {
          if (!credentialManagerAvailable()) throw new Error('Windows Credential Manager is required to store a Gateway login.');
          if (form.loginMethod === 'browser') {
            const expiry = typeof stored?.credentialExpiresAt === 'number' ? stored.credentialExpiresAt : undefined;
            if (action === 'browser' || !apiKey || !expiry || expiry <= Date.now() || stored?.authMethod !== 'browser') {
              settings.status = 'Waiting for browser sign-in?'; render();
              const credential = await authorizeGatewayInBrowser({ openExternal: url => Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(url))), signal });
              if (signal.aborted) throw new Error('Gateway login cancelled.');
              connection = await persistGatewayLogin('browser', { baseUrl: discovery.baseUrl, key: credential.accessToken, expiresAt: credential.expiresAt }, credentialStore);
            } else connection = buildGatewayConnection('browser', { baseUrl: discovery.baseUrl, key: apiKey, expiresAt: expiry });
          } else {
            if (action === 'key' || !apiKey || stored?.authMethod === 'browser') {
              apiKey = await vscode.window.showInputBox({ prompt: 'Gateway key beginning with mrd_ (stored in Windows Credential Manager)', password: true, ignoreFocusOut: true });
              if (apiKey === undefined || signal.aborted) throw new Error('Gateway key entry cancelled.');
            }
            connection = await persistGatewayLogin('manual', { baseUrl: discovery.baseUrl, key: apiKey.trim() }, credentialStore);
          }
        }
        connection.defaultModel = form.modelId || 'auto';
      } else {
        if ((action === 'key' || (choice.requiresApiKey && !apiKey))) {
          if (!credentialManagerAvailable()) throw new Error('This platform has no Credential Manager. Set the provider environment variable instead.');
          apiKey = await vscode.window.showInputBox({ prompt: 'API key (stored in Windows Credential Manager)', password: true, ignoreFocusOut: true });
          if (apiKey === undefined || signal.aborted) throw new Error('API key entry cancelled.');
          if (!apiKey.trim()) throw new Error('Enter a nonempty API key.');
        }
        connection = buildProviderConnection({ preset: form.preset, apiKey, baseUrl: form.baseUrl,
          displayName: form.displayName, defaultModel: form.modelId || 'auto' }, connectConfig);
        // NVIDIA's fixed endpoint still needs to persist the chosen model.
        connection.defaultModel = form.modelId || 'auto';
        if (apiKey && (action === 'key' || !stored?.credentialReference)) {
          if (!credentialManagerAvailable()) throw new Error('This platform has no Credential Manager. Set the provider environment variable instead.');
          await credentialStore.set(credentialReference(connection.id), apiKey.trim());
          connection.credentialReference = credentialReference(connection.id);
        } else if (typeof stored?.credentialReference === 'string') connection.credentialReference = stored.credentialReference;
      }
      if (signal.aborted) throw new Error('Provider connection cancelled.');
      const saved = { ...stored, ...connection, apiKey: undefined,
        ...(discovery.id === 'moderado-cloud' ? {
          credentialReference: connection.credentialReference,
          credentialExpiresAt: 'credentialExpiresAt' in connection ? connection.credentialExpiresAt : undefined,
        } : {}) };
      const result = updateConfigCoordinated(configPath(), {
        connections: { [connection.id]: saved }, activeConnectionId: connection.id, defaultModel: connection.defaultModel,
      }, { expected: { connections: profileConfig.connections, activeConnectionId: profileConfig.activeConnectionId, defaultModel: profileConfig.defaultModel } });
      if (!result.written) { settings.status = result.conflict?.reason ?? result.reason ?? 'Could not save the settings.'; render(); return; }
      await loadSettingsState('Saved.', { skipModels: true });
      await loadModelsForPreset(form.preset);
    } catch {
      // Never expose native input, credential service errors, or OAuth responses.
      settings.status = signal.aborted ? 'Provider connection cancelled.' : 'Provider connection failed or key entry was cancelled. Check the endpoint, key, and login method, then retry.';
      render();
    } finally {
      settingsBusy = false;
      loginAbort = undefined;
    }
  }

  /** Handles every message the chat webview can send. */
  function handleWebviewMessage(message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const msg = message as Record<string, unknown>;
    if (['apiKey', 'token', 'authorizationCode', 'credentialReference'].some(field => field in msg)) {
      settings.open = true;
      settings.status = 'Provider credentials must be entered in the secure editor prompt.';
      render();
      return;
    }
    if (msg.type === 'toggleAutoApprovePanel') {
      autoApprove.expanded = !autoApprove.expanded;
      render();
      return;
    }
    if (msg.type === 'setAutoApprove' && typeof msg.key === 'string' && typeof msg.value === 'boolean') {
      // Auto-approving a mutation is an explicit human act, so it is applied only
      // for a known category and the renderer cannot invent one.
      const keys = ['readFiles', 'editFiles', 'executeCommands', 'fetchWeb', 'useMcp'] as const;
      if (!(keys as readonly string[]).includes(msg.key)) return;
      autoApprove[msg.key as (typeof keys)[number]] = msg.value;
      autoApprove.requiresApprovalByDefault = true;
      output.appendLine(`auto-approve ${msg.key} = ${msg.value}`);
      render();
      return;
    }
    if (msg.type === 'setMode' && (msg.mode === 'Plan' || msg.mode === 'Act')) {
      view.planMode = msg.mode === 'Plan';
      render();
      return;
    }
    if (msg.type === 'setModelTab' && (msg.tab === 'free' || msg.tab === 'all')) {
      const parsed = parseSettingsForm(msg);
      if (parsed.ok) applySettingsForm(parsed.value);
      settings.modelTab = msg.tab;
      render();
      return;
    }
    if (msg.type === 'setSettingsPage' && typeof msg.page === 'string') {
      settings.page = msg.page;
      render();
      return;
    }
    if (msg.type === 'chooseModel' && typeof msg.id === 'string') {
      const parsed = parseSettingsForm(msg);
      if (!parsed.ok || !settings.models.some(model => model.id === msg.id)) return;
      applySettingsForm(parsed.value);
      settings.defaultModel = msg.id;
      render();
      return;
    }
    if (msg.type === 'newTask') {
      view.transcript = [];
      view.pendingApproval = null;
      render();
      return;
    }
    if (msg.type === 'openSession' && typeof msg.id === 'string') {
      void vscode.commands.executeCommand('moderado.showSessions');
      return;
    }
    if (msg.type === 'openSettings') {
      void openSettingsPane();
      return;
    }
    if (msg.type === 'closeSettings') {
      loginAbort?.abort();
      discoveryRequest++;
      settings.open = false;
      render();
      return;
    }
    if (msg.type === 'refreshModels') {
      void refreshModelsForPendingForm(msg);
      return;
    }
    if (msg.type === 'useConnection' && typeof msg.id === 'string') {
      void useConnection(msg.id);
      return;
    }
    if (msg.type === 'selectPreset' && typeof msg.preset === 'string') {
      // Switching provider must bring that provider's key state and its free
      // models with it, without the user pressing Reload.
      void loadModelsForPreset(msg.preset);
      return;
    }
    if (msg.type === 'saveSettings') {
      void saveSettings(msg);
      return;
    }
    if (msg.type === 'setProviderKey') {
      void saveSettings(msg, 'key');
      return;
    }
    if (msg.type === 'gatewayBrowserLogin') {
      void saveSettings(msg, 'browser');
      return;
    }
    if (msg.type === 'setGatewayLoginMethod') {
      const parsed = parseSettingsForm(msg);
      if (!parsed.ok) { settings.status = parsed.error; render(); return; }
      applySettingsForm(parsed.value);
      render();
      return;
    }
    if (msg.type === 'prompt' && typeof msg.text === 'string') {
      void runPrompt(msg.text);
      return;
    }
    if (msg.type === 'cancel') {
      host.cancel();
      return;
    }
    if (msg.type === 'preview' && typeof msg.requestId === 'string') {
      // A full diff is too wide for the sidebar, so it opens as a normal editor
      // tab. The sidebar keeps the summary and the decision.
      openDiffTab(msg.requestId);
      return;
    }
    if (msg.type === 'approval' && typeof msg.requestId === 'string') {
      const settle = pendingApprovals.get(msg.requestId);
      if (!settle) return;
      // The id is echoed back so the coordinator can match it; a message that
      // names a different request cannot authorize this one.
      settle({ requestId: msg.requestId, status: msg.status === 'approved' ? 'approved' : 'denied' });
    }
  }

  /**
   * The chat lives in the activity bar sidebar, not a floating editor tab.
   *
   * `retainContextWhenHidden` matters: without it the webview is destroyed when
   * the user switches away, discarding the transcript and anything typed but
   * not yet sent.
   */
  const chatViewProvider: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView) {
      chatView = webviewView;
      webviewView.webview.options = {
        enableScripts: true,
        // The webview loads only inline content and never fetches remote sources.
        localResourceRoots: [],
      };
      webviewView.webview.html = chatHtml(view, previewText);
      documentRendered = true;
      webviewView.webview.onDidReceiveMessage(handleWebviewMessage);
      webviewView.onDidDispose(() => {
        loginAbort?.abort();
        discoveryRequest++;
        chatView = undefined;
        documentRendered = false;
        // Losing the view must deny anything still awaiting a decision.
        host.cancel('The Moderado view was closed.');
      });
      render();
    },
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(chatViewProviderId, chatViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('moderado.openChat', async () => {
      // The agent is meant to be always available; this only reveals it when the
      // sidebar is collapsed or showing another view.
      await vscode.commands.executeCommand(`${chatViewProviderId}.focus`);
    }),
    vscode.commands.registerCommand('moderado.cancelRun', () => {
      host.cancel();
      view.running = false;
      render();
      vscode.window.showInformationMessage('Moderado run cancelled.');
    }),
    vscode.commands.registerCommand('moderado.togglePlanMode', async () => {
      view.planMode = !view.planMode;
      render();
      vscode.window.showInformationMessage(
        view.planMode
          ? 'Plan mode on: file writes and commands stay blocked.'
          : 'Plan mode off.',
      );
    }),
    vscode.commands.registerCommand('moderado.openSettings', async () => {
      await openSettingsPane();
    }),
    vscode.commands.registerCommand('moderado.selectModel', async () => {
      const models = await host.discoverModels();
      // Paid and unknown-cost models stay labelled so the free-first rule is visible.
      const picked = await vscode.window.showQuickPick(
        models.map((m) => `${m.id} — ${m.accessTier}${m.isFree ? ' (free)' : ''}`),
        { placeHolder: 'Select a model. Free-first routing applies unless paid/unknown is allowed.' },
      );
      if (!picked) return;
      const modelId = picked.split(' — ')[0];
      // Coordinated write: the shared config may have changed in the CLI.
      const result = updateConfigCoordinated(configPath(), { defaultModel: modelId });
      if (result.written) {
        vscode.window.showInformationMessage(`Default model set to ${modelId}.`);
        return;
      }
      if (result.conflict) {
        vscode.window.showWarningMessage(result.conflict.reason);
        return;
      }
      vscode.window.showErrorMessage(result.reason ?? 'Could not save the choice.');
    }),
    vscode.commands.registerCommand('moderado.configureProvider', async () => {
      // Provider secrets are never typed into an editor setting or sent to a
      // renderer; only the non-secret connection fields are collected here.
      const baseUrl = await vscode.window.showInputBox({
        prompt: 'Provider base URL (leave empty to skip)',
        placeHolder: 'https://integrate.api.nvidia.com/v1',
      });
      if (baseUrl === undefined) return;
      const id = await vscode.window.showInputBox({ prompt: 'Connection id', value: 'openai-compatible' });
      if (!id?.trim()) return;
      const displayName = await vscode.window.showInputBox({ prompt: 'Display name', value: id.trim() });
      if (!displayName?.trim()) return;

      // The key is written straight to Credential Manager and only the
      // *reference* is stored in config.json. It is never echoed, never put in
      // an editor setting, and never sent to the renderer.
      const apiKey = await vscode.window.showInputBox({
        prompt: 'API key (stored in Windows Credential Manager, never in config.json)',
        password: true,
        ignoreFocusOut: true,
      });
      if (apiKey === undefined) return;

      let credentialRef: string | undefined;
      if (apiKey.trim()) {
        if (!credentialManagerAvailable()) {
          vscode.window.showWarningMessage(
            'This platform has no Credential Manager. Set the provider environment variable instead.',
          );
          return;
        }
        try {
          credentialRef = credentialReference(id.trim());
          await new WindowsCredentialStore().set(credentialRef, apiKey.trim());
        } catch {
          vscode.window.showErrorMessage(
            'Could not store the API key in Windows Credential Manager. Nothing was written to config.json.',
          );
          return;
        }
      }

      const result = updateConfigCoordinated(configPath(), {
        connections: {
          [id.trim()]: {
            id: id.trim(),
            displayName: displayName.trim(),
            kind: 'openai-compatible',
            baseUrl: baseUrl.trim(),
            ...(credentialRef ? { credentialReference: credentialRef } : {}),
          },
        },
        activeConnectionId: id.trim(),
      });
      if (result.written) {
        vscode.window.showInformationMessage(`Saved connection '${displayName.trim()}'.`);
        return;
      }
      if (result.conflict) {
        vscode.window.showWarningMessage(result.conflict.reason);
        return;
      }
      vscode.window.showErrorMessage(result.reason ?? 'Could not save the connection.');
    }),
    vscode.commands.registerCommand('moderado.showSessions', async () => {
      const { sessions, invalid } = host.listSessions();
      if (invalid.length) {
        vscode.window.showWarningMessage(
          `${invalid.length} session file(s) in this workspace could not be read and were left untouched.`,
        );
      }
      if (!sessions.length) {
        vscode.window.showInformationMessage('No recorded sessions for this workspace yet.');
        return;
      }
      await vscode.window.showQuickPick(
        sessions.map((s) => `${s.updatedAt} · ${s.mode} · ${s.modelId ?? 'no model'} · ${s.messages.length} message(s)`),
        { placeHolder: 'Recorded sessions for this workspace' },
      );
    }),
  );

  /** A cost badge for a session, or null when the engine reported no cost. */
  function costLabelOf(usage: { available?: boolean; costKnown?: boolean; totalUsd?: number } | undefined): string | null {
    if (!usage?.available || !usage.costKnown) return null;
    const value = usage.totalUsd;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return `$${value.toFixed(2)}`;
  }

  /** Rebuilds the RECENT list from the shared session store. */
  function refreshRecents(): void {
    const { sessions } = host.listSessions();
    view.recents = sessions.slice(0, 8).map((session) => ({
      id: session.id,
      // The first user message is the session's title in every practical sense;
      // it is user text, so it is escaped like any other transcript content.
      title: firstLineOf(session) || 'Untitled session',
      updatedAt: formatWhen(session.updatedAt),
      costLabel: costLabelOf(session.usage),
    }));
  }

  function firstLineOf(session: { messages: { role: string; content?: unknown }[] }): string {
    const first = session.messages.find((m) => m.role === 'user');
    const text = typeof first?.content === 'string' ? first.content : '';
    return text.split('\n')[0].slice(0, 120).trim();
  }

  /** A short, human date; falls back to the raw value if unparseable. */
  function formatWhen(iso: string): string {
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) return iso;
    return when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /** Renders the current chat state into the open sidebar view, if there is one. */
  function render(): void {
    if (!chatView) return;
    // The footer follows the connection and model, so it is recomputed from
    // the current host-side settings state on every render.
    syncActiveContext();
    refreshRecents();
    // The document is written once. Later updates are pushed into the live DOM,
    // because reassigning `webview.html` destroys and rebuilds the whole webview:
    // doing that per streamed token wiped the composer and stole focus, so the
    // user could not type at all while a reply was arriving.
    if (!documentRendered) {
      chatView.webview.html = chatHtml(view, previewText);
      documentRendered = true;
      return;
    }
    void chatView.webview.postMessage({ type: 'update', ...viewSnapshot(view, previewText) });
  }

  function append(entry: TranscriptEntry): void {
    view.transcript.push(entry);
    // Keep the transcript bounded so a long session cannot grow without limit.
    if (view.transcript.length > 200) view.transcript.shift();
    render();
  }

  async function runPrompt(text: string): Promise<void> {
    append({ kind: 'user', label: 'You', text });
    view.running = true;
    render();
    try {
      // The model identity is host-side state (profile or validated Settings
      // selection). The webview contributes only the prompt text.
      const result = await host.startRun({ task: text, planMode: view.planMode, modelId: view.activeModelId });
      if (result.finalMessage) append({ kind: 'assistant', label: 'Moderado', text: result.finalMessage });
      append({ kind: 'tool', label: 'Session', text: `${result.status} · ${result.model} · ${result.totalSteps} step(s) · session ${result.sessionId}` });
    } catch (error) {
      append({ kind: 'error', label: 'Error', text: (error as Error).message });
    } finally {
      view.running = false;
      view.pendingApproval = null;
      render();
    }
  }

  // A narrow extension API. It exists so the host can be driven by an automated
  // check (including the live provider smoke probe) without going through the
  // webview. It deliberately exposes no credentials and no tool permissions: a
  // caller can start a run, list sessions, or cancel, nothing more.
  return {
    startRun: (task: string, options?: { planMode?: boolean }) =>
      host.startRun({ task, planMode: options?.planMode }),
    listSessions: () => host.listSessions(),
    cancel: (reason?: string) => host.cancel(reason),
  };
}

function previewText(request: ApprovalRequest): string {
  const parts: string[] = [];
  if (request.exactPayload.targetFile) parts.push(`Target: ${request.exactPayload.targetFile}`);
  if (request.exactPayload.cwd) parts.push(`Working directory: ${request.exactPayload.cwd}`);
  if (request.exactPayload.command?.length) parts.push(`Command: ${request.exactPayload.command.join(' ')}`);
  const body = request.exactPayload.diffPreview || request.exactPayload.contentPreview;
  if (body) parts.push(body);
  return parts.join('\n\n');
}
const SECRET_KEYS = new Set(['apiKey', 'credential', 'authorization', 'token', 'api_key']);

function redactKey(key: string, value: unknown): unknown {
  return SECRET_KEYS.has(key) ? '[redacted]' : value;
}

export function deactivate(): void {
  // Host disposal is registered as a subscription in activate().
}

import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AgentEvent, ApprovalRequest } from '@moderado/contracts';
import { resolveInJail } from '@moderado/tools';
import { AgentHost, previewFor, resolveProvider } from '../src/host.js';
import { MemoryCredentialStore } from '../src/credentials.js';
import { readConfig } from '../src/profile.js';
import { DesktopOpenAIAdapter } from '../src/provider-transport.js';
import { SessionStore } from '../src/sessions.js';

function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'moderado-m2-'));
}

function collector() {
  const events: AgentEvent[] = [];
  return { events, onEvent: (event: AgentEvent) => events.push(event) };
}

function configuredHome(id: string, connection: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  const home = mkdtempSync(join(tmpdir(), 'moderado-host-'));
  mkdirSync(join(home, '.moderado'));
  writeFileSync(join(home, '.moderado', 'config.json'), JSON.stringify({
    activeConnectionId: id, connections: { [id]: { id, kind: 'openai-compatible', ...connection } }, ...extra,
  }));
  return home;
}

function fakeHTTP(data: unknown[]) {
  return vi.fn<typeof fetch>().mockImplementation(async (_url, init) => init?.method === 'POST'
    ? new Response('data: {"choices":[{"delta":{"content":"Hello."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
    : Response.json({ object: 'list', data }));
}

describe('Desktop provider host integration', () => {
  const route = { id: 'moonshotai/kimi-k3', provider: 'nvidia-nim', owned_by: 'moonshotai', capabilities: ['chat', 'tools'], data_note: 'Gateway route' };
  const gateway = { baseUrl: 'http://127.0.0.1:4788/v1' };

  it('resolves public keyless Gateway using the Desktop transport', async () => {
    const home = configuredHome('moderado-cloud', gateway);
    const fetchImpl = fakeHTTP([route]);
    const result = await resolveProvider(readConfig(home), new MemoryCredentialStore(), {}, fetchImpl);
    expect(result.adapter).toBeInstanceOf(DesktopOpenAIAdapter);
    expect(result.adapter.id).toBe('moderado-cloud');
    expect(result.reason).toBeUndefined();
  });

  it('resolves manual Gateway credentials in the host and preserves exact pinned route/session identity', async () => {
    const home = configuredHome('moderado-cloud', { ...gateway, credentialReference: 'moderado/provider/moderado-cloud' });
    const credentials = new MemoryCredentialStore();
    await credentials.set('moderado/provider/moderado-cloud', 'mrd_offline_fixture');
    const get = vi.spyOn(credentials, 'get');
    const fetchImpl = fakeHTTP([route]);
    const { events, onEvent } = collector();
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: home, credentialStore: credentials, fetchImpl, onEvent, promptForApproval: async () => undefined });
    const result = await host.startRun({ task: 'Say hello.', modelId: route.id });
    expect(result.model).toBe(route.id);
    expect(host.session?.modelId).toBe(route.id);
    expect(host.listSessions().sessions[0].modelId).toBe(route.id);
    expect(get).toHaveBeenCalledWith('moderado/provider/moderado-cloud');
    const post = fetchImpl.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]?.body)).model).toBe(route.id);
    expect(post[1]?.headers).toMatchObject({ Authorization: 'Bearer mrd_offline_fixture' });
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'GET')).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('mrd_offline_fixture');
  });

  it('sends Gateway AUTO to the server without pinning a catalog route', async () => {
    const fetchImpl = fakeHTTP([route]);
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: configuredHome('moderado-cloud', gateway), fetchImpl, onEvent: () => {}, promptForApproval: async () => undefined });
    const result = await host.startRun({ task: 'Say hello.', modelId: 'auto' });
    expect(result.model).toBe('auto');
    const post = fetchImpl.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]?.body)).model).toBe('auto');
    expect(post[1]?.headers).not.toHaveProperty('Authorization');
  });

  it('exposes Free Gateway models with validated metadata and an AUTO row', async () => {
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: configuredHome('moderado-cloud', gateway), fetchImpl: fakeHTTP([route]), onEvent: () => {}, promptForApproval: async () => undefined });
    const models = await host.discoverModels();
    expect(models[0]).toMatchObject({ id: 'auto', isFree: true, accessTier: 'free_trial' });
    expect(models[1]).toMatchObject({ id: route.id, isFree: true, provider: route.provider, ownedBy: route.owned_by, capabilities: route.capabilities, dataNote: route.data_note, toolSupport: 'supported' });
  });

  it('uses the saved connection selection when the run does not override it', async () => {
    const home = configuredHome('moderado-cloud', { ...gateway, defaultModel: route.id });
    const fetchImpl = fakeHTTP([route]);
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: home, fetchImpl, onEvent: () => {}, promptForApproval: async () => undefined });
    expect((await host.startRun({ task: 'Say hello.' })).model).toBe(route.id);
  });

  it('treats direct AUTO as unpinned free-first selection', async () => {
    const fetchImpl = fakeHTTP([{ id: 'paid', pricing: { prompt: '1', completion: '1' } }, { id: 'free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }]);
    const home = configuredHome('openrouter', { baseUrl: 'https://example.invalid/v1', apiKey: 'offline-key', defaultModel: 'paid' });
    const { events, onEvent } = collector();
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: home, fetchImpl, onEvent, promptForApproval: async () => undefined });
    expect((await host.startRun({ task: 'Say hello.', modelId: 'auto' })).model).toBe('free');
    expect(events).toContainEqual(expect.objectContaining({ type: 'model_change', reason: 'initial_selection' }));
  });

  it('keeps direct paid and unknown candidates excluded without explicit opt-in', async () => {
    const home = configuredHome('openrouter', { baseUrl: 'https://example.invalid/v1', apiKey: 'offline-key' });
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: home, fetchImpl: fakeHTTP([{ id: 'paid', pricing: { prompt: '1', completion: '1' } }, { id: 'unknown' }]), onEvent: () => {}, promptForApproval: async () => undefined });
    await expect(host.startRun({ task: 'Say hello.', modelId: 'auto' })).rejects.toThrow(/No eligible models/);
    expect(host.isRunning).toBe(false);
  });

  it('uses the same catalog pricing for picker labels and the public free-model helper', async () => {
    const home = configuredHome('openrouter', { baseUrl: 'https://example.invalid/v1', apiKey: 'offline-key' });
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: home, fetchImpl: fakeHTTP([{ id: 'free', pricing: { prompt: '0', completion: '0' } }]), onEvent: () => {}, promptForApproval: async () => undefined });
    expect((await host.discoverModels()).find(model => model.id === 'free')?.isFree).toBe(true);
    expect(host.isFreeModel('free', 'openrouter')).toBe(true);
    expect(host.isFreeModel('free', 'unrelated-provider')).toBe(false);
  });

  it.each([
    { id: 'moderado-cloud', kind: 'openai-compatible', baseUrl: 'http://remote.invalid/v1' },
    { id: 'moderado-cloud', kind: 'openai-compatible', baseUrl: 12 },
    { id: 'other-id', kind: 'openai-compatible', baseUrl: 'https://example.invalid/v1' },
    { id: 'moderado-cloud', kind: 'made-up', baseUrl: 'https://example.invalid/v1' },
  ])('rejects malformed saved connection before HTTP or credential lookup: %j', async (connection) => {
    const store = new MemoryCredentialStore();
    const get = vi.spyOn(store, 'get');
    const fetchImpl = fakeHTTP([route]);
    await expect(resolveProvider({ kind: 'ok', config: { activeConnectionId: 'moderado-cloud', connections: { 'moderado-cloud': { ...connection, credentialReference: 'moderado/provider/moderado-cloud' } } } }, store, {}, fetchImpl)).rejects.toThrow(/connection|URL|HTTPS/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('requires renewed browser login instead of silently using public access after expiry', async () => {
    const home = configuredHome('moderado-cloud', { ...gateway, authMethod: 'browser', credentialExpiresAt: Date.now() - 1, credentialReference: 'moderado/provider/moderado-cloud' });
    await expect(resolveProvider(readConfig(home), new MemoryCredentialStore(), {}, fakeHTTP([route]))).rejects.toThrow(/expired.*sign in/i);
  });

  it('rejects a run selection that is neither auto nor available from this connection', async () => {
    // The webview never supplies the model, but the host still refuses an
    // explicit selection the discovered catalog does not contain instead of
    // sending an unknown id to the provider.
    const fetchImpl = fakeHTTP([route]);
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: configuredHome('moderado-cloud', gateway), fetchImpl, onEvent: () => {}, promptForApproval: async () => undefined });
    await expect(host.startRun({ task: 'Say hello.', modelId: 'missing/route' })).rejects.toThrow(/not available.*Settings/i);
    expect(host.isRunning).toBe(false);
    // The discovery GET may have run, but no completion request may carry the unknown id.
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });
});

describe('previewFor', () => {
  it('canonicalizes the target path inside the workspace jail', () => {
    const root = workspace();
    const preview = previewFor('write_file', { path: 'notes.md', content: 'hi' }, root) as Record<string, unknown>;
    expect(String(preview.targetFile).toLowerCase()).toContain('notes.md');
    expect(preview.contentPreview).toBe('hi');
  });

  it('rejects a path that escapes the workspace', () => {
    const root = workspace();
    expect(() => previewFor('write_file', { path: '..\\..\\evil.txt', content: 'x' }, root)).toThrow();
  });

  it('includes the command array and cwd for run_command', () => {
    const root = workspace();
    const preview = previewFor('run_command', { command: ['npm', 'test'] }, root) as Record<string, unknown>;
    expect(preview.command).toEqual(['npm', 'test']);
    expect(preview.cwd).toBe(root);
  });
});

describe('workspace jail', () => {
  it('refuses a traversal out of the workspace', () => {
    const root = workspace();
    expect(() => resolveInJail(root, '..\\..\\Windows\\System32\\drivers\\etc\\hosts')).toThrow();
  });

  it('still allows reading a file inside the workspace', () => {
    const root = workspace();
    const secret = join(root, 'secret.txt');
    writeFileSync(secret, 'top-secret');
    expect(readFileSync(resolveInJail(root, 'secret.txt'), 'utf8')).toBe('top-secret');
  });
});

describe('AgentHost approvals', () => {
  it('never writes a file when the human denies', async () => {
    const root = workspace();
    const target = join(root, 'denied.md');
    const host = new AgentHost({
      workspaceRoot: root,
      onEvent: () => {},
      promptForApproval: async (request: ApprovalRequest) => ({ requestId: request.requestId, status: 'denied' }),
    });

    const decision = await host.requestApproval({
      requestId: 'r-deny',
      toolName: 'write_file',
      actionSummary: 'Create denied.md',
      exactPayload: { targetFile: target, contentPreview: 'should not be written' },
      timestamp: Date.now(),
    });

    expect(decision.status).toBe('denied');
    expect(existsSync(target)).toBe(false);
  });

  it('does not write when no decision arrives before the deadline', async () => {
    const root = workspace();
    const host = new AgentHost({
      workspaceRoot: root,
      onEvent: () => {},
      approvalTimeoutMs: 20,
      promptForApproval: () => new Promise(() => {}),
    });

    const decision = await host.requestApproval({
      requestId: 'r-timeout',
      toolName: 'write_file',
      actionSummary: 'Create slow.md',
      exactPayload: { targetFile: join(root, 'slow.md'), contentPreview: 'x' },
      timestamp: Date.now(),
    });

    expect(decision.status).toBe('denied');
    expect(existsSync(join(root, 'slow.md'))).toBe(false);
  });

  it('denies when the decision id does not match', async () => {
    const host = new AgentHost({
      workspaceRoot: workspace(),
      onEvent: () => {},
      promptForApproval: async () => ({ requestId: 'someone-elses-request', status: 'approved' }),
    });

    const decision = await host.requestApproval({
      requestId: 'r-mismatch',
      toolName: 'write_file',
      actionSummary: 'Create x.md',
      exactPayload: { targetFile: join(workspace(), 'x.md'), contentPreview: 'x' },
      timestamp: Date.now(),
    });

    expect(decision.status).toBe('denied');
  });

  it('denies everything in a non-interactive host', async () => {
    const host = new AgentHost({
      workspaceRoot: workspace(),
      onEvent: () => {},
      nonInteractive: true,
      promptForApproval: async () => ({ requestId: 'r', status: 'approved' }),
    });

    const decision = await host.requestApproval({
      requestId: 'r-noninteractive',
      toolName: 'run_command',
      actionSummary: 'npm test',
      exactPayload: { command: ['npm', 'test'], cwd: 'C:\\ws' },
      timestamp: Date.now(),
    });

    expect(decision.status).toBe('denied');
  });

  it('cancels and denies in-flight approvals', async () => {
    const host = new AgentHost({
      workspaceRoot: workspace(),
      onEvent: () => {},
      promptForApproval: () => new Promise(() => {}),
    });

    const pending = host.requestApproval({
      requestId: 'r-cancel',
      toolName: 'run_command',
      actionSummary: 'npm test',
      exactPayload: { command: ['npm', 'test'], cwd: 'C:\\ws' },
      timestamp: Date.now(),
    });

    host.cancel('User cancelled.');
    expect((await pending).status).toBe('denied');
  });
});

describe('AgentHost session persistence', () => {
  it('persists a turn to the shared profile and resumes it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'moderado-home-'));
    const workspace = mkdtempSync(join(tmpdir(), 'moderado-ws-'));
    const host = new AgentHost({
      workspaceRoot: workspace,
      moderadoHome: root,
      onEvent: () => {},
      promptForApproval: async () => undefined,
    });

    const first = await host.startRun({ task: 'Say hello.' });
    expect(first.sessionId).toMatch(/^[0-9a-f-]{36}$/);

    // A second host over the same home resumes rather than starting over.
    const resumed = new AgentHost({
      workspaceRoot: workspace,
      moderadoHome: root,
      onEvent: () => {},
      promptForApproval: async () => undefined,
    });
    const second = await resumed.startRun({ task: 'And again.' });
    expect(second.sessionId).toBe(first.sessionId);

    const { sessions } = new SessionStore(root).listSessions(workspace);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].messages.length).toBeGreaterThan(0);
  });

  it('never touches the real user profile', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'moderado-ws-'));
    const root = mkdtempSync(join(tmpdir(), 'moderado-home-'));
    const host = new AgentHost({
      workspaceRoot: workspace,
      moderadoHome: root,
      onEvent: () => {},
      promptForApproval: async () => undefined,
    });
    await host.startRun({ task: 'Say hello.' });
    // The isolated fixture is the only place a session may appear.
    expect(new SessionStore(root).listSessions(workspace).sessions).toHaveLength(1);
  });

  it('exposes model options with cost classification', async () => {
    const host = new AgentHost({
      workspaceRoot: mkdtempSync(join(tmpdir(), 'moderado-ws-')),
      moderadoHome: mkdtempSync(join(tmpdir(), 'moderado-home-')),
      onEvent: () => {},
      promptForApproval: async () => undefined,
    });
    const models = await host.discoverModels();
    expect(models.length).toBeGreaterThan(0);
    const free = models.find((m) => m.id === 'mock/free-tool-model');
    const paid = models.find((m) => m.id === 'mock/paid-tool-model');
    expect(free?.isFree).toBe(true);
    expect(paid?.isFree).toBe(false);
  });
});
describe('AgentHost run', () => {
  it('completes a bounded turn against the vendored core with a fake provider', async () => {
    const { events, onEvent } = collector();
    // Every run test must use an isolated home so the developer's real
    // ~/.moderado is never written.
    const host = new AgentHost({
      workspaceRoot: workspace(),
      moderadoHome: mkdtempSync(join(tmpdir(), 'moderado-home-')),
      onEvent,
      promptForApproval: async () => undefined,
    });

    const result = await host.startRun({ task: 'Say hello.' });

    expect(['completed', 'step_limit_reached']).toContain(result.status);
    expect(result.model).toBeTruthy();
    expect(events.some((event) => event.type === 'completion')).toBe(true);
  }, 20_000);

  it('routes free-first by default and does not select a paid model', async () => {
    const host = new AgentHost({
      workspaceRoot: workspace(),
      moderadoHome: mkdtempSync(join(tmpdir(), 'moderado-home-')),
      onEvent: () => {},
      promptForApproval: async () => undefined,
    });
    const result = await host.startRun({ task: 'Inspect the workspace.' });
    expect(result.model).not.toBe('mock/paid-tool-model');
    expect(result.model).toBe('mock/free-tool-model');
  }, 20_000);
});

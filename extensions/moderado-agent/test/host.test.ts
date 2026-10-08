import { mkdtempSync, mkdirSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AgentEvent, ApprovalRequest } from '@moderado/contracts';
import { resolveInJail } from '@moderado/tools';
import { AgentHost, previewFor, resolveProvider } from '../src/host.js';
import { MemoryCredentialStore } from '../src/credentials.js';
import { readConfig } from '../src/profile.js';
import { DesktopOpenAIAdapter } from '../src/provider-transport.js';
import { preparePrompt } from '../src/attachments.js';
import { createSession, SessionStore } from '../src/sessions.js';

function workspace(): string {
  return tempDirectory('moderado-m2-');
}

function tempDirectory(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

function collector() {
  const events: AgentEvent[] = [];
  return { events, onEvent: (event: AgentEvent) => events.push(event) };
}

function configuredHome(id: string, connection: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  const home = tempDirectory('moderado-host-');
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

describe('provider profile recovery', () => {
  it('identifies missing settings with the actual profile path and setup steps', async () => {
    const path = join(workspace(), '.moderado', 'config.json');
    const result = await resolveProvider({ kind: 'missing' }, new MemoryCredentialStore(), {}, undefined, undefined, path);
    expect(result.reason).toBe(`No provider settings found at ${path}. Open Settings → API Config, enter URL/key, load models and Save settings.`);
  });

  it.each([
    ['config.json is not valid JSON: private-api-key excerpt', 'config.json is not valid JSON.'],
    ['config.json is empty.', 'config.json is empty.'],
    ['config.json is not a JSON object.', 'config.json is not a JSON object.'],
    ['Unreadable config.json: EACCES: permission denied private-api-key', 'config.json could not be read (EACCES).'],
  ])('distinguishes invalid profile safely: %s', async (error, cause) => {
    const path = join(workspace(), '.moderado', 'config.json');
    const result = await resolveProvider({ kind: 'invalid', error }, new MemoryCredentialStore(), {}, undefined, undefined, path);
    expect(result.reason).toContain(path);
    expect(result.reason).toContain(cause);
    expect(result.reason).not.toContain('private-api-key');
    expect(result.reason).not.toContain('No provider settings found');
  });
});

describe('Settings runtime preferences', () => {
  const defaults = { allowPaidModels: false, allowUnknownModels: false, webSearchEnabled: true, showHistoryOnStartup: false, preferredLanguage: 'English' as const, approvalTimeoutSeconds: 120 };
  it.each(['paid', 'unknown'])('applies current %s model opt-in at each run', async tier => {
    let preferences = { ...defaults };
    const entry = tier === 'paid' ? { id: 'candidate', pricing: { prompt: '1', completion: '1' }, supported_parameters: ['tools'] } : { id: 'candidate', supported_parameters: ['tools'] };
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: configuredHome('openrouter', { baseUrl: 'https://example.invalid/v1', apiKey: 'fixture' }), fetchImpl: fakeHTTP([entry]), onEvent: () => {}, promptForApproval: async () => undefined, getPreferences: () => preferences });
    await expect(host.startRun({ task: 'Hello.', modelId: 'auto' })).rejects.toThrow(/No eligible models/);
    preferences = { ...preferences, allowPaidModels: tier === 'paid', allowUnknownModels: tier === 'unknown' };
    expect((await host.startRun({ task: 'Hello.', modelId: 'auto' })).model).toBe('candidate');
  });
  it('uses the preference approval deadline when a host is created', async () => {
    vi.useFakeTimers();
    try {
      const host = new AgentHost({ workspaceRoot: workspace(), onEvent: () => {}, promptForApproval: () => new Promise(() => {}), getPreferences: () => ({ ...defaults, approvalTimeoutSeconds: 1 }) });
      const pending = host.requestApproval({ requestId: 'settings-deadline', toolName: 'web_search', actionSummary: 'Search', exactPayload: {}, timestamp: Date.now() });
      await vi.advanceTimersByTimeAsync(1001);
      expect(await Promise.race([pending, Promise.resolve('still pending')])).toMatchObject({ status: 'denied', reason: expect.stringMatching(/timeout|deadline/i) });
      host.dispose();
    } finally { vi.useRealTimers(); }
  });
  it('applies a changed approval timeout to the next run', async () => {
    let preferences = { ...defaults };
    let posts = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method !== 'POST') return Response.json({ object: 'list', data: [] });
      const delta = ++posts === 1
        ? { tool_calls: [{ index: 0, id: 'write-deadline', type: 'function', function: { name: 'run_command', arguments: '{"command":"node","args":["-e","process.exit(0)"]}' } }] }
        : { content: 'Done.' };
      return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: posts === 1 ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n');
    });
    const root = workspace();
    const promptForApproval = vi.fn(() => new Promise<undefined>(() => {}));
    const { events, onEvent } = collector();
    const host = new AgentHost({ workspaceRoot: root, moderadoHome: configuredHome('moderado-cloud', { baseUrl: 'http://127.0.0.1:4788/v1' }), fetchImpl, onEvent, promptForApproval, getPreferences: () => preferences });
    preferences = { ...preferences, approvalTimeoutSeconds: 1 };
    vi.useFakeTimers();
    try {
      const run = host.startRun({ task: 'Write deadline.txt.', modelId: 'auto' });
      await vi.waitFor(() => expect(promptForApproval).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(1100);
      expect(await Promise.race([run, Promise.resolve('still running')])).toMatchObject({ status: 'completed' });
      expect(events).toContainEqual(expect.objectContaining({ type: 'tool_result', result: expect.objectContaining({ toolName: 'run_command', status: 'denied', output: expect.stringContaining('approval deadline') }) }));
    } finally { host.dispose(); vi.useRealTimers(); }
  });
  it('refuses a provider-requested web search when disabled', async () => {
    let posts = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method !== 'POST') return Response.json({ object: 'list', data: [] });
      const delta = ++posts === 1
        ? { tool_calls: [{ index: 0, id: 'disabled-search', type: 'function', function: { name: 'web_search', arguments: '{"query":"test"}' } }] }
        : { content: 'Done.' };
      return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: posts === 1 ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n');
    });
    const { events, onEvent } = collector();
    const promptForApproval = vi.fn(async () => undefined);
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: configuredHome('moderado-cloud', { baseUrl: 'http://127.0.0.1:4788/v1' }), fetchImpl, onEvent, promptForApproval, getPreferences: () => ({ ...defaults, webSearchEnabled: false }) });
    await host.startRun({ task: 'Search.', modelId: 'auto' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_result', result: expect.objectContaining({ toolName: 'web_search', status: 'error', output: expect.stringContaining('Unknown tool') }) }));
    expect(promptForApproval).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls.every(([url]) => String(url).startsWith('http://127.0.0.1:4788/v1'))).toBe(true);
  });
  it('removes disabled web search declarations and adds the selected response language', async () => {
    const fetchImpl = fakeHTTP([]);
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: configuredHome('moderado-cloud', { baseUrl: 'http://127.0.0.1:4788/v1' }), fetchImpl, onEvent: () => {}, promptForApproval: async () => undefined, getPreferences: () => ({ ...defaults, webSearchEnabled: false, preferredLanguage: 'French' }) });
    await host.startRun({ task: 'Hello.', modelId: 'auto' });
    const body = JSON.parse(String(fetchImpl.mock.calls.find(([, init]) => init?.method === 'POST')![1]?.body));
    expect(body.tools.map((tool: any) => tool.function.name)).not.toContain('web_search');
    expect(body.tools.map((tool: any) => tool.function.name)).toContain('read_file');
    const systemPrompt = body.messages.find((message: any) => message.role === 'system').content;
    expect(systemPrompt).toContain('Respond in French');
    expect(systemPrompt).toContain('Do not volunteer the active model or session details');
  });
});

describe('Desktop provider host integration', () => {
  it('deletes a recorded chat and resets only the matching resumed session', () => {
    const workspaceRoot = workspace();
    const home = configuredHome('unused', {});
    const store = new SessionStore(home);
    const first = store.save(createSession(workspaceRoot));
    const second = store.save(createSession(workspaceRoot));
    const host = new AgentHost({ workspaceRoot, moderadoHome: home, onEvent: () => {}, promptForApproval: async () => undefined });
    host.resumeRecordedSession(first);
    expect(host.deleteSession(second.id)).toBe(true);
    expect(host.session?.id).toBe(first.id);
    expect(host.deleteSession(first.id)).toBe(true);
    expect(host.session).toBeNull();
    expect(host.listSessions().sessions).toHaveLength(0);
  });

  it('refuses chat deletion during an active run even after cancellation', async () => {
    const workspaceRoot = workspace();
    const home = configuredHome('moderado-cloud', { baseUrl: 'http://127.0.0.1:4788/v1' });
    let finish!: (response: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise(resolve => { finish = resolve; }));
    const host = new AgentHost({ workspaceRoot, moderadoHome: home, fetchImpl, onEvent: () => {}, promptForApproval: async () => undefined });
    const pending = host.startRun({ task: 'hello', modelId: 'auto' }).catch(() => undefined);
    expect(() => host.deleteSession('11111111-1111-4111-8111-111111111111')).toThrow(/active|running|progress/i);
    host.cancel();
    expect(() => host.deleteSession('11111111-1111-4111-8111-111111111111')).toThrow(/active|running|progress/i);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    finish(Response.json({ object: 'list', data: [] }));
    await pending;
  });

  const route = { id: 'moonshotai/kimi-k3', provider: 'nvidia-nim', owned_by: 'moonshotai', capabilities: ['chat', 'tools'], data_note: 'Gateway route' };
  const gateway = { baseUrl: 'http://127.0.0.1:4788/v1' };

  it('restores image context across host restart while keeping shared session text-only', async () => {
    const settings = { workspaceRoot: workspace(), moderadoHome: configuredHome('moderado-cloud', gateway), fetchImpl: fakeHTTP([route]), onEvent: () => {}, promptForApproval: async () => undefined };
    const image = { id: '11111111-1111-4111-8111-111111111111', label: 'pixel.png', mimeType: 'image/png' as const, data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1i0AAAAASUVORK5CYII=' };
    const prompt = preparePrompt('Describe.', [{ kind: 'image', id: image.id, label: image.label, image }]);
    await new AgentHost(settings).startRun({ ...prompt, modelId: 'auto' });
    const restarted = new AgentHost(settings);
    await restarted.startRun({ task: 'What color?', modelId: 'auto' });
    const posts = settings.fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST');
    const original = JSON.parse(String(posts[0][1]?.body)).messages.find((message: any) => message.role === 'user');
    const history = JSON.parse(String(posts[1][1]?.body)).messages.find((message: any) => message.role === 'user');
    expect(original.content[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${image.data}` } });
    expect(history).toEqual(original);
    expect(restarted.session?.messages.every(message => typeof message.content === 'string' || message.content === null)).toBe(true);
    expect(JSON.stringify(restarted.session)).not.toContain(image.data);
  });

  it('rejects image input instead of dropping it with a fake provider', async () => {
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: configuredHome('unused', { baseUrl: 'http://127.0.0.1:4788/v1' }), onEvent: () => {}, promptForApproval: async () => undefined });
    const image = { id: '11111111-1111-4111-8111-111111111111', label: 'pixel.png', mimeType: 'image/png' as const, data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1i0AAAAASUVORK5CYII=' };
    const prompt = preparePrompt('Describe.', [{ kind: 'image', id: image.id, label: image.label, image }]);
    await expect(host.startRun(prompt)).rejects.toThrow(/image.*provider|provider.*image/i);
  });


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

  it('preserves Gateway tool history and leaves output limits to v0.4.8 Gateway AUTO', async () => {
    const fetchImpl = fakeHTTP([route]);
    const { events, onEvent } = collector();
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: configuredHome('moderado-cloud', gateway), fetchImpl, onEvent, promptForApproval: async () => undefined });
    const content = 'x'.repeat(2500);
    await host.startRun({ task: 'Continue.', modelId: 'auto', conversationHistory: [
      { role: 'tool', toolCallId: 'previous-tool', name: 'read_file', content, status: 'success' },
      { role: 'assistant', content: 'Read the file.' },
    ] });
    const post = fetchImpl.mock.calls.find(([, init]) => init?.method === 'POST')!;
    const body = JSON.parse(String(post[1]?.body));
    expect(body).not.toHaveProperty('max_tokens');
    expect(body.messages.find((message: { role: string }) => message.role === 'tool').content).toBe(content);
    expect(events.find(event => event.type === 'model_change')).toMatchObject({ newModelId: 'auto', accessClass: 'free_trial' });
  });

  it('leaves Gateway AUTO retry and fallback to the server', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => init?.method === 'POST'
      ? new Response('rate limited', { status: 429 }) : Response.json({ object: 'list', data: [route] }));
    const host = new AgentHost({ workspaceRoot: workspace(), moderadoHome: configuredHome('moderado-cloud', gateway), fetchImpl, onEvent: () => {}, promptForApproval: async () => undefined });
    expect((await host.startRun({ task: 'Hello.', modelId: 'auto' })).status).toBe('failed');
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
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
    expect(() => previewFor('write_file', { path: '../../evil.txt', content: 'x' }, root)).toThrow();
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
    expect(() => resolveInJail(root, '../../outside-workspace/hosts')).toThrow();
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
    const root = tempDirectory('moderado-home-');
    const workspace = tempDirectory('moderado-ws-');
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
    const workspace = tempDirectory('moderado-ws-');
    const root = tempDirectory('moderado-home-');
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
      workspaceRoot: tempDirectory('moderado-ws-'),
      moderadoHome: tempDirectory('moderado-home-'),
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
      moderadoHome: tempDirectory('moderado-home-'),
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
      moderadoHome: tempDirectory('moderado-home-'),
      onEvent: () => {},
      promptForApproval: async () => undefined,
    });
    const result = await host.startRun({ task: 'Inspect the workspace.' });
    expect(result.model).not.toBe('mock/paid-tool-model');
    expect(result.model).toBe('mock/free-tool-model');
  }, 20_000);
});

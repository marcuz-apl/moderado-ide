import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>, invalid: false,
  messages: [] as Record<string, unknown>[], keys: new Map<string, string>(),
  provider: undefined as any, receive: undefined as any,
  agentOptions: undefined as any, configValues: new Map<string, unknown>(), configUpdate: vi.fn(), histories: [] as StoredSession[], currentId: '', deleted: vi.fn(), confirm: vi.fn(),
  runs: [] as Record<string, unknown>[],
  finalMessage: null as string | null,
  workspaceRoot: '', windows: true, fileDialog: vi.fn(), contextPicker: vi.fn(), findFiles: vi.fn(), errors: vi.fn(),
  prompt: vi.fn(), browser: vi.fn(), write: vi.fn(), openExternal: vi.fn(),
  workspaceTitles: new Map<string, unknown>(),
}));
vi.mock('vscode', () => ({
  version: '1.135.0', ConfigurationTarget: { Global: 1 },
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }),
    registerWebviewViewProvider: (_id: string, provider: unknown) => { harness.provider = provider; return { dispose: vi.fn() }; },
    showInputBox: harness.prompt, showOpenDialog: harness.fileDialog, showQuickPick: harness.contextPicker,
    showErrorMessage: harness.errors, showWarningMessage: harness.confirm,
  },
  workspace: { get workspaceFolders() { return [{ uri: { fsPath: harness.workspaceRoot } }]; }, findFiles: harness.findFiles,
    getConfiguration: () => ({ get: (key: string, fallback: unknown) => harness.configValues.has(key) ? harness.configValues.get(key) : fallback, update: harness.configUpdate }) },
  commands: { registerCommand: () => ({ dispose: vi.fn() }) },
  env: { openExternal: harness.openExternal }, Uri: { parse: (url: string) => url, file: (fsPath: string) => ({ fsPath, scheme: 'file' }) },
  RelativePattern: class { constructor(public base: unknown, public pattern: string) {} },
}));
vi.mock('../src/profile.js', async original => ({ ...await original<typeof import('../src/profile.js')>(), configPath: () => 'isolated/config.json',
  readConfig: () => harness.invalid ? { kind: 'invalid', error: 'corrupt profile' } : { kind: 'ok', config: harness.profile } }));
vi.mock('../src/host.js', () => ({ AgentHost: class {
  constructor(options: unknown) { harness.agentOptions = options; }
  listSessions() { return { sessions: harness.histories, invalid: [] }; }
  get session() { return harness.histories.find(session => session.id === harness.currentId) ?? null; }
  get isRunning() { return false; }
  deleteSession(id: string) { harness.deleted(id); harness.histories = harness.histories.filter(session => session.id !== id); return true; }
  startNewSession() { harness.currentId = ''; }
  async discoverModels() { return []; }
  async startRun(input: Record<string, unknown>) {
    harness.runs.push(input);
    return { status: 'completed', finalMessage: harness.finalMessage, model: String(input.modelId ?? 'auto'), totalSteps: 0, sessionId: 's' };
  }
  dispose() {} cancel() {}
} }));
vi.mock('../src/credentials.js', async (original) => {
  const actual = await original<typeof import('../src/credentials.js')>();
  return { ...actual, credentialManagerAvailable: () => harness.windows, WindowsCredentialStore: class {
    async get(ref: string) { return harness.keys.get(ref); }
    async set(ref: string, secret: string) { harness.keys.set(ref, secret); }
    async delete(ref: string) { harness.keys.delete(ref); }
  } };
});
vi.mock('../src/gateway-login.js', async (original) => {
  const actual = await original<typeof import('../src/gateway-login.js')>();
  return { ...actual, authorizeGatewayInBrowser: harness.browser };
});
vi.mock('../src/coordination.js', () => ({ updateConfigCoordinated: harness.write }));
import { activate } from '../src/extension.js';
import { createSession, type StoredSession } from '../src/sessions.js';

const form = { preset: 'moderado-cloud', displayName: '', baseUrl: 'http://127.0.0.1:4788/v1', modelId: 'Exact/Route', loginMethod: 'manual' };
function send(type: string, values: Record<string, unknown> = {}) { harness.receive({ type, ...values }); }
const html = () => String(harness.messages.at(-1)?.settings ?? '');

beforeEach(() => {
  harness.workspaceRoot = realpathSync(mkdtempSync(join(tmpdir(), 'moderado-composer-workspace-')));
  harness.fileDialog.mockResolvedValue(undefined); harness.contextPicker.mockResolvedValue(undefined); harness.findFiles.mockResolvedValue([]);
  harness.configValues.clear();
  harness.configUpdate.mockImplementation(async (key: string, value: unknown) => { harness.configValues.set(key, value); });
  harness.windows = true; harness.histories = []; harness.currentId = ''; harness.confirm.mockResolvedValue('Delete'); harness.workspaceTitles.clear();
  vi.clearAllMocks(); harness.messages = []; harness.keys.clear(); harness.profile = {}; harness.invalid = false; harness.runs = []; harness.finalMessage = null;
  harness.prompt.mockResolvedValue('mrd_native-secret');
  harness.browser.mockResolvedValue({ accessToken: 'mrd_browser-secret', expiresAt: Date.now() + 60_000 });
  harness.write.mockImplementation((_path, patch) => {
    harness.profile = { ...harness.profile, ...patch, connections: { ...(harness.profile.connections as object), ...(patch.connections as object) } };
    return { written: true };
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ object: 'list', data: [
    { id: 'Exact/Route', access: 'free', provider: 'owner', owned_by: 'owner', capabilities: ['tools'], data_note: '<note>' },
  ] }))));
  activate({ subscriptions: [], workspaceState: {
    get: (key: string) => harness.workspaceTitles.get(key),
    update: async (key: string, value: unknown) => { if (value === undefined) harness.workspaceTitles.delete(key); else harness.workspaceTitles.set(key, value); },
  }, secrets: { get: async (key: string) => harness.keys.get(key), store: async (key: string, value: string) => { harness.keys.set(key, value); }, delete: async (key: string) => { harness.keys.delete(key); } } } as any);
  harness.provider.resolveWebviewView({
    webview: { options: {}, html: '', onDidReceiveMessage: (receive: unknown) => { harness.receive = receive; },
      postMessage: (message: Record<string, unknown>) => { harness.messages.push(message); return Promise.resolve(true); } },
    onDidDispose: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('host-only Settings credentials', () => {
  it('prompts natively for a manual Gateway key and writes only its reference', async () => {
    send('setProviderKey', form);
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalled());
    expect(harness.prompt).toHaveBeenCalledWith(expect.objectContaining({ password: true, ignoreFocusOut: true }));
    expect(harness.keys.get((harness.profile.connections as Record<string, Record<string, string>>)['moderado-cloud']?.credentialReference)).toBe('mrd_native-secret');
    expect(harness.profile).toMatchObject({ defaultModel: 'Exact/Route', connections: { 'moderado-cloud': {
      authMethod: 'manual', credentialReference: expect.stringMatching(/^moderado\/provider\/moderado-cloud-/), defaultModel: 'Exact/Route',
    } } });
    await vi.waitFor(() => expect(html()).toContain('Credential stored'));
    expect(JSON.stringify(harness.messages)).not.toMatch(/mrd_native-secret|moderado\/provider\//);
    expect(JSON.stringify(harness.profile)).not.toContain('mrd_native-secret');
  });

  it('uses the host browser flow and persists expiry with the selected route', async () => {
    send('gatewayBrowserLogin', { ...form, loginMethod: 'browser' });
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalled());
    expect(harness.browser).toHaveBeenCalledWith(expect.objectContaining({ openExternal: expect.any(Function) }));
    expect(harness.prompt).not.toHaveBeenCalled();
    expect(harness.profile).toMatchObject({ connections: { 'moderado-cloud': { authMethod: 'browser', credentialExpiresAt: expect.any(Number), defaultModel: 'Exact/Route' } } });
    expect(JSON.stringify(harness.messages)).not.toContain('mrd_browser-secret');
  });

  it('saves public Gateway AUTO without a prompt and clears credential metadata', async () => {
    harness.profile = { connections: { 'moderado-cloud': { id: 'moderado-cloud', apiKey: 'legacy-secret', credentialReference: 'moderado/provider/moderado-cloud', credentialExpiresAt: Date.now() + 60_000, future: 'preserved' } } };
    send('saveSettings', { ...form, loginMethod: 'public', modelId: 'auto' });
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalled());
    expect(harness.prompt).not.toHaveBeenCalled();
    const record = (harness.profile.connections as any)['moderado-cloud'];
    expect(record).toMatchObject({ authMethod: 'public', future: 'preserved', defaultModel: 'auto' });
    expect(record.credentialReference).toBeUndefined(); expect(record.credentialExpiresAt).toBeUndefined(); expect(record.apiKey).toBeUndefined();
  });

  it('cancellation denies credential/config mutation', async () => {
    harness.prompt.mockResolvedValue(undefined);
    send('setProviderKey', form);
    await vi.waitFor(() => expect(html()).toContain('cancelled'));
    expect(harness.keys.size).toBe(0); expect(harness.write).not.toHaveBeenCalled();
  });

  it.each(['apiKey', 'token', 'authorizationCode', 'credentialReference'])('rejects secret-bearing %s messages before prompts', async (field) => {
    send('setProviderKey', { ...form, [field]: 'secret' });
    await vi.waitFor(() => expect(html()).toContain('credentials'));
    expect(harness.prompt).not.toHaveBeenCalled(); expect(harness.write).not.toHaveBeenCalled();
  });

  it('blocks native key changes against a corrupt profile', async () => {
    harness.invalid = true; send('setProviderKey', form);
    await vi.waitFor(() => expect(html()).toContain('corrupt profile'));
    expect(harness.prompt).not.toHaveBeenCalled(); expect(harness.write).not.toHaveBeenCalled();
  });
});

describe('default auto-approval', () => {
  it('auto-approves edit and MCP requests while keeping commands approval-gated', async () => {
    const promptForApproval = harness.agentOptions.promptForApproval as (
      request: Record<string, unknown>,
      signal: AbortSignal,
    ) => Promise<unknown>;
    const signal = new AbortController().signal;
    const request = (requestId: string, toolName: string) => ({
      requestId, toolName, actionSummary: 'test action',
      exactPayload: { targetFile: 'file.txt', diffPreview: 'change' }, timestamp: Date.now(),
    });

    await expect(promptForApproval(request('edit-1', 'edit_file'), signal))
      .resolves.toEqual({ requestId: 'edit-1', status: 'approved' });
    await expect(promptForApproval(request('mcp-1', 'mcp.server.tool'), signal))
      .resolves.toEqual({ requestId: 'mcp-1', status: 'approved' });
    expect(harness.prompt).not.toHaveBeenCalled();

    const commandApproval = promptForApproval({
      ...request('command-1', 'run_command'),
      exactPayload: { command: ['npm', 'test'], cwd: harness.workspaceRoot },
    }, signal);
    await vi.waitFor(() => expect(harness.messages.at(-1)).toMatchObject({ pendingId: 'command-1' }));
    send('approval', { requestId: 'command-1', status: 'denied' });
    await expect(commandApproval).resolves.toMatchObject({ requestId: 'command-1', status: 'denied' });

    const cancelled = new AbortController();
    cancelled.abort();
    await expect(promptForApproval(request('cancelled-1', 'edit_file'), cancelled.signal)).resolves.toBeUndefined();
  });
});

describe('composer run wiring', () => {
  it('passes the host-side active model to startRun and ignores a webview-supplied one', async () => {
    // The active selection lives in the shared profile; the webview only ever
    // sends prompt text, so a modelId echoed back in the message is ignored.
    harness.profile = {
      activeConnectionId: 'moderado-cloud', defaultModel: 'Exact/Route',
      connections: { 'moderado-cloud': { id: 'moderado-cloud', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:4788/v1' } },
    };
    send('openSettings');
    await vi.waitFor(() => expect(html()).toContain('Exact/Route'));
    send('prompt', { text: 'Say hi.', modelId: 'evil/route' });
    await vi.waitFor(() => expect(harness.runs).toHaveLength(1));
    expect(harness.runs[0]).toMatchObject({ task: 'Say hi.', modelId: 'Exact/Route' });
    expect(JSON.stringify(harness.runs)).not.toContain('evil/route');
  });

  it('runs with no model id when the profile selects none', async () => {
    send('prompt', { text: 'Say hi.' });
    await vi.waitFor(() => expect(harness.runs).toHaveLength(1));
    expect(harness.runs[0]).toMatchObject({ task: 'Say hi.' });
    expect(harness.runs[0].modelId).toBeUndefined();
  });
});


afterEach(() => { rmSync(harness.workspaceRoot, { recursive: true, force: true }); });

describe('host-owned composer attachments', () => {
  it('can browse project context outside the bounded quick-pick listing', async () => {
    const file = join(harness.workspaceRoot, 'ignored-file.txt'); writeFileSync(file, 'reference only');
    harness.findFiles.mockResolvedValue([]);
    harness.contextPicker.mockImplementation(async items => [items.find((item: { browse?: boolean }) => item.browse)]);
    harness.fileDialog.mockResolvedValue([{ fsPath: file, scheme: 'file' }]);
    send('addContext');
    await vi.waitFor(() => expect(String(harness.messages.at(-1)?.attachments)).toContain('ignored-file.txt'));
    expect(harness.fileDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultUri: expect.objectContaining({ fsPath: harness.workspaceRoot }) }));
  });

  it('sends an image-only draft as genuine image input while the webview sees descriptors only', async () => {
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPf8AAAAASUVORK5CYII=';
    const path = join(harness.workspaceRoot, 'picture.png'); writeFileSync(path, Buffer.from(data, 'base64'));
    harness.fileDialog.mockResolvedValue([{ fsPath: path, scheme: 'file' }]);
    send('addFiles');
    await vi.waitFor(() => expect(String(harness.messages.at(-1)?.attachments)).toContain('picture.png'));
    expect(JSON.stringify(harness.messages)).not.toContain(data);
    send('prompt', { text: '' });
    await vi.waitFor(() => expect(harness.runs).toHaveLength(1));
    expect(harness.runs[0].task).toContain('Review the attached context.');
    expect(harness.runs[0].images).toEqual([expect.objectContaining({ mimeType: 'image/png', data })]);
  });

  it('rejects oversized native selections before reading their files', async () => {
    harness.fileDialog.mockResolvedValue(Array.from({ length: 11 }, () => ({ fsPath: '/nonexistent/unapproved.txt', scheme: 'file' })));
    send('addFiles');
    await vi.waitFor(() => expect(harness.errors).toHaveBeenCalledWith('Attach at most 10 files or images.'));
    expect(String(harness.messages.at(-1)?.attachments)).toBe('');
  });

  it('adds an explicitly selected external file without clearing the conversation and sends its contents', async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'moderado-explicit-file-')));
    try {
      const path = join(outside, 'example.txt'); writeFileSync(path, 'explicitly selected external content');
      send('prompt', { text: 'Existing conversation.' });
      await vi.waitFor(() => expect(harness.runs).toHaveLength(1));
      harness.fileDialog.mockResolvedValue([{ fsPath: path, scheme: 'file' }]);
      send('addFiles');
      await vi.waitFor(() => expect(String(harness.messages.at(-1)?.attachments)).toContain('example.txt'));
      expect(String(harness.messages.at(-1)?.rows)).toContain('Existing conversation.');
      expect(JSON.stringify(harness.messages)).not.toContain('explicitly selected external content');
      send('prompt', { text: 'Review this file.' });
      await vi.waitFor(() => expect(harness.runs).toHaveLength(2));
      expect(harness.runs[1].task).toContain('explicitly selected external content');
      expect(String(harness.messages.at(-1)?.attachments)).toBe('');
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });

  it('filters project context to jailed files and adds references without automatically reading contents', async () => {
    mkdirSync(join(harness.workspaceRoot, 'src'));
    const file = join(harness.workspaceRoot, 'src/example.ts'); writeFileSync(file, 'context content should not be read');
    harness.findFiles.mockResolvedValue([{ fsPath: file, scheme: 'file' }, { fsPath: join(harness.workspaceRoot, '../external.txt'), scheme: 'file' }]);
    harness.contextPicker.mockImplementation(async (items) => items);
    send('addContext');
    await vi.waitFor(() => expect(String(harness.messages.at(-1)?.attachments)).toContain('src/example.ts'));
    expect(harness.contextPicker.mock.calls[0][0].filter((item: { attachment?: unknown }) => item.attachment)).toHaveLength(1);
    send('prompt', { text: 'Inspect this context.' });
    await vi.waitFor(() => expect(harness.runs).toHaveLength(1));
    expect(harness.runs[0].task).toContain('src/example.ts');
    expect(harness.runs[0].task).not.toContain('context content should not be read');
  });

  it('ignores renderer-supplied paths and removes only host-issued attachment ids', async () => {
    send('addFiles', { paths: ['/unapproved/path'] });
    send('addContext', { path: '../unapproved' });
    expect(harness.fileDialog).not.toHaveBeenCalled();
    expect(harness.findFiles).not.toHaveBeenCalled();
    const path = join(harness.workspaceRoot, 'example.txt'); writeFileSync(path, 'a file');
    harness.fileDialog.mockResolvedValue([{ fsPath: path, scheme: 'file' }]);
    send('addFiles');
    await vi.waitFor(() => expect(String(harness.messages.at(-1)?.attachments)).toContain('example.txt'));
    const chips = String(harness.messages.at(-1)?.attachments);
    const id = /data-attachment-id="([^"]+)"/.exec(chips)![1];
    send('removeAttachment', { id: 'malformed' });
    expect(String(harness.messages.at(-1)?.attachments)).toBe(chips);
    send('removeAttachment', { id });
    expect(String(harness.messages.at(-1)?.attachments)).toBe('');
  });
});


describe('API Config paste, discover, then save', () => {
  it('uses an unsaved key and editable endpoint for discovery, then saves only the reference', async () => {
    const values = { preset: 'nvidia-nim', baseUrl: 'https://provider.example/v1', displayName: '', modelId: 'auto', apiKey: 'draft-private-key' };
    send('refreshModels', values);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('https://provider.example/v1/models', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer draft-private-key' }) })));
    expect(harness.write).not.toHaveBeenCalled();
    expect(harness.keys.size).toBe(0);
    expect(JSON.stringify(harness.messages)).not.toContain('draft-private-key');
    send('saveSettings', values);
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalled());
    expect(harness.keys.get((harness.profile.connections as Record<string, Record<string, string>>)['nvidia-nim']?.credentialReference)).toBe('draft-private-key');
    expect(harness.prompt).not.toHaveBeenCalled();
    expect(harness.profile).toMatchObject({ connections: { 'nvidia-nim': { baseUrl: 'https://provider.example/v1', credentialReference: expect.stringMatching(/^moderado\/provider\/nvidia-nim-/) } } });
    expect(JSON.stringify(harness.profile)).not.toContain('draft-private-key');
    await vi.waitFor(() => expect(html()).toContain('Settings saved.'));
  });
  it('explains an unknown URL without making a request', async () => {
    send('selectPreset', { preset: 'openai-compatible' });
    await vi.waitFor(() => expect(html()).toContain('Enter a Base URL'));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects unsafe URL/key submissions before discovery and storage', async () => {
    send('refreshModels', { preset: 'nvidia-nim', baseUrl: 'http://external.example/v1', apiKey: 'private-key' });
    await vi.waitFor(() => expect(html()).toContain('HTTPS'));
    expect(fetch).not.toHaveBeenCalled();
    expect(harness.keys.size).toBe(0);
  });
});


describe('saved provider and history workflows', () => {
  it('reloads a saved custom endpoint with its stored key', async () => {
    send('saveSettings', { preset: 'openai-compatible', displayName: 'Example provider', baseUrl: 'https://example.test/v1', apiKey: 'custom-key', modelId: 'auto' });
    await vi.waitFor(() => expect(harness.profile.activeConnectionId).toBe('example-provider'));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('https://example.test/v1/models', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer custom-key' }) })));
    expect(html()).toContain('custom:example-provider');
    expect(JSON.stringify(harness.messages)).not.toContain('custom-key');
  });
  it('does not send a saved key to an edited endpoint', async () => {
    harness.profile = { connections: { 'nvidia-nim': { id: 'nvidia-nim', baseUrl: 'https://original.test/v1', credentialReference: 'moderado/provider/nvidia-nim' } } };
    harness.keys.set('moderado/provider/nvidia-nim', 'stored-private-key');
    send('openSettings');
    await vi.waitFor(() => expect(html()).toContain('settings-provider'));
    vi.mocked(fetch).mockClear();
    send('refreshModels', { preset: 'nvidia-nim', baseUrl: 'https://changed.test/v1', modelId: 'auto' });
    await vi.waitFor(() => expect(html()).toContain('Paste an API key'));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('deletes only a known chat after native confirmation', async () => {
    const session = createSession(harness.workspaceRoot); harness.histories = [session];
    harness.workspaceTitles.set(`moderado.sessionTitle.${session.id}`, 'Local title');
    send('deleteSession', { id: session.id });
    await vi.waitFor(() => expect(harness.deleted).toHaveBeenCalledWith(session.id));
    await vi.waitFor(() => expect(harness.workspaceTitles.has(`moderado.sessionTitle.${session.id}`)).toBe(false));
    expect(harness.confirm).toHaveBeenCalledWith(expect.stringContaining('Delete chat'), expect.objectContaining({ modal: true }), 'Delete');
  });
  it('cancellation and malformed delete requests do not delete history', async () => {
    const session = createSession(harness.workspaceRoot); harness.histories = [session]; harness.confirm.mockResolvedValue(undefined);
    send('deleteSession', { id: session.id });
    await vi.waitFor(() => expect(harness.confirm).toHaveBeenCalled());
    expect(harness.deleted).not.toHaveBeenCalled();
    harness.confirm.mockClear();
    send('deleteSession', { id: '../outside' });
    send('deleteSession', { id: session.id, path: '/outside' });
    expect(harness.confirm).not.toHaveBeenCalled(); expect(harness.deleted).not.toHaveBeenCalled();
  });
  it('renames a known chat in workspace-local state without changing the shared session', async () => {
    const session = createSession(harness.workspaceRoot); harness.histories = [session];
    harness.prompt.mockResolvedValueOnce('A clearer chat name');
    send('toggleHistory');
    send('renameSession', { id: session.id });
    await vi.waitFor(() => expect(harness.workspaceTitles.get(`moderado.sessionTitle.${session.id}`)).toBe('A clearer chat name'));
    expect(harness.prompt).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Rename chat',
      value: 'Untitled session',
      validateInput: expect.any(Function),
    }));
    const validate = vi.mocked(harness.prompt).mock.calls.at(-1)?.[0].validateInput;
    expect(validate?.('   ')).toBe('Chat name cannot be empty.');
    expect(validate?.('x'.repeat(121))).toBe('Chat name must be 120 characters or fewer.');
    expect(harness.histories[0]).toBe(session);
    expect(String(harness.messages.at(-1)?.recents)).toContain('A clearer chat name');
  });
  it('does not persist a cancelled or malformed chat rename', async () => {
    const session = createSession(harness.workspaceRoot); harness.histories = [session];
    harness.prompt.mockResolvedValueOnce(undefined);
    send('renameSession', { id: session.id });
    await vi.waitFor(() => expect(harness.prompt).toHaveBeenCalled());
    send('renameSession', { id: session.id, title: 'renderer-controlled' });
    await vi.waitFor(() => expect(harness.prompt).toHaveBeenCalledTimes(1));
    expect(harness.workspaceTitles.size).toBe(0);
  });
});


describe('API Config secure save boundaries', () => {
  it('clears an old optional key reference when saving a changed endpoint', async () => {
    harness.profile = { activeConnectionId: 'ollama', connections: { ollama: { id: 'ollama', baseUrl: 'http://localhost:11434/v1', credentialReference: 'moderado/provider/ollama', defaultModel: 'auto' } } };
    harness.keys.set('moderado/provider/ollama', 'old-key');
    send('saveSettings', { preset: 'ollama', baseUrl: 'http://localhost:5999/v1', modelId: 'auto' });
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalled());
    expect((harness.profile.connections as Record<string, Record<string, unknown>>).ollama.credentialReference).toBeUndefined();
    expect(fetch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer old-key' }) }));
  });
  it('uses editor secret storage to save a pasted key on Linux', async () => {
    harness.windows = false;
    activate({ subscriptions: [], secrets: { get: async (key: string) => harness.keys.get(key), store: async (key: string, value: string) => { harness.keys.set(key, value); }, delete: async (key: string) => { harness.keys.delete(key); } } } as any);
    harness.provider.resolveWebviewView({ webview: { options: {}, html: '', onDidReceiveMessage: (receive: unknown) => { harness.receive = receive; }, postMessage: (message: Record<string, unknown>) => { harness.messages.push(message); return Promise.resolve(true); } }, onDidDispose: vi.fn() });
    send('saveSettings', { preset: 'nvidia-nim', baseUrl: 'https://provider.example/v1', modelId: 'auto', apiKey: 'linux-private-key' });
    await vi.waitFor(() => expect(harness.keys.get((harness.profile.connections as Record<string, Record<string, string>>)['nvidia-nim']?.credentialReference)).toBe('linux-private-key'));
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalled());
    expect(harness.prompt).not.toHaveBeenCalled();
    expect(JSON.stringify(harness.messages)).not.toContain('linux-private-key');
    expect(JSON.stringify(harness.profile)).not.toContain('linux-private-key');
  });
});


describe('immutable credential saves', () => {
  it('a config conflict never overwrites a previously referenced key', async () => {
    const originalReference = 'moderado/provider/nvidia-nim';
    harness.profile = { activeConnectionId: 'nvidia-nim', connections: { 'nvidia-nim': { id: 'nvidia-nim', baseUrl: 'https://provider.example/v1', credentialReference: originalReference } } };
    harness.keys.set(originalReference, 'original-key');
    harness.write.mockReturnValue({ written: false, reason: 'config changed' });
    send('saveSettings', { preset: 'nvidia-nim', baseUrl: 'https://provider.example/v1', modelId: 'auto', apiKey: 'replacement-key' });
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalled());
    expect(harness.keys.get(originalReference)).toBe('original-key');
    expect((harness.profile.connections as Record<string, Record<string, string>>)['nvidia-nim'].credentialReference).toBe(originalReference);
    expect(JSON.stringify(harness.messages)).not.toContain('replacement-key');
  });
  it('missing required keys use the API Config validation instead of opening a prompt', async () => {
    send('saveSettings', { preset: 'nvidia-nim', baseUrl: 'https://provider.example/v1', modelId: 'auto' });
    await vi.waitFor(() => expect(html()).toContain('Paste an API key before saving'));
    expect(harness.prompt).not.toHaveBeenCalled();
    expect(harness.write).not.toHaveBeenCalled();
  });
});


describe('Features editor preferences', () => {
  it('saves only validated preferences to editor configuration and supplies them to new runs', async () => {
    send('setPreference', { key: 'preferredLanguage', value: 'French' });
    await vi.waitFor(() => expect(harness.configUpdate).toHaveBeenCalledWith('preferredLanguage', 'French', 1));
    expect(harness.agentOptions.getPreferences().preferredLanguage).toBe('French');
    expect(harness.write).not.toHaveBeenCalled();
    send('setPreference', { key: 'webSearchEnabled', value: false });
    await vi.waitFor(() => expect(harness.agentOptions.getPreferences().webSearchEnabled).toBe(false));
  });
  it('rejects arbitrary configuration keys and malformed values', () => {
    send('setPreference', { key: 'providerSecret', value: 'invalid' });
    send('setPreference', { key: 'allowPaidModels', value: 'true' });
    send('setPreference', { key: 'approvalTimeoutSeconds', value: 601 });
    expect(harness.configUpdate).not.toHaveBeenCalled();
    expect(harness.write).not.toHaveBeenCalled();
  });
  it('switches to Features and About content without a General tab', async () => {
    send('openSettings');
    await vi.waitFor(() => expect(html()).toContain('id="settings-provider"'));
    expect(html()).not.toContain('data-page="general"');
    send('setSettingsPage', { page: 'features' });
    expect(html()).toContain('data-preference="webSearchEnabled"');
    expect(html()).toContain('data-preference="preferredLanguage"');
    expect(html()).not.toContain('id="settings-provider"');
    send('setSettingsPage', { page: 'general' });
    expect(html()).toContain('data-preference="preferredLanguage"');
    expect(html()).not.toContain('data-page="general"');
    send('setSettingsPage', { page: 'about' });
    expect(html()).toContain('IDE version');
    expect(html()).not.toContain('id="settings-provider"');
  });

  it('does not show model counts on any Settings page or model tab after discovery', async () => {
    send('setProviderKey', form);
    await vi.waitFor(() => expect(html()).toContain('<option value="Exact/Route"'));
    for (const page of ['api', 'features', 'about']) {
      send('setSettingsPage', { page });
      expect(html()).not.toContain('model(s) available');
    }
    send('setSettingsPage', { page: 'api' });
    for (const tab of ['free', 'paid']) {
      send('setModelTab', { tab });
      expect(html()).not.toContain('model(s) available');
    }
  });

  it('opens API Config from the current model even after viewing About', async () => {
    send('openSettings');
    await vi.waitFor(() => expect(html()).toContain('id="settings-provider"'));
    send('setSettingsPage', { page: 'about' });
    expect(html()).not.toContain('id="settings-provider"');
    send('openApiConfig');
    await vi.waitFor(() => expect(html()).toContain('id="settings-provider"'));
    expect(html()).toContain('data-page="api" class="on"');
  });
});

describe('simple answer presentation', () => {
  it('shows one answer without appending the model and session details', async () => {
    harness.finalMessage = 'I am Moderado, your coding assistant.';
    send('prompt', { text: 'Who are you?' });
    await vi.waitFor(() => expect(String(harness.messages.at(-1)?.rows)).toContain(harness.finalMessage));
    const rows = String(harness.messages.at(-1)?.rows);
    expect(rows.match(/class="assistant"/g)).toHaveLength(1);
    expect(rows).not.toContain('>Session</span>');
    expect(rows).not.toContain('session s');
  });
});

describe('token usage header', () => {
  it('updates the MODERADO header from a validated usage event', () => {
    harness.agentOptions.onEvent({
      type: 'usage',
      usage: { promptTokens: 1234, completionTokens: 2345, totalTokens: 3579 },
      estimated: false,
      outputTokensPerSecond: 111.6,
      generationMs: 32100,
      final: true,
      timestamp: Date.now(),
    });
    expect(harness.messages.at(-1)?.tokenUsage)
      .toBe('In: 1234 | Out: 2345 | Total: 3579 | Rate: 112 tok/s');
    expect(harness.messages.at(-1)?.tokenUsageTitle)
      .toBe('Provider-reported token usage for the current task');
  });
});

describe('Gateway credential reference reuse', () => {
  it('retains the immutable stored reference when saving an existing browser login', async () => {
    send('gatewayBrowserLogin', { ...form, loginMethod: 'browser' });
    await vi.waitFor(() => expect(html()).toContain('<option value="Exact/Route"'));
    const originalReference = (harness.profile.connections as Record<string, Record<string, string>>)['moderado-cloud'].credentialReference;
    expect(originalReference).toMatch(/^moderado\/provider\/moderado-cloud-/);
    send('saveSettings', { ...form, loginMethod: 'browser' });
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalledTimes(2));
    expect((harness.profile.connections as Record<string, Record<string, string>>)['moderado-cloud'].credentialReference).toBe(originalReference);
    expect(harness.keys.get(originalReference)).toBe('mrd_browser-secret');
    expect(harness.browser).toHaveBeenCalledTimes(1);
  });
});

describe('legacy credential preservation', () => {
  it('saving a model choice preserves an existing CLI plaintext field without migrating it', async () => {
    harness.profile = { activeConnectionId: 'nvidia-nim', connections: { 'nvidia-nim': { id: 'nvidia-nim', kind: 'nvidia-nim', baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: 'legacy-fixture-key', defaultModel: 'auto', future: 'keep' } } };
    send('saveSettings', { preset: 'nvidia-nim', baseUrl: 'https://integrate.api.nvidia.com/v1', modelId: 'auto' });
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalled());
    expect((harness.profile.connections as Record<string, Record<string, unknown>>)['nvidia-nim']).toMatchObject({ apiKey: 'legacy-fixture-key', future: 'keep' });
    expect(harness.keys.size).toBe(0);
    expect(JSON.stringify(harness.messages)).not.toContain('legacy-fixture-key');
  });
  it('saving an existing manual Gateway login keeps its exact credential reference', async () => {
    send('setProviderKey', form);
    await vi.waitFor(() => expect(html()).toContain('<option value="Exact/Route"'));
    const reference = (harness.profile.connections as Record<string, Record<string, string>>)['moderado-cloud'].credentialReference;
    send('saveSettings', form);
    await vi.waitFor(() => expect(harness.write).toHaveBeenCalledTimes(2));
    expect((harness.profile.connections as Record<string, Record<string, string>>)['moderado-cloud'].credentialReference).toBe(reference);
    expect(harness.keys.size).toBe(1);
  });
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>, invalid: false,
  messages: [] as Record<string, unknown>[], keys: new Map<string, string>(),
  provider: undefined as any, receive: undefined as any,
  runs: [] as Record<string, unknown>[],
  workspaceRoot: '', fileDialog: vi.fn(), contextPicker: vi.fn(), findFiles: vi.fn(), errors: vi.fn(),
  prompt: vi.fn(), browser: vi.fn(), write: vi.fn(), openExternal: vi.fn(),
}));
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }),
    registerWebviewViewProvider: (_id: string, provider: unknown) => { harness.provider = provider; return { dispose: vi.fn() }; },
    showInputBox: harness.prompt, showOpenDialog: harness.fileDialog, showQuickPick: harness.contextPicker,
    showErrorMessage: harness.errors,
  },
  workspace: { get workspaceFolders() { return [{ uri: { fsPath: harness.workspaceRoot } }]; }, findFiles: harness.findFiles,
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) },
  commands: { registerCommand: () => ({ dispose: vi.fn() }) },
  env: { openExternal: harness.openExternal }, Uri: { parse: (url: string) => url, file: (fsPath: string) => ({ fsPath, scheme: 'file' }) },
  RelativePattern: class { constructor(public base: unknown, public pattern: string) {} },
}));
vi.mock('../src/profile.js', () => ({ configPath: () => 'isolated/config.json',
  readConfig: () => harness.invalid ? { kind: 'invalid', error: 'corrupt profile' } : { kind: 'ok', config: harness.profile } }));
vi.mock('../src/host.js', () => ({ AgentHost: class {
  listSessions() { return { sessions: [], invalid: [] }; }
  async discoverModels() { return []; }
  async startRun(input: Record<string, unknown>) {
    harness.runs.push(input);
    return { status: 'completed', finalMessage: null, model: String(input.modelId ?? 'auto'), totalSteps: 0, sessionId: 's' };
  }
  dispose() {} cancel() {}
} }));
vi.mock('../src/credentials.js', async (original) => {
  const actual = await original<typeof import('../src/credentials.js')>();
  return { ...actual, credentialManagerAvailable: () => true, WindowsCredentialStore: class {
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

const form = { preset: 'moderado-cloud', displayName: '', baseUrl: 'http://127.0.0.1:4788/v1', modelId: 'Exact/Route', loginMethod: 'manual' };
function send(type: string, values: Record<string, unknown> = {}) { harness.receive({ type, ...values }); }
const html = () => String(harness.messages.at(-1)?.settings ?? '');

beforeEach(() => {
  harness.workspaceRoot = mkdtempSync(join(tmpdir(), 'moderado-composer-workspace-'));
  harness.fileDialog.mockResolvedValue(undefined); harness.contextPicker.mockResolvedValue(undefined); harness.findFiles.mockResolvedValue([]);
  vi.clearAllMocks(); harness.messages = []; harness.keys.clear(); harness.profile = {}; harness.invalid = false; harness.runs = [];
  harness.prompt.mockResolvedValue('mrd_native-secret');
  harness.browser.mockResolvedValue({ accessToken: 'mrd_browser-secret', expiresAt: Date.now() + 60_000 });
  harness.write.mockImplementation((_path, patch) => {
    harness.profile = { ...harness.profile, ...patch, connections: { ...(harness.profile.connections as object), ...(patch.connections as object) } };
    return { written: true };
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ object: 'list', data: [
    { id: 'Exact/Route', provider: 'owner', owned_by: 'owner', capabilities: ['tools'], data_note: '<note>' },
  ] }))));
  activate({ subscriptions: [] } as any);
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
    expect(harness.keys.get('moderado/provider/moderado-cloud')).toBe('mrd_native-secret');
    expect(harness.profile).toMatchObject({ defaultModel: 'Exact/Route', connections: { 'moderado-cloud': {
      authMethod: 'manual', credentialReference: 'moderado/provider/moderado-cloud', defaultModel: 'Exact/Route',
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
    const outside = mkdtempSync(join(tmpdir(), 'moderado-explicit-file-'));
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

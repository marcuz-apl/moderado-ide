import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>, invalid: false,
  messages: [] as Record<string, unknown>[], keys: new Map<string, string>(),
  provider: undefined as any, receive: undefined as any,
  prompt: vi.fn(), browser: vi.fn(), write: vi.fn(), openExternal: vi.fn(),
}));
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }),
    registerWebviewViewProvider: (_id: string, provider: unknown) => { harness.provider = provider; return { dispose: vi.fn() }; },
    showInputBox: harness.prompt,
  },
  workspace: { workspaceFolders: [{ uri: { fsPath: 'D:/isolated-workspace' } }],
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) },
  commands: { registerCommand: () => ({ dispose: vi.fn() }) },
  env: { openExternal: harness.openExternal }, Uri: { parse: (url: string) => url },
}));
vi.mock('../src/profile.js', () => ({ configPath: () => 'isolated/config.json',
  readConfig: () => harness.invalid ? { kind: 'invalid', error: 'corrupt profile' } : { kind: 'ok', config: harness.profile } }));
vi.mock('../src/host.js', () => ({ AgentHost: class {
  listSessions() { return { sessions: [], invalid: [] }; }
  async discoverModels() { return []; }
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
  vi.clearAllMocks(); harness.messages = []; harness.keys.clear(); harness.profile = {}; harness.invalid = false;
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

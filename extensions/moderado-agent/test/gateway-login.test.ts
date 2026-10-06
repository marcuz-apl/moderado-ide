import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MemoryCredentialStore, WindowsCredentialStore, credentialReference } from '../src/credentials.js';
import {
  authorizeGatewayInBrowser, buildGatewayConnection, createGatewayOAuthRequest,
  exchangeGatewayOAuthCode, persistGatewayLogin, validateGatewayOAuthCallback,
} from '../src/gateway-login.js';

const key = 'mrd_test-secret';
const tokenResponse = () => Response.json({ access_token: key, token_type: 'Bearer', expires_in: 2_592_000 });
const callback = (authorizationUrl: string, changes?: (url: URL) => void) => {
  const authorize = new URL(authorizationUrl);
  const url = new URL(authorize.searchParams.get('redirect_uri')!);
  url.searchParams.set('state', authorize.searchParams.get('state')!);
  url.searchParams.set('code', 'one-time-code');
  changes?.(url);
  return url;
};

describe('Gateway connection and host-only credential persistence', () => {
  it('builds public access without a secret or reference', () => {
    expect(buildGatewayConnection('public', { baseUrl: 'http://127.0.0.1:4788/v1' })).toEqual({
      id: 'moderado-cloud', displayName: 'Moderado Gateway', kind: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:4788/v1', defaultModel: 'auto', authMethod: 'public',
    });
  });
  it('returns only metadata for manual and browser access', async () => {
    const store = new MemoryCredentialStore();
    for (const method of ['manual', 'browser'] as const) {
      const connection = await persistGatewayLogin(method, { key, expiresAt: Date.now() + 10000 }, store);
      expect(connection.credentialReference).toBe(credentialReference('moderado-cloud'));
      expect(JSON.stringify(connection)).not.toContain(key);
      expect(connection).not.toHaveProperty('apiKey');
      expect(await store.get(connection.credentialReference!)).toBe(key);
    }
  });
  it('clears a previous Gateway key when choosing public access', async () => {
    const store = new MemoryCredentialStore();
    await store.set(credentialReference('moderado-cloud'), key);
    await persistGatewayLogin('public', {}, store);
    expect(await store.get(credentialReference('moderado-cloud'))).toBeUndefined();
  });
  it('propagates a Windows credential deletion failure for public access', async () => {
    const store = new WindowsCredentialStore(async () => ({ stdout: '{"ok":false,"errorCode":5}', stderr: '' }));
    await expect(persistGatewayLogin('public', {}, store)).rejects.toThrow(/Credential Manager/);
  });
  it.each(['', 'wrong-prefix', 'mrd_', 'mrd_bad\nkey'])('rejects invalid manual keys without writing', async (value) => {
    const store = new MemoryCredentialStore();
    const set = vi.spyOn(store, 'set');
    await expect(persistGatewayLogin('manual', { key: value }, store)).rejects.toThrow(/key/i);
    expect(set).not.toHaveBeenCalled();
  });
  it('validates browser expiry and endpoint before storage', async () => {
    const store = new MemoryCredentialStore();
    const set = vi.spyOn(store, 'set');
    await expect(persistGatewayLogin('browser', { key, expiresAt: Date.now() - 1 }, store)).rejects.toThrow(/expir/i);
    await expect(persistGatewayLogin('manual', { key, baseUrl: 'http://remote.example/v1' }, store)).rejects.toThrow(/HTTPS/);
    expect(set).not.toHaveBeenCalled();
  });
});

describe('Gateway PKCE and callback boundary', () => {
  it('uses the registered client, exact redirect and random S256 PKCE', () => {
    const request = createGatewayOAuthRequest('http://127.0.0.1:51111/callback');
    const authorization = new URL(request.authorizationUrl);
    expect(authorization.origin + authorization.pathname).toBe('https://mod.alfazen.org/authorize');
    expect(authorization.searchParams.get('client_id')).toBe('moderado-cli');
    expect(authorization.searchParams.get('redirect_uri')).toBe(request.redirectUri);
    expect(authorization.searchParams.get('state')).toBe(request.state);
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('code_challenge')).toBe(createHash('sha256').update(request.verifier).digest('base64url'));
    expect(request.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createGatewayOAuthRequest(request.redirectUri).state).not.toBe(request.state);
  });
  it.each(['http://localhost:5000/callback', 'https://127.0.0.1:5000/callback', 'http://127.0.0.1:5000/other', 'http://127.0.0.1:5000/callback?x=y'])('rejects invalid redirects %s', (uri) => {
    expect(() => createGatewayOAuthRequest(uri)).toThrow(/callback/);
  });
  it('accepts only the exact path, origin, single state and single code', () => {
    const request = createGatewayOAuthRequest('http://127.0.0.1:51111/callback');
    const valid = `/callback?state=${request.state}&code=code`;
    expect(validateGatewayOAuthCallback(valid, request)).toBe('code');
    for (const value of [
      '/callback?code=code', '/callback?state=wrong&code=code', `${valid}&code=other`,
      `${valid}&state=${request.state}`, `/wrong?state=${request.state}&code=code`,
      `/a/../callback?state=${request.state}&code=code`, `http://elsewhere:51111${valid}`, `${valid}#fragment`,
    ]) expect(() => validateGatewayOAuthCallback(value, request)).toThrow();
  });
});

describe('Gateway token exchange', () => {
  it('posts the exact contract and returns only a host credential with expiry', async () => {
    const request = createGatewayOAuthRequest('http://127.0.0.1:51111/callback');
    const start = Date.now();
    const result = await exchangeGatewayOAuthCode('code', request, async (url, options) => {
      expect(String(url)).toBe('https://mod.alfazen.org/oauth/token');
      expect(options?.redirect).toBe('error');
      expect(options?.method).toBe('POST');
      expect(JSON.parse(String(options?.body))).toEqual({ code: 'code', verifier: request.verifier, client_id: 'moderado-cli', redirect_uri: request.redirectUri });
      return tokenResponse();
    });
    expect(result.accessToken).toBe(key);
    expect(result.expiresAt).toBeGreaterThanOrEqual(start + 2_592_000_000);
    await expect(exchangeGatewayOAuthCode('code', request, async () => tokenResponse())).rejects.toThrow(/used/);
  });
  it.each([
    {}, { access_token: key, token_type: 'Bearer' },
    { access_token: key, token_type: 'Bearer', expires_in: 0 },
    { access_token: key, token_type: 'Bearer', expires_in: 3600 },
    { access_token: 'invalid', token_type: 'Bearer', expires_in: 2_592_000 },
    { access_token: key, token_type: 'Basic', expires_in: 2_592_000 },
  ])('rejects missing, expired or malformed token responses', async (response) => {
    const request = createGatewayOAuthRequest('http://127.0.0.1:51111/callback');
    await expect(exchangeGatewayOAuthCode('code', request, async () => Response.json(response))).rejects.toThrow(/token/);
  });
  it('does not expose remote bodies or exceptions in errors', async () => {
    for (const fetchImpl of [async () => new Response(key, { status: 401 }), async () => { throw new Error(key); }]) {
      const request = createGatewayOAuthRequest('http://127.0.0.1:51111/callback');
      try { await exchangeGatewayOAuthCode('code', request, fetchImpl); throw new Error('Unexpected success'); }
      catch (error) { expect(String(error)).not.toContain(key); }
    }
  });
  it('rejects oversized responses and cancels an exchange even when fetch ignores abort', async () => {
    await expect(exchangeGatewayOAuthCode('code', createGatewayOAuthRequest('http://127.0.0.1:51111/callback'), async () => new Response('x'.repeat(65537)))).rejects.toThrow(/token response/);
    const controller = new AbortController();
    const exchange = exchangeGatewayOAuthCode('code', createGatewayOAuthRequest('http://127.0.0.1:51111/callback'), async () => new Promise(() => {}), controller.signal);
    controller.abort();
    await expect(exchange).rejects.toThrow(/cancel/);
  });
});

describe('one-shot loopback browser login', () => {
  it('exchanges a validated callback exactly once', async () => {
    const fetchImpl = vi.fn(async () => tokenResponse());
    const result = await authorizeGatewayInBrowser({
      openExternal: async (url) => {
        await fetch(callback(url));
        return true;
      }, fetchImpl, timeoutMs: 1000,
    });
    expect(result.accessToken).toBe(key);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it.each(['path', 'state', 'missing state'] as const)('denies a callback with invalid %s without token exchange', async (problem) => {
    const fetchImpl = vi.fn(async () => tokenResponse());
    await expect(authorizeGatewayInBrowser({
      openExternal: async (url) => {
        await fetch(callback(url, (uri) => {
          if (problem === 'path') uri.pathname = '/wrong';
          else if (problem === 'state') uri.searchParams.set('state', 'wrong');
          else uri.searchParams.delete('state');
        }));
        return true;
      }, fetchImpl, timeoutMs: 1000,
    })).rejects.toThrow(/callback|state/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('closes its callback listener on timeout', async () => {
    let uri: URL | undefined;
    await expect(authorizeGatewayInBrowser({ openExternal: async (url) => { uri = callback(url); return true; }, timeoutMs: 20 })).rejects.toThrow(/timed out/);
    await expect(fetch(uri!)).rejects.toThrow();
  });
  it('observes cancellation before browser launch and during exchange', async () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    const openExternal = vi.fn(async () => true);
    await expect(authorizeGatewayInBrowser({ openExternal, signal: alreadyAborted.signal })).rejects.toThrow(/cancel/);
    expect(openExternal).not.toHaveBeenCalled();
    const controller = new AbortController();
    await expect(authorizeGatewayInBrowser({
      openExternal: async (url) => { await fetch(callback(url)); return true; },
      signal: controller.signal, fetchImpl: async () => { controller.abort(); return tokenResponse(); }, timeoutMs: 1000,
    })).rejects.toThrow(/cancel/);
  });
  it('denies browser refusal and times out even if a dependency ignores abort', async () => {
    await expect(authorizeGatewayInBrowser({ openExternal: async () => false })).rejects.toThrow(/open/);
    await expect(authorizeGatewayInBrowser({ openExternal: async () => new Promise(() => {}), timeoutMs: 10 })).rejects.toThrow(/timed out/);
  });
  it('rejects a second callback while the first exchange is pending', async () => {
    const fetchImpl = vi.fn(async () => new Promise<Response>(() => {}));
    const controller = new AbortController();
    await expect(authorizeGatewayInBrowser({
      openExternal: async (url) => {
        await fetch(callback(url));
        expect((await fetch(callback(url))).status).toBe(410);
        controller.abort();
        return true;
      }, fetchImpl, signal: controller.signal, timeoutMs: 1000,
    })).rejects.toThrow(/cancel/);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

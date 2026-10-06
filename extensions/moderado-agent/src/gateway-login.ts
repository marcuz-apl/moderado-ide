import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { credentialReference, type CredentialStore } from './credentials.js';
import { validateProviderBaseUrl, type ProviderConnectionRecord } from './provider-setup.js';

const CLIENT_ID = 'moderado-cli'; // Existing registered Gateway client contract.
const AUTHORIZE_URL = 'https://mod.alfazen.org/authorize';
const TOKEN_URL = 'https://mod.alfazen.org/oauth/token';
const TOKEN_LIFETIME_SECONDS = 2_592_000;
const DEFAULT_TIMEOUT_MS = 120_000;

export type GatewayLoginMethod = 'public' | 'manual' | 'browser';
export interface GatewayLoginOptions {
  baseUrl?: string;
  /** Host input only; never return this object to a webview. */
  key?: string;
  expiresAt?: number;
}
export interface GatewayConnection extends ProviderConnectionRecord {
  authMethod: GatewayLoginMethod;
  credentialExpiresAt?: number;
}

function validKey(key: unknown): key is string {
  return typeof key === 'string' && /^mrd_[!-~]+$/.test(key) && key.length <= 2048;
}

/** Returns display/profile-safe metadata; no secret value is copied. */
export function buildGatewayConnection(method: GatewayLoginMethod, options: GatewayLoginOptions = {}): GatewayConnection {
  if (!['public', 'manual', 'browser'].includes(method)) throw new Error('Choose a valid Gateway login method.');
  const baseUrl = validateProviderBaseUrl(options.baseUrl ?? 'https://mod.alfazen.org/v1');
  if (method !== 'public' && !validKey(options.key)) throw new Error('Enter a valid Gateway key beginning with mrd_.');
  if (method === 'browser' && (typeof options.expiresAt !== 'number' || !Number.isFinite(options.expiresAt) || options.expiresAt <= Date.now())) {
    throw new Error('Gateway browser credential is missing a valid expiry or has expired.');
  }
  return {
    id: 'moderado-cloud', displayName: 'Moderado Gateway', kind: 'openai-compatible', baseUrl,
    defaultModel: 'auto', authMethod: method,
    ...(method !== 'public' ? { credentialReference: credentialReference('moderado-cloud') } : {}),
    ...(method === 'browser' ? { credentialExpiresAt: options.expiresAt } : {}),
  };
}

/** Call only from the extension host after its native prompt/browser flow. */
export async function persistGatewayLogin(method: GatewayLoginMethod, options: GatewayLoginOptions, store: CredentialStore): Promise<GatewayConnection> {
  const connection = buildGatewayConnection(method, options);
  const reference = credentialReference(connection.id);
  if (method === 'public') await store.delete(reference);
  else await store.set(reference, options.key!);
  return connection;
}

export interface GatewayOAuthRequest {
  state: string;
  verifier: string;
  redirectUri: string;
  authorizationUrl: string;
}

function validateRedirect(redirectUri: string): URL {
  let url: URL;
  try { url = new URL(redirectUri); }
  catch { throw new Error('Gateway browser login requires an exact loopback /callback URI.'); }
  // Check raw path too: URL normalizes dot segments and must not make them valid.
  const rawPath = redirectUri.match(/^http:\/\/[^/?#]+([^?#]*)/)?.[1];
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || rawPath !== '/callback' || url.pathname !== '/callback' || !url.port || url.search || url.hash || url.username || url.password) {
    throw new Error('Gateway browser login requires an exact 127.0.0.1 /callback URI with a port.');
  }
  return url;
}

export function createGatewayOAuthRequest(redirectUri: string): GatewayOAuthRequest {
  const callback = validateRedirect(redirectUri);
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const authorize = new URL(AUTHORIZE_URL);
  authorize.search = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: callback.toString(), state,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString();
  return { state, verifier, redirectUri: callback.toString(), authorizationUrl: authorize.toString() };
}

export function validateGatewayOAuthCallback(callbackUrl: string, request: GatewayOAuthRequest): string {
  const expected = validateRedirect(request.redirectUri);
  const rawPath = callbackUrl.startsWith('/') ? callbackUrl.split(/[?#]/, 1)[0] : callbackUrl.match(/^http:\/\/[^/?#]+([^?#]*)/)?.[1];
  if (rawPath !== '/callback') throw new Error('Gateway browser login callback path did not match.');
  let callback: URL;
  try { callback = new URL(callbackUrl, expected); }
  catch { throw new Error('Gateway browser login returned an invalid callback.'); }
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.hash || callback.username || callback.password) {
    throw new Error('Gateway browser login callback did not match the loopback URI.');
  }
  const states = callback.searchParams.getAll('state');
  const codes = callback.searchParams.getAll('code');
  if (states.length !== 1 || codes.length !== 1 || states[0] !== request.state) {
    throw new Error('Gateway browser login callback failed state validation.');
  }
  if (!codes[0] || codes[0].length > 2048 || /[\s\u0000-\u001f\u007f]/.test(codes[0])) throw new Error('Gateway browser login callback has an invalid code.');
  return codes[0];
}

export interface GatewayCredential { accessToken: string; expiresAt: number }
const exchangedRequests = new WeakSet<GatewayOAuthRequest>();

async function readTokenResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error('Gateway browser login returned an invalid token response.');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (signal.aborted) throw new Error('cancelled');
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 64 * 1024) { cancel(); throw new Error('oversized'); }
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch { throw new Error('Gateway browser login returned an invalid token response.'); }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

function withAbort<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(new Error('Gateway browser login token exchange was cancelled or timed out.'));
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    void operation().then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

/** Host-only credential result. Never send this return value to the webview. */
export async function exchangeGatewayOAuthCode(
  code: string, request: GatewayOAuthRequest, fetchImpl: typeof fetch = fetch, signal?: AbortSignal,
): Promise<GatewayCredential> {
  validateRedirect(request.redirectUri);
  if (!code || code.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(code) || !/^[A-Za-z0-9_-]{43}$/.test(request.verifier)) {
    throw new Error('Gateway browser login returned an invalid authorization code or verifier.');
  }
  if (exchangedRequests.has(request)) throw new Error('Gateway browser login authorization request has already been used.');
  exchangedRequests.add(request);
  const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const exchangeSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  return withAbort(async () => {
    let response: Response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: 'POST', redirect: 'error', signal: exchangeSignal,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ code, verifier: request.verifier, client_id: CLIENT_ID, redirect_uri: request.redirectUri }),
      });
    } catch { throw new Error('Gateway browser login token exchange failed.'); }
    if (!response.ok) throw new Error(`Gateway browser login token exchange failed (HTTP ${response.status}).`);
    const body = await readTokenResponse(response, exchangeSignal);
    if (exchangeSignal.aborted) throw new Error('Gateway browser login token exchange was cancelled.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Gateway browser login returned an invalid token response.');
    const token = body as Record<string, unknown>;
    if (!validKey(token.access_token) || typeof token.token_type !== 'string' || !/^Bearer$/i.test(token.token_type) || token.expires_in !== TOKEN_LIFETIME_SECONDS) {
      throw new Error('Gateway browser login returned an invalid or expired token response.');
    }
    return { accessToken: token.access_token, expiresAt: Date.now() + TOKEN_LIFETIME_SECONDS * 1000 };
  }, exchangeSignal);
}

export interface GatewayBrowserOptions {
  /** The host supplies vscode.env.openExternal; no VS Code dependency in auth. */
  openExternal: (authorizationUrl: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function authorizeGatewayInBrowser(options: GatewayBrowserOptions): Promise<GatewayCredential> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_TIMEOUT_MS) throw new Error('Gateway browser login timeout is invalid.');
  if (options.signal?.aborted) throw new Error('Gateway browser login was cancelled.');
  return new Promise<GatewayCredential>((resolve, reject) => {
    const exchangeAbort = new AbortController();
    let request: GatewayOAuthRequest | undefined;
    let received = false;
    let settled = false;
    const server = createServer((incoming, outgoing) => {
      outgoing.setHeader('content-type', 'text/plain; charset=utf-8');
      outgoing.setHeader('cache-control', 'no-store');
      outgoing.setHeader('connection', 'close');
      if (settled || received || !request) { outgoing.writeHead(410).end('Login is closed.'); return; }
      let code: string;
      try {
        if (incoming.method !== 'GET' || incoming.headers.host !== new URL(request.redirectUri).host) throw new Error('Gateway browser login callback did not match.');
        code = validateGatewayOAuthCallback(incoming.url ?? '', request);
      } catch (error) {
        outgoing.writeHead(400).end('Login callback was rejected. Return to Moderado Desktop.');
        finish(error instanceof Error ? error : new Error('Gateway callback was rejected.'));
        return;
      }
      received = true; // Consume the callback before the asynchronous exchange.
      outgoing.writeHead(200).end('Login callback received. Return to Moderado Desktop.');
      void exchangeGatewayOAuthCode(code, request, options.fetchImpl, exchangeAbort.signal).then(
        (credential) => finish(undefined, credential), (error: unknown) => finish(error instanceof Error ? error : new Error('Gateway token exchange failed.')),
      );
    });
    const finish = (error?: Error, credential?: GatewayCredential) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      exchangeAbort.abort();
      server.close();
      server.closeIdleConnections();
      // Flush callback responses, then destroy partial requests/active sockets.
      setImmediate(() => server.closeAllConnections());
      if (error) reject(error); else resolve(credential!);
    };
    const onAbort = () => finish(new Error('Gateway browser login was cancelled.'));
    const timer = setTimeout(() => finish(new Error('Gateway browser login timed out.')), timeoutMs);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    // Close the race between the initial signal check and installing its listener.
    if (options.signal?.aborted) { onAbort(); return; }
    server.on('error', () => finish(new Error('Gateway browser login could not open its loopback callback.')));
    server.listen(0, '127.0.0.1', () => {
      if (settled) { server.close(); return; }
      const address = server.address();
      if (!address || typeof address === 'string') { finish(new Error('Gateway callback address is unavailable.')); return; }
      request = createGatewayOAuthRequest(`http://127.0.0.1:${address.port}/callback`);
      void Promise.resolve().then(() => options.openExternal(request!.authorizationUrl)).then(
        (opened) => { if (!opened) finish(new Error('Gateway browser login could not open the browser.')); },
        () => finish(new Error('Gateway browser login could not open the browser.')),
      );
    });
  });
}

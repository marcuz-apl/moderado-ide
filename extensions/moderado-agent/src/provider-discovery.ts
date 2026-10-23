import {
  ModelInventoryEntrySchema,
  ProviderError,
  type ModelInventoryEntry,
} from '@moderado/contracts';
import { z } from 'zod';

export interface DiscoveryOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Request deadline in milliseconds; capped at 30 seconds. */
  timeoutMs?: number;
}

export interface GatewayRoute {
  id: string;
  access?: 'free' | 'paid';
  provider?: string;
  owned_by?: string;
  capabilities: string[];
  data_note?: string;
}

const GatewayRouteSchema = z.object({
  id: z.string().min(1),
  access: z.enum(['free', 'paid']).optional(),
  provider: z.string().optional(),
  owned_by: z.string().optional(),
  capabilities: z.array(z.string()),
  data_note: z.string().optional(),
}).strict();

const GatewayEnvelopeSchema = z.object({
  object: z.literal('list'),
  data: z.array(GatewayRouteSchema),
}).strict();

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

function requestDeadline(options: DiscoveryOptions): { signal: AbortSignal; dispose: () => void; didTimeout: () => boolean } {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(`Discovery timeout must be between 1 and ${MAX_TIMEOUT_MS} milliseconds`);
  }
  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) onCallerAbort();
  else options.signal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Discovery request timed out'));
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

async function getJson(url: string, apiKey: string | undefined, options: DiscoveryOptions): Promise<unknown> {
  const deadline = requestDeadline(options);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: deadline.signal,
    });
    if (!response.ok) {
      throw new ProviderError(`Model discovery failed with status ${response.status}`, 'ERR_HTTP_ERROR', response.status);
    }
    try {
      return await response.json() as unknown;
    } catch {
      throw new ProviderError('Model discovery returned invalid JSON', 'ERR_MALFORMED_RESPONSE');
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (deadline.didTimeout()) throw new ProviderError('Model discovery request timed out', 'ERR_TIMEOUT');
    if (options.signal?.aborted || deadline.signal.aborted) {
      throw new ProviderError('Model discovery request was aborted', 'ERR_ABORTED');
    }
    throw new ProviderError(networkFailureMessage(error, url), 'ERR_NETWORK_ERROR');
  } finally {
    deadline.dispose();
  }
}

function networkFailureMessage(error: unknown, requestUrl: string): string {
  const code = errorCode(error);
  const endpoint = safeEndpoint(requestUrl);
  let hostname = '';
  try { hostname = new URL(requestUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase(); } catch { /* Report without endpoint details. */ }
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (local && code === 'ECONNREFUSED') {
    const product = /:11434(?:$|\/)/.test(endpoint) ? 'Ollama' : /:1234(?:$|\/)/.test(endpoint) ? 'LM Studio' : 'local model server';
    return `No local model server is listening at ${endpoint}. Start ${product} or check the Base URL.`;
  }
  if (local && (code === 'EPERM' || code === 'EACCES')) {
    return `The operating system denied access to ${endpoint}. Check Moderado IDE's local network permissions and the Base URL.`;
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `Could not resolve the provider host${endpoint ? ` ${endpoint}` : ''}. Check the Base URL and network connection.`;
  }
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return `Connection to the provider${endpoint ? ` at ${endpoint}` : ''} timed out. Check the Base URL and network connection.`;
  }
  return `Model discovery network request failed${code ? ` (${code})` : ''}${endpoint ? ` for ${endpoint}` : ''}. Check the Base URL and network connection.`;
}

function safeEndpoint(requestUrl: string): string {
  try {
    const url = new URL(requestUrl);
    return `${url.hostname.replace(/^\[|\]$/g, '')}${url.port ? `:${url.port}` : ''}`;
  } catch { return ''; }
}

function errorCode(error: unknown): string | undefined {
  const seen = new Set<object>();
  const pending: unknown[] = [error];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if ('code' in current && typeof current.code === 'string') return current.code;
    if ('cause' in current) pending.push(current.cause);
    if ('errors' in current && Array.isArray(current.errors)) pending.push(...current.errors);
  }
  return undefined;
}

/** Fetch and strictly validate the Gateway's OpenAI-style route inventory. */
export async function fetchGatewayRoutes(baseUrl: string, options: DiscoveryOptions = {}): Promise<GatewayRoute[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  const json = await getJson(url, undefined, options);
  const result = GatewayEnvelopeSchema.safeParse(json);
  if (!result.success) throw new ProviderError('Gateway returned a malformed model catalog', 'ERR_MALFORMED_RESPONSE');
  return result.data.data;
}

/** Fetch and validate direct OpenAI-compatible model inventories. */
export async function fetchDirectModels(
  baseUrl: string,
  apiKey: string | undefined,
  options: DiscoveryOptions = {},
): Promise<ModelInventoryEntry[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  const json = await getJson(url, apiKey, options);
  const data = Array.isArray(json)
    ? json
    : typeof json === 'object' && json !== null && 'data' in json
      ? (json as { data: unknown }).data
      : undefined;
  if (!Array.isArray(data)) throw new ProviderError('Provider returned a malformed model catalog', 'ERR_MALFORMED_RESPONSE');
  const entries: ModelInventoryEntry[] = [];
  for (const item of data) {
    // Some providers add structured pricing tiers or overrides. Preserve the
    // model while marking that price as unknown so routing cannot treat a base
    // zero price as proof that every tier is free.
    let candidate = item;
    if (item && typeof item === 'object' && !Array.isArray(item) && 'pricing' in item) {
      const price = (item as Record<string, unknown>).pricing;
      const pricing = price && typeof price === 'object' && !Array.isArray(price)
        ? Object.fromEntries(Object.entries(price).map(([key, value]) => [key, typeof value === 'string' ? value : 'unknown']))
        : { unverified: 'unknown' };
      candidate = { ...item, pricing };
    }
    const parsed = ModelInventoryEntrySchema.safeParse(candidate);
    if (!parsed.success) throw new ProviderError('Provider returned a malformed model entry', 'ERR_MALFORMED_RESPONSE');
    entries.push(parsed.data);
  }
  return entries;
}

import { describe, expect, it, vi } from 'vitest';
import { fetchDirectModels, fetchGatewayRoutes } from '../src/provider-discovery.js';
import { isDesktopFreeModel } from '../src/provider-catalog.js';

describe('Gateway model discovery', () => {
  it('preserves a Gateway route ID and provider metadata', async () => {
    const routes = await fetchGatewayRoutes('http://127.0.0.1:4788/v1', {
      fetchImpl: async () => Response.json({
        object: 'list',
        data: [{ id: 'thinkingmachines/inkling:free', provider: 'openrouter', owned_by: 'openrouter', capabilities: ['text'], data_note: 'Owner verified for private use' }],
      }),
    });
    expect(routes[0]).toMatchObject({ id: 'thinkingmachines/inkling:free', provider: 'openrouter' });
  });

  it('accepts an empty catalog and all optional metadata fields', async () => {
    const routes = await fetchGatewayRoutes('https://gateway.example/v1', {
      fetchImpl: async () => Response.json({ object: 'list', data: [] }),
    });
    expect(routes).toEqual([]);
    const complete = await fetchGatewayRoutes('https://gateway.example/v1', {
      fetchImpl: async () => Response.json({
        object: 'list', data: [{ id: 'vendor/model:route', provider: 'vendor', owned_by: 'org', capabilities: ['text', 'tools'], data_note: 'verified' }],
      }),
    });
    expect(complete[0]).toEqual({ id: 'vendor/model:route', provider: 'vendor', owned_by: 'org', capabilities: ['text', 'tools'], data_note: 'verified' });
  });

  it('retains the Gateway access classification for each route', async () => {
    const routes = await fetchGatewayRoutes('https://gateway.example/v1', {
      fetchImpl: async () => Response.json({ object: 'list', data: [
        { id: 'free-route', capabilities: [], access: 'free' },
        { id: 'paid-route', capabilities: [], access: 'paid' },
      ] }),
    });
    expect(routes.map(route => route.access)).toEqual(['free', 'paid']);
  });

  it.each([
    ['wrong envelope', { object: 'array', data: [] }],
    ['missing ID', { object: 'list', data: [{ capabilities: [] }] }],
    ['empty ID', { object: 'list', data: [{ id: '', capabilities: [] }] }],
    ['malformed capabilities', { object: 'list', data: [{ id: 'route', capabilities: 'text' }] }],
    ['malformed metadata', { object: 'list', data: [{ id: 'route', capabilities: [], provider: 5 }] }],
    ['invalid access', { object: 'list', data: [{ id: 'route', capabilities: [], access: 'unknown' }] }],
    ['mixed valid and malformed entries', { object: 'list', data: [{ id: 'good', capabilities: [] }, { id: 'bad', capabilities: null }] }],
  ])('rejects %s', async (_name, payload) => {
    await expect(fetchGatewayRoutes('https://gateway.example/v1', {
      fetchImpl: async () => Response.json(payload),
    })).rejects.toThrow();
  });

  it('surfaces HTTP errors without parsing server bodies', async () => {
    await expect(fetchGatewayRoutes('https://gateway.example/v1', {
      fetchImpl: async () => new Response('secret body', { status: 503 }),
    })).rejects.toThrow(/503/);
  });
});

describe('direct provider model discovery', () => {
  it.each([
    ['array', [{ id: 'array/model', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }]],
    ['OpenAI envelope', { object: 'list', data: [{ id: 'envelope/model', pricing: { prompt: '0.2', completion: '0.4' }, supported_parameters: ['reasoning'] }] }],
  ])('accepts %s catalogs and preserves pricing', async (_name, payload) => {
    const models = await fetchDirectModels('https://provider.example/v1', 'key', {
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe('https://provider.example/v1/models');
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer key');
        return Response.json(payload);
      },
    });
    expect(models[0].pricing).toBeDefined();
    expect(models[0].supported_parameters).toBeDefined();
  });

  it('rejects malformed direct entries rather than dropping them', async () => {
    await expect(fetchDirectModels('https://provider.example/v1', undefined, {
      fetchImpl: async () => Response.json({ object: 'list', data: [{ id: 'good' }, { id: '' }] }),
    })).rejects.toThrow();
  });

  it.each([
    ['OpenRouter overrides', { overrides: [{ prompt: '1', completion: '1' }] }],
    ['OrcaRouter tiers', { tiers: [{ prompt: '1', completion: '1' }] }],
  ])('keeps models with nested %s pricing but does not classify their cost as free', async (_name, extra) => {
    const models = await fetchDirectModels('https://provider.example/v1', 'key', {
      fetchImpl: async () => Response.json({ object: 'list', data: [
        { id: 'provider/free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
        { id: 'provider/variable', pricing: { prompt: '0', completion: '0', ...extra }, supported_parameters: ['tools'] },
      ] }),
    });
    expect(models).toHaveLength(2);
    expect(models[0].pricing).toEqual({ prompt: '0', completion: '0' });
    expect(models[1].pricing).toEqual(expect.objectContaining({ prompt: '0', completion: '0', [Object.keys(extra)[0]]: 'unknown' }));
    expect(isDesktopFreeModel(models[1], 'openrouter')).toBe(false);
  });
});

describe('discovery timeout and cancellation', () => {
  it('aborts a stalled request at the requested bounded timeout', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    await expect(fetchGatewayRoutes('https://gateway.example/v1', { fetchImpl, timeoutMs: 5 })).rejects.toThrow(/timed out/i);
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('passes caller cancellation to the request', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      controller.abort();
    }));
    await expect(fetchDirectModels('https://provider.example/v1', undefined, {
      fetchImpl, signal: controller.signal, timeoutMs: 100,
    })).rejects.toThrow(/abort/i);
  });
});

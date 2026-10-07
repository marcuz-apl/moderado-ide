import { describe, expect, it } from 'vitest';
import { DesktopOpenAIAdapter } from '../src/provider-transport.js';

const options = { modelId: 'vendor/route:free', messages: [{ role: 'user' as const, content: 'hi' }] };
const collect = async (adapter: DesktopOpenAIAdapter, signal?: AbortSignal) => {
  const chunks = [];
  for await (const chunk of adapter.streamChat({ ...options, signal })) chunks.push(chunk);
  return chunks;
};
const adapterFor = (text: string) => new DesktopOpenAIAdapter({ id: 'moderado-cloud', name: 'Gateway', baseUrl: 'https://example.test/v1', fetchImpl: async () => new Response(text) });
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

describe('Desktop provider transport', () => {
  it('sends genuine image parts for mapped users and keeps ordinary text unchanged', async () => {
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1i0AAAAASUVORK5CYII=';
    let body: any;
    const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', imageContext: new Map([['hi', [{ id: '11111111-1111-4111-8111-111111111111', label: 'pixel.png', mimeType: 'image/png', data }]]]), fetchImpl: async (_url, init) => { body = JSON.parse(String(init?.body)); return new Response('data: [DONE]\n\n'); } });
    for await (const _chunk of adapter.streamChat({ modelId: 'vision', messages: [{ role: 'system', content: 'hi' }, { role: 'user', content: 'hi' }, { role: 'user', content: 'ordinary' }] })) {}
    expect(body.messages).toEqual([{ role: 'system', content: 'hi' }, { role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${data}` } }] }, { role: 'user', content: 'ordinary' }]);
  });

  it('refuses malformed image data before contacting the provider', async () => {
    let called = false;
    const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', imageContext: new Map([['hi', [{ id: '11111111-1111-4111-8111-111111111111', label: 'bad.png', mimeType: 'image/png', data: 'not-base64!' }]]]), fetchImpl: async () => { called = true; return new Response('data: [DONE]\n\n'); } });
    await expect(collect(adapter)).rejects.toThrow();
    expect(called).toBe(false);
  });

  it('serializes the exact route, messages, tools and token configuration', async () => {
    const adapter = new DesktopOpenAIAdapter({ id: 'moderado-cloud', name: 'Gateway', baseUrl: 'https://example.test/v1/', apiKey: 'test-key', fetchImpl: async (url, init) => {
      expect(url).toBe('https://example.test/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-key');
      expect(JSON.parse(String(init?.body))).toEqual({ model: 'vendor/route:free', stream: true, stream_options: { include_usage: true }, temperature: 0, max_tokens: 42,
        messages: [{ role: 'assistant', content: null, tool_calls: [{ id: 'call', type: 'function', function: { name: 'read', arguments: '{"path":"a"}' } }] }, { role: 'tool', tool_call_id: 'call', name: 'read', content: 'result' }],
        tools: [{ type: 'function', function: { name: 'read', description: 'Read', parameters: { type: 'object' } } }],
      });
      return new Response('data: [DONE]\n\n');
    } });
    for await (const chunk of adapter.streamChat({ modelId: options.modelId, messages: [{ role: 'assistant', content: null, toolCalls: [{ id: 'call', name: 'read', arguments: { path: 'a' } }] }, { role: 'tool', toolCallId: 'call', name: 'read', content: 'result', status: 'success' }], tools: [{ name: 'read', description: 'Read', parameters: { type: 'object' } }], temperature: 0, maxTokens: 42 })) expect(chunk).toBeUndefined();
  });

  it('parses fragmented UTF8/CRLF frames and preserves content, reasoning, tool order and usage', async () => {
    const text = ': heartbeat\r\n\r\n' + frame({ choices: [{ delta: { content: 'hé', reasoning_content: 'think', tool_calls: [{ index: 1, id: 'b', function: { name: 'read', arguments: '{' } }, { index: 0, id: 'a', function: { arguments: 'x' } }] }, finish_reason: null }] }).replaceAll('\n', '\r\n') + frame({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '}' } }] }, finish_reason: 'tool_calls' }] }) + frame({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }) + 'data: [DONE]\n\n' + frame({ choices: [{ delta: { content: 'ignored' } }] });
    const bytes = new TextEncoder().encode(text);
    const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', fetchImpl: async () => new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } })) });
    expect(await collect(adapter)).toEqual([
      { contentDelta: 'hé', reasoningDelta: 'think', toolCallChunks: [{ index: 1, id: 'b', name: 'read', argumentsDelta: '{' }, { index: 0, id: 'a', argumentsDelta: 'x' }], finishReason: null },
      { toolCallChunks: [{ index: 1, argumentsDelta: '}' }], finishReason: 'tool_calls' },
      { usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 } },
    ]);
  });

  it.each(['data: nope\n\n', frame({ choices: [{ delta: { content: 5 } }] }), frame({ choices: [{ delta: { tool_calls: [{ index: -1 }] } }] }), frame({ choices: [], usage: { prompt_tokens: -1, completion_tokens: 2 } }), 'data: ' + 'x'.repeat(1_048_577), frame({ choices: [{ delta: {}, finish_reason: 'bogus' }] })])('rejects malformed or oversized frames', async text => {
    await expect(collect(adapterFor(text))).rejects.toMatchObject({ code: 'ERR_MALFORMED_RESPONSE' });
  });

  it.each([[401, 'ERR_PROVIDER_AUTHENTICATION'], [429, 'ERR_PROVIDER_RATE_LIMIT'], [503, 'ERR_MODEL_UNAVAILABLE'], [400, 'ERR_HTTP_ERROR']])('classifies HTTP %s and hides its body', async (status, code) => {
    const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', fetchImpl: async () => new Response('secret-test-body', { status: Number(status) }) });
    await expect(collect(adapter)).rejects.toMatchObject({ code, statusCode: status });
    await expect(collect(adapter)).rejects.not.toThrow('secret-test-body');
  });

  it('classifies stream errors without exposing provider detail', async () => {
    await expect(collect(adapterFor(frame({ error: { code: 429, message: 'secret' } })))).rejects.toMatchObject({ code: 'ERR_PROVIDER_RATE_LIMIT' });
    await expect(collect(adapterFor(frame({ error: { code: 429, message: 'secret' } })))).rejects.not.toThrow('secret');
  });

  it('aborts stalled body reads and cancels the reader', async () => {
    const controller = new AbortController();
    let canceled = false;
    const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', fetchImpl: async () => new Response(new ReadableStream({ cancel() { canceled = true; } })) });
    const pending = collect(adapter, controller.signal);
    setTimeout(() => controller.abort(), 5);
    await expect(pending).rejects.toMatchObject({ code: 'ERR_ABORTED' });
    expect(canceled).toBe(true);
  });

  it('bounds stalled fetch and stalled stream with a timeout', async () => {
    for (const fetchImpl of [async () => new Promise<Response>(() => {}), async () => new Response(new ReadableStream())]) {
      const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', timeoutMs: 5, fetchImpl });
      await expect(collect(adapter)).rejects.toMatchObject({ code: 'ERR_PROVIDER_TIMEOUT' });
    }
  });

  it('does not start a request when already canceled', async () => {
    const controller = new AbortController(); controller.abort();
    let called = false;
    const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', fetchImpl: async () => { called = true; return new Response(); } });
    await expect(collect(adapter, controller.signal)).rejects.toMatchObject({ code: 'ERR_ABORTED' });
    expect(called).toBe(false);
  });

  it('delegates validated model discovery and omits authentication for public access', async () => {
    const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', fetchImpl: async (url, init) => { expect(url).toBe('https://example.test/v1/models'); expect(new Headers(init?.headers).has('Authorization')).toBe(false); return Response.json({ data: [{ id: 'model' }] }); } });
    expect(await adapter.discoverModels()).toMatchObject([{ id: 'model' }]);
  });

  it('releases a stream when the consumer stops early', async () => {
    let canceled = false;
    const bytes = new TextEncoder().encode(frame({ choices: [{ delta: { content: 'one' } }] }));
    const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', fetchImpl: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); }, cancel() { canceled = true; } })) });
    for await (const chunk of adapter.streamChat(options)) { expect(chunk.contentDelta).toBe('one'); break; }
    expect(canceled).toBe(true);
  });

  it('rejects truncated frames and invalid UTF8', async () => {
    await expect(collect(adapterFor('data: {"choices":[]}'))).rejects.toMatchObject({ code: 'ERR_MALFORMED_RESPONSE' });
    const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', fetchImpl: async () => new Response(Uint8Array.of(0xff)) });
    await expect(collect(adapter)).rejects.toMatchObject({ code: 'ERR_MALFORMED_RESPONSE' });
  });

  it.each(['', frame({ choices: [{ delta: { content: 'partial' }, finish_reason: null }] })])('rejects EOF without a terminal completion', async text => {
    await expect(collect(adapterFor(text))).rejects.toMatchObject({ code: 'ERR_MALFORMED_RESPONSE' });
  });

  it('accepts EOF after a terminal finish reason', async () => {
    expect(await collect(adapterFor(frame({ choices: [{ delta: { content: 'complete' }, finish_reason: 'stop' }] })))).toEqual([{ contentDelta: 'complete', finishReason: 'stop' }]);
  });

  it('does not expose network exception details', async () => {
    const adapter = new DesktopOpenAIAdapter({ id: 'x', name: 'X', baseUrl: 'https://example.test/v1', fetchImpl: async () => { throw new Error('secret-key'); } });
    await expect(collect(adapter)).rejects.toMatchObject({ code: 'ERR_NETWORK_ERROR', message: 'Provider network request failed' });
  });
});

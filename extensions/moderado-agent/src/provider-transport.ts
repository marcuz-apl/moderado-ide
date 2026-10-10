import {
  AuthenticationError, ChatCompletionChunkSchema, ChatUsageSchema, MalformedResponseError,
  ModelUnavailableError, ProviderError, ProviderTimeoutError, RateLimitError, ToolCallChunkSchema,
  type ChatCompletionChunk, type IProviderAdapter, type ModelInventoryEntry, type ProviderChatOptions,
} from '@moderado/contracts';
import { z } from 'zod';
import { ImageAttachmentSchema, type ImageAttachment } from './attachments.js';
import { fetchDirectModels } from './provider-discovery.js';

export interface DesktopOpenAIAdapterOptions {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  /** Overall chat request deadline, capped at five minutes. */
  timeoutMs?: number;
  imageContext?: ReadonlyMap<string, readonly ImageAttachment[]>;
}

const MAX_FRAME_CHARS = 1_048_576;
const WireChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({
      content: z.string().nullable().optional(),
      reasoning_content: z.string().nullable().optional(),
      thought: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        index: z.number().int().nonnegative(),
        id: z.string().optional(),
        type: z.literal('function').optional(),
        function: z.object({ name: z.string().optional(), arguments: z.string().optional() }).optional(),
      })).optional(),
    }),
    finish_reason: z.enum(['stop', 'tool_calls', 'length', 'error']).nullable().optional(),
  })),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative().optional(),
  }).nullable().optional(),
});

function statusError(status: number, retryAfter?: number): ProviderError {
  if (status === 401 || status === 403) return new AuthenticationError(undefined, status);
  if (status === 429) return new RateLimitError(undefined, retryAfter);
  if ([404, 410].includes(status) || status >= 500) return new ModelUnavailableError(undefined, status);
  return new ProviderError(`Provider request failed with status ${status}`, 'ERR_HTTP_ERROR', status);
}

function parseFrame(data: string): ChatCompletionChunk[] {
  let json: unknown;
  try { json = JSON.parse(data); } catch { throw new MalformedResponseError(); }
  if (typeof json === 'object' && json !== null && 'error' in json) {
    const error = (json as { error: unknown }).error;
    const parsed = z.object({ code: z.union([z.string(), z.number()]).optional(), status: z.number().optional() }).safeParse(error);
    const status = parsed.success ? Number(parsed.data.status ?? parsed.data.code) : NaN;
    throw Number.isInteger(status) && status >= 400 && status <= 599
      ? statusError(status)
      : new ProviderError('Provider reported a stream error', 'ERR_STREAM_ERROR');
  }
  const parsed = WireChunkSchema.safeParse(json);
  if (!parsed.success) throw new MalformedResponseError();
  const chunks: ChatCompletionChunk[] = [];
  for (const choice of parsed.data.choices) {
    const delta = choice.delta;
    const chunk: ChatCompletionChunk = {};
    if (delta.content != null) chunk.contentDelta = delta.content;
    const reasoning = delta.reasoning_content ?? delta.thought;
    if (reasoning != null) chunk.reasoningDelta = reasoning;
    if (delta.tool_calls?.length) chunk.toolCallChunks = delta.tool_calls.map(call => ToolCallChunkSchema.parse({
      index: call.index, id: call.id, name: call.function?.name, argumentsDelta: call.function?.arguments,
    }));
    if (choice.finish_reason !== undefined) chunk.finishReason = choice.finish_reason;
    if (Object.keys(chunk).length) chunks.push(ChatCompletionChunkSchema.parse(chunk));
  }
  if (parsed.data.usage) {
    const usage = parsed.data.usage;
    chunks.push({ usage: ChatUsageSchema.parse({ promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens ?? usage.prompt_tokens + usage.completion_tokens }) });
  }
  return chunks;
}

export class DesktopOpenAIAdapter implements IProviderAdapter {
  readonly id: string;
  readonly name: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: DesktopOpenAIAdapterOptions) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 120_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 300_000) {
      throw new RangeError('Provider timeout must be between 1 and 300000 milliseconds');
    }
  }

  discoverModels(signal?: AbortSignal): Promise<ModelInventoryEntry[]> {
    return fetchDirectModels(this.baseUrl, this.config.apiKey, { fetchImpl: this.config.fetchImpl, signal, timeoutMs: Math.min(this.timeoutMs, 30_000) });
  }

  async *streamChat(options: ProviderChatOptions): AsyncIterable<ChatCompletionChunk> {
    const controller = new AbortController();
    let timedOut = false;
    const abortError = () => timedOut ? new ProviderTimeoutError() : new ProviderError('Provider request was aborted', 'ERR_ABORTED');
    const onAbort = () => controller.abort();
    if (options.signal?.aborted) throw abortError();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    // Race both fetch and reader operations so even injected transports that ignore signals are bounded.
    const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
      if (controller.signal.aborted) throw abortError();
      let rejectAbort: () => void = () => {};
      const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(abortError()); controller.signal.addEventListener('abort', rejectAbort, { once: true }); });
      try { return await Promise.race([operation(), aborted]); }
      finally { controller.signal.removeEventListener('abort', rejectAbort); }
    };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const messages = options.messages.map(message => {
        if (message.role === 'assistant') return { role: message.role, content: message.content,
          ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) } : {}),
        };
        if (message.role === 'tool') return { role: message.role, tool_call_id: message.toolCallId, name: message.name, content: message.content };
        const images = message.role === 'user' ? this.config.imageContext?.get(message.content) : undefined;
        if (images?.length) return { role: 'user', content: [
          { type: 'text', text: message.content },
          ...images.map(image => { const validated = ImageAttachmentSchema.parse(image); return { type: 'image_url', image_url: { url: `data:${validated.mimeType};base64,${validated.data}` } }; }),
        ] };
        return { role: message.role, content: message.content };
      });
      const response = await bounded(() => (this.config.fetchImpl ?? fetch)(`${this.baseUrl}/chat/completions`, {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}) },
        body: JSON.stringify({ model: options.modelId, messages, stream: true, stream_options: { include_usage: true },
          ...(options.tools?.length ? { tools: options.tools.map(tool => ({ type: 'function', function: tool })) } : {}),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
        }), signal: controller.signal,
      }));
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        const retry = response.headers.get('Retry-After');
        if (this.config.id === 'moderado-cloud' && response.status === 401) {
          throw new AuthenticationError('Free Gateway models require a valid Moderado website API key. Open Moderado Settings to sign in or enter a key.', 401);
        }
        throw statusError(response.status, retry && /^\d+$/.test(retry) ? Number(retry) : undefined);
      }
      if (!response.body) throw new MalformedResponseError('Provider returned an empty stream');
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let pending = '';
      let dataLines: string[] = [];
      let frameSize = 0;
      let terminalCompletion = false;
      while (true) {
        const { value, done } = await bounded(() => reader!.read());
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = pending.indexOf('\n')) !== -1) {
          const line = pending.slice(0, newline).replace(/\r$/, '');
          pending = pending.slice(newline + 1);
          frameSize += line.length;
          if (frameSize > MAX_FRAME_CHARS) throw new MalformedResponseError('Provider stream frame exceeded size limit');
          if (line === '') {
            if (dataLines.length) {
              const data = dataLines.join('\n');
              if (data === '[DONE]') return;
              for (const chunk of parseFrame(data)) {
                if (chunk.finishReason != null) terminalCompletion = true;
                yield chunk;
              }
            }
            dataLines = []; frameSize = 0;
          } else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
        }
        if (pending.length + frameSize > MAX_FRAME_CHARS) throw new MalformedResponseError('Provider stream frame exceeded size limit');
        if (done) {
          if (pending.trim() || dataLines.length) throw new MalformedResponseError('Provider stream ended within a frame');
          if (!terminalCompletion) throw new MalformedResponseError('Provider stream ended before completion');
          return;
        }
      }
    } catch (error) {
      if (controller.signal.aborted) throw abortError();
      if (error instanceof ProviderError) throw error;
      if (error instanceof z.ZodError || error instanceof TypeError && /encoded data/i.test(error.message)) throw new MalformedResponseError();
      throw new ProviderError('Provider network request failed', 'ERR_NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      controller.abort();
      if (reader) {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  }
}

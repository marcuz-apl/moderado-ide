import type { ChatMessage } from '@moderado/contracts';

/**
 * Fitting an old conversation into a model's context window.
 *
 * The agent sends the whole stored conversation on every turn, and the engine
 * only bounds the number of steps, not the size of the prompt. A long chat
 * therefore grows until the provider refuses it. This narrows the prompt
 * instead: the oldest turns are replaced by a short digest, and the recent ones
 * stay verbatim.
 *
 * The summary is built from the messages themselves rather than by asking a
 * model, so compaction costs nothing, cannot fail, and gives the same answer
 * every time. The stored record is not reduced: only the prompt is.
 */

/** The budget used when nothing has been configured. */
export const DEFAULT_CONTEXT_BUDGET_TOKENS = 48_000;

/** The narrowest budget the settings pane accepts. */
export const MIN_CONTEXT_BUDGET_TOKENS = 4_000;

/** The widest budget the settings pane accepts. */
export const MAX_CONTEXT_BUDGET_TOKENS = 200_000;

/** The most digest lines, so a very long chat cannot rebuild the whole prompt. */
const MAX_DIGEST_LINES = 24;

/** The most characters one digest line keeps from a message. */
const DIGEST_LINE_CHARS = 160;

/**
 * Rough token count for text.
 *
 * Four characters per token is the usual English approximation and errs high on
 * code, which is the safe direction: a slightly early compaction is harmless,
 * while an over-long prompt is refused by the provider.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function tokensOf(message: ChatMessage): number {
  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content ?? '');
  return estimateTokens(content) + 4;
}

/** The tokens a whole message list is estimated to take. */
export function conversationTokens(messages: readonly ChatMessage[]): number {
  return messages.reduce((total, message) => total + tokensOf(message), 0);
}

export interface CompactionOptions {
  /** The most tokens the prompt may take, including the new request. */
  budgetTokens: number;
  /** The tail messages that stay verbatim when nothing else is needed. */
  keepRecent?: number;
}

export interface Compaction {
  /** The history to send. Unchanged when nothing had to be dropped. */
  messages: ChatMessage[];
  /** True when any message was replaced by the digest. */
  compacted: boolean;
  /** How many messages the digest stands in for. */
  dropped: number;
  /** True when even the kept tail and the request exceed the budget. */
  overBudget: boolean;
  /** Estimated prompt tokens after compaction, including the request. */
  tokens: number;
}

/** One line per dropped message, most recent last. */
function digestOf(messages: readonly ChatMessage[]): string {
  const lines = messages.map((message) => {
    const text = typeof message.content === 'string' ? message.content : '';
    const first = text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
    const clipped = first.length > DIGEST_LINE_CHARS
      ? `${first.slice(0, DIGEST_LINE_CHARS - 1)}…`
      : first;
    const who = message.role === 'user' ? 'You'
      : message.role === 'assistant' ? 'Moderado'
        : message.role === 'tool' ? 'Tool'
          : 'Context';
    return `- ${who}: ${clipped || '(no text)'}`;
  });
  const kept = lines.length > MAX_DIGEST_LINES
    ? [
        ...lines.slice(0, MAX_DIGEST_LINES - 21),
        `- (${lines.length - MAX_DIGEST_LINES} earlier messages omitted)`,
        ...lines.slice(-21),
      ]
    : lines;
  return [
    '[Earlier in this conversation, summarised because the model context is limited]',
    ...kept,
    '[End of the summary. The most recent turns follow in full.]',
  ].join('\n');
}

/**
 * Narrows a conversation until it fits the budget.
 *
 * The cut never leaves a tool result without the assistant turn that asked for
 * it, because a provider rejects a tool message that has no preceding call.
 */
export function compactConversation(
  history: readonly ChatMessage[],
  task: string,
  options: CompactionOptions,
): Compaction {
  const budget = Math.max(0, options.budgetTokens);
  const keepRecent = Math.max(0, options.keepRecent ?? 2);
  const requestTokens = estimateTokens(task);

  const tailTokens = (cut: number) => history.slice(cut).reduce((total, message) => total + tokensOf(message), 0);
  const fits = (cut: number): boolean => {
    const digest = cut === 0 ? 0 : estimateTokens(digestOf(history.slice(0, cut)));
    return requestTokens + tailTokens(cut) + digest <= budget;
  };

  const earliest = Math.max(0, history.length - keepRecent);
  let cut = 0;
  while (cut < earliest && !fits(cut)) cut += 1;
  // Never open on a tool result: it only makes sense right after its call.
  while (cut < history.length && history[cut]?.role === 'tool') cut += 1;
  cut = Math.min(cut, history.length);

  if (cut === 0) {
    return {
      messages: [...history],
      compacted: false,
      dropped: 0,
      overBudget: requestTokens + tailTokens(0) > budget,
      tokens: requestTokens + tailTokens(0),
    };
  }

  const digest: ChatMessage = {
    // A system message in the middle of history is not reliably honoured, and
    // the engine replaces a leading one with its own prompt, so the digest is
    // carried as an ordinary user turn.
    role: 'user',
    content: digestOf(history.slice(0, cut)),
  };
  const messages = [digest, ...history.slice(cut)];
  const tokens = requestTokens + conversationTokens(messages);
  return { messages, compacted: true, dropped: cut, overBudget: tokens > budget, tokens };
}

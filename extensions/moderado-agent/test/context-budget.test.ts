import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@moderado/contracts';
import {
  DEFAULT_CONTEXT_BUDGET_TOKENS,
  compactConversation,
  conversationTokens,
  estimateTokens,
} from '../src/context-budget.js';

const user = (text: string): ChatMessage => ({ role: 'user', content: text });
const reply = (text: string): ChatMessage => ({ role: 'assistant', content: text });

/** A conversation of alternating turns, each `size` characters. */
function turns(count: number, size = 400): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => index % 2 === 0
    ? user(`request ${index} ${'u'.repeat(size)}`)
    : reply(`answer ${index} ${'a'.repeat(size)}`));
}

describe('context budget', () => {
  it('estimates four characters per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    // A message carries a small per-message overhead on top of its text.
    expect(conversationTokens([user('')])).toBe(4);
  });

  it('leaves a short conversation untouched', () => {
    const history = turns(4, 20);
    const result = compactConversation(history, 'carry on', { budgetTokens: DEFAULT_CONTEXT_BUDGET_TOKENS });
    expect(result.compacted).toBe(false);
    expect(result.dropped).toBe(0);
    expect(result.messages).toEqual(history);
    expect(result.overBudget).toBe(false);
  });

  it('replaces the oldest turns with a digest that names them', () => {
    const history = turns(40);
    const result = compactConversation(history, 'and now?', { budgetTokens: 2_000 });
    expect(result.compacted).toBe(true);
    expect(result.dropped).toBeGreaterThan(0);
    // The digest stands first and is a normal turn, because the engine rewrites
    // a leading system message with its own prompt.
    expect(result.messages[0].role).toBe('user');
    expect(String(result.messages[0].content)).toContain('Earlier in this conversation');
    expect(String(result.messages[0].content)).toContain('- You: request 0');
    // Everything after the digest is the untouched tail.
    expect(result.messages.slice(1)).toEqual(history.slice(result.dropped));
  });

  it('fits the budget once it has compacted', () => {
    const history = turns(60);
    const result = compactConversation(history, 'continue', { budgetTokens: 3_000 });
    expect(result.overBudget).toBe(false);
    expect(result.tokens).toBeLessThanOrEqual(3_000);
  });

  it('keeps the recent tail even when the budget is tiny', () => {
    const history = turns(10, 2_000);
    const result = compactConversation(history, 'go on', { budgetTokens: 100 });
    // Two tail messages survive whatever the budget says, and the caller is
    // told the prompt is still too big rather than being silently truncated.
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    expect(result.overBudget).toBe(true);
  });

  it('never opens the tail on a tool result', () => {
    const history: ChatMessage[] = [
      user('read the file'),
      { role: 'assistant', content: 'reading' },
      { role: 'tool', content: 'x'.repeat(4_000) },
      user('thanks'),
      reply('done'),
    ];
    const result = compactConversation(history, 'next', { budgetTokens: 1_200 });
    expect(result.messages[1]?.role).not.toBe('tool');
  });

  it('bounds the digest so a very long chat cannot rebuild the prompt', () => {
    const history = turns(400, 40);
    const digest = String(compactConversation(history, 'go', { budgetTokens: 1_500 }).messages[0].content);
    const lines = digest.split('\n');
    expect(lines.length).toBeLessThanOrEqual(28);
    // The newest dropped turns are the ones worth keeping.
    expect(digest).toContain('earlier messages omitted');
  });

  it('does not mutate the history it was given', () => {
    const history = turns(20);
    const copy = JSON.parse(JSON.stringify(history));
    compactConversation(history, 'again', { budgetTokens: 500 });
    expect(history).toEqual(copy);
  });
});

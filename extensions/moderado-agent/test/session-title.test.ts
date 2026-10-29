import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@moderado/contracts';
import { CHAT_TITLE_MAX_CHARS, chatTitle } from '../src/session-title.js';

const user = (content: string): ChatMessage => ({ role: 'user', content });

describe('chat title', () => {
  it('uses the first line the user wrote', () => {
    expect(chatTitle([user('Fix the login bug.\nAnd the logout too.')])).toBe('Fix the login bug.');
  });

  it('strips markdown that would otherwise become the name', () => {
    expect(chatTitle([user('### Fix the login bug')])).toBe('Fix the login bug');
    expect(chatTitle([user('> why is this slow')])).toBe('why is this slow');
    expect(chatTitle([user('- add a retry')])).toBe('add a retry');
    expect(chatTitle([user('1. add a retry')])).toBe('add a retry');
    expect(chatTitle([user('**urgent** fix')])).toBe('urgent fix');
  });

  it('skips a message that only opens with a code fence', () => {
    expect(chatTitle([user('```ts\nconst a = 1;\n```')])).toBe('const a = 1;');
  });

  it('ignores blank lines and whitespace before the request', () => {
    expect(chatTitle([user('\n\n   Explain this.  \nmore')])).toBe('Explain this.');
  });

  it('falls through to the next user message when the first has no text', () => {
    expect(chatTitle([user('   \n  '), user('Second question')])).toBe('Second question');
  });

  it('shortens a long request at a word boundary', () => {
    const title = chatTitle([user('word '.repeat(40))]);
    expect(title.length).toBeLessThanOrEqual(CHAT_TITLE_MAX_CHARS + 1);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toContain('  ');
  });

  it('collapses inner whitespace and tabs', () => {
    expect(chatTitle([user('Fix\t\tthe   spacing')])).toBe('Fix the spacing');
  });

  it('returns nothing when no user message can name the chat', () => {
    expect(chatTitle([])).toBe('');
    expect(chatTitle([{ role: 'assistant', content: 'Hello.' }])).toBe('');
    // Content that is not text cannot become a name.
    expect(chatTitle([{ role: 'user', content: [{ type: 'image' }] } as unknown as ChatMessage])).toBe('');
  });
});

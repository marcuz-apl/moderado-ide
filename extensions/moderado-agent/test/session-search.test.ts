import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@moderado/contracts';
import { searchChats, type SearchableChat } from '../src/session-search.js';

const chat = (id: string, title: string, updatedAt: string, messages: ChatMessage[]): SearchableChat => ({ id, title, updatedAt, messages });

const chats: SearchableChat[] = [
  chat('a', 'Login bug', '2026-10-20T10:00:00.000Z', [
    { role: 'user', content: 'Fix the login bug in auth.ts.' },
    { role: 'assistant', content: 'The token expires early.' },
  ]),
  chat('b', 'Deploy script', '2026-10-22T10:00:00.000Z', [
    { role: 'user', content: 'Why does the deploy fail?' },
    { role: 'assistant', content: 'The LOGIN step is missing a secret.' },
  ]),
  chat('c', 'Notes', '2026-10-21T10:00:00.000Z', [
    { role: 'user', content: 'Remember the milk.' },
  ]),
];

describe('chat search', () => {
  it('lists every chat newest first when the query is empty', () => {
    expect(searchChats(chats, '   ').map((match) => match.id)).toEqual(['b', 'c', 'a']);
  });

  it('matches a chat by its name', () => {
    const matches = searchChats(chats, 'deploy');
    expect(matches.map((match) => match.id)).toEqual(['b']);
    expect(matches[0]).toMatchObject({ titleMatch: true, title: 'Deploy script' });
  });

  it('matches text inside a message, ignoring case', () => {
    const matches = searchChats(chats, 'login');
    // Both the title of one chat and the body of another match, newest first.
    expect(matches.map((match) => match.id)).toEqual(['b', 'a']);
    expect(matches[0]).toMatchObject({ id: 'b', titleMatch: false });
    expect(matches[0].snippet).toContain('LOGIN step');
    expect(matches[1]).toMatchObject({ id: 'a', titleMatch: true });
  });

  it('shows the line around the match rather than the whole message', () => {
    const long = 'x'.repeat(400);
    const only = [chat('long', 'Long', '2026-10-22T10:00:00.000Z', [{ role: 'user', content: `${long} needle ${long}` }])];
    const snippet = searchChats(only, 'needle')[0].snippet;
    expect(snippet).toContain('needle');
    expect(snippet.length).toBeLessThan(200);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('collapses whitespace in a snippet so it stays one line', () => {
    const only = [chat('multi', 'Multi', '2026-10-22T10:00:00.000Z', [{ role: 'user', content: 'first\n\nneedle\nlast' }])];
    expect(searchChats(only, 'needle')[0].snippet).not.toContain('\n');
  });

  it('returns nothing when no chat contains the query', () => {
    expect(searchChats(chats, 'kubernetes')).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    const copy = [...chats];
    searchChats(chats, '');
    expect(chats).toEqual(copy);
  });
});

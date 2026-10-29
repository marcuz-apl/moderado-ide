import { describe, expect, it } from 'vitest';
import { cleanupCandidates, DEFAULT_RETENTION_COUNT, type RetainableChat } from '../src/chat-retention.js';

const chat = (id: string, day: number): RetainableChat => ({
  id,
  title: `chat ${id}`,
  updatedAt: `2026-10-${day.toString().padStart(2, '0')}T10:00:00.000Z`,
});

describe('chat retention', () => {
  const chats = Array.from({ length: 60 }, (_, index) => chat(`c${index}`, (index % 28) + 1));

  it('proposes nothing while the history fits the limit', () => {
    expect(cleanupCandidates(chats.slice(0, 10), 50)).toEqual([]);
    expect(cleanupCandidates([], 50)).toEqual([]);
  });

  it('proposes as many chats as the history exceeds the limit by', () => {
    expect(cleanupCandidates(chats, DEFAULT_RETENTION_COUNT)).toHaveLength(10);
  });

  it('keeps the newest chats and proposes the oldest', () => {
    const ordered = [chat('new', 20), chat('middle', 15), chat('old', 10)];
    expect(cleanupCandidates(ordered, 2).map((item) => item.id)).toEqual(['old']);
    // Proposals are oldest first, which is the order a reader expects.
    expect(cleanupCandidates(ordered, 1).map((item) => item.id)).toEqual(['old', 'middle']);
  });

  it('never proposes the chat on screen', () => {
    const ordered = [chat('new', 20), chat('middle', 15), chat('old', 10)];
    expect(cleanupCandidates(ordered, 1, 'old').map((item) => item.id)).toEqual(['middle']);
  });

  it('tolerates a nonsensical limit rather than proposing everything', () => {
    expect(cleanupCandidates([chat('a', 1)], -5)).toHaveLength(1);
    expect(cleanupCandidates([chat('a', 1)], 2.7)).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    const ordered = [chat('b', 2), chat('a', 1)];
    cleanupCandidates(ordered, 1);
    expect(ordered.map((item) => item.id)).toEqual(['b', 'a']);
  });
});

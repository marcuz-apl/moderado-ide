import type { ChatMessage } from '@moderado/contracts';

/**
 * Finding an old chat again.
 *
 * A workspace accumulates sessions whose displayed titles can be similar or
 * unhelpful, so a search covers the chat's name and everything said in it, and
 * shows the line that matched. The matching is done here rather than left to the
 * quick pick, because the picker only sees the fields it is given.
 */

export interface SearchableChat {
  id: string;
  title: string;
  updatedAt: string;
  messages: readonly ChatMessage[];
}

export interface ChatMatch {
  id: string;
  title: string;
  /** The line that matched, or the reason it is listed when the query is empty. */
  snippet: string;
  /** True when the query matched the chat's name rather than its text. */
  titleMatch: boolean;
}

/** Characters of context kept on each side of a match. */
const SNIPPET_CONTEXT = 60;

function textOf(message: ChatMessage): string {
  const content = message.content;
  return typeof content === 'string' ? content : '';
}

/** The whole chat as one searchable string, with its name first. */
function haystackOf(chat: SearchableChat): string {
  return [chat.title, ...chat.messages.map(textOf)].join('\n').toLowerCase();
}

/** A single-line window around the first occurrence of `needle`. */
function snippetAround(text: string, needle: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const index = flat.toLowerCase().indexOf(needle);
  if (index < 0) return flat.slice(0, SNIPPET_CONTEXT * 2);
  const start = Math.max(0, index - SNIPPET_CONTEXT);
  const end = Math.min(flat.length, index + needle.length + SNIPPET_CONTEXT);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

/**
 * Chats whose name or text contain the query.
 *
 * An empty query lists every chat, newest first, which is what "show me my
 * chats" means. Matching is case-insensitive: a user looking for a bug does not
 * remember its capitalisation either.
 */
export function searchChats(chats: readonly SearchableChat[], query: string): ChatMatch[] {
  const needle = query.trim().toLowerCase();
  const ordered = [...chats].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (!needle) {
    return ordered.map((chat) => ({
      id: chat.id,
      title: chat.title,
      snippet: `${chat.messages.filter((message) => message.role === 'user').length} request(s)`,
      titleMatch: false,
    }));
  }
  const matches: ChatMatch[] = [];
  for (const chat of ordered) {
    if (!haystackOf(chat).includes(needle)) continue;
    if (chat.title.toLowerCase().includes(needle)) {
      matches.push({ id: chat.id, title: chat.title, snippet: 'Name matches', titleMatch: true });
      continue;
    }
    const message = chat.messages.find((item) => textOf(item).toLowerCase().includes(needle));
    matches.push({
      id: chat.id,
      title: chat.title,
      snippet: message ? snippetAround(textOf(message), needle) : '',
      titleMatch: false,
    });
  }
  return matches;
}

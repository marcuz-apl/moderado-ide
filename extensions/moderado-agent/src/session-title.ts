import type { ChatMessage } from '@moderado/contracts';

/**
 * The name a chat shows in the history.
 *
 * A chat gets its name from the first thing the user asked, and the user can
 * always rename it. Deriving it rather than storing it means the name stays
 * correct without a schema change, and survives the CLI rewriting a record.
 *
 * The first line of a request is often markdown (a heading, a bullet, a code
 * fence), so it is cleaned before it becomes a label: a chat called "```ts" or
 * "### Fix" says less than the words inside it.
 */

/** The longest name a chat gets before it is shortened. */
export const CHAT_TITLE_MAX_CHARS = 60;

/** Strips the markdown that would otherwise become the name. */
function cleanLine(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*>+\s*/, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shortens at a word boundary, so a name does not end mid-word. */
function shorten(text: string): string {
  if (text.length <= CHAT_TITLE_MAX_CHARS) return text;
  const cut = text.slice(0, CHAT_TITLE_MAX_CHARS);
  const space = cut.lastIndexOf(' ');
  const kept = space > CHAT_TITLE_MAX_CHARS * 0.5 ? cut.slice(0, space) : cut;
  return `${kept.trimEnd()}…`;
}

/**
 * The first usable line the user wrote, or '' when they have not written one.
 *
 * The caller supplies its own fallback, because the history panel and the
 * delete prompt name an unnamed chat differently.
 */
export function chatTitle(messages: readonly ChatMessage[]): string {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = typeof message.content === 'string' ? message.content : '';
    for (const line of text.split('\n')) {
      // A code fence is punctuation, not a name; the code inside is a better one.
      if (/^\s*(?:```|~~~)/.test(line)) continue;
      const cleaned = cleanLine(line);
      if (cleaned) return shorten(cleaned);
    }
  }
  return '';
}

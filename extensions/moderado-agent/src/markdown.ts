/**
 * A small, safe Markdown renderer for chat replies.
 *
 * A model reply is untrusted input, so this renderer never lets source text
 * become markup: every literal character is escaped, only a fixed set of tags
 * is emitted, and only `http`, `https`, and `mailto` targets are linked. It
 * covers the constructs a reply actually uses — headings, paragraphs, lists,
 * fenced code, block quotes, rules, and inline emphasis — and nothing else.
 *
 * It is deliberately not a general Markdown implementation. Tables, reference
 * links, footnotes, and raw HTML are not supported, and raw HTML in a reply is
 * shown as the text it is.
 */

import { escapeHtml } from './html.js';

/** Depth limit for nested inline constructs, so pathological input cannot recurse. */
const MAX_INLINE_DEPTH = 8;

/** Only these schemes become links. Anything else is rendered as plain text. */
const SAFE_LINK = /^(?:https?:\/\/|mailto:)/i;

/** A fence opener: three or more backticks or tildes, then an optional language. */
const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[ \t]*$/;

/** A thematic break: three or more of the same marker. */
const RULE = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;

/** An ATX heading. The marker must be followed by a space or end the line. */
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

/** A block quote marker. */
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;

/** An unordered list marker. The marker must be followed by whitespace. */
const UNORDERED = /^( *)([-*+])([ \t]+)(.*)$/;

/** An ordered list marker. The marker must be followed by whitespace. */
const ORDERED = /^( *)(\d{1,9})([.)])([ \t]+)(.*)$/;

/** An angle-bracket autolink. */
const AUTOLINK = /^<((?:https?:\/\/|mailto:)[^\s<>]*)>/i;

/** A bare URL, which becomes a link when it stands on its own. */
const BARE_URL = /^https?:\/\/[^\s<>()[\]"'`]+/i;

/** Characters a backslash may escape. */
const ESCAPABLE = new Set([
  '\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!',
  '>', '|', '~', '$', '&', '%', '=', '^', '"', "'", '/', ':', ';', '?', '@', ',',
]);

interface ListMarker {
  /** Spaces before the marker. */
  indent: number;
  /** True for `1.` style markers. */
  ordered: boolean;
  /** The first number of an ordered list. */
  start: number;
  /** The text after the marker. */
  text: string;
  /** Columns consumed by the marker and the whitespace after it. */
  width: number;
}

interface ParsedLink {
  label: string;
  url: string;
  /** The index just past the link. */
  end: number;
}

/** Render Markdown source to a safe HTML fragment. */
export function renderMarkdown(source: string): string {
  return renderBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

function renderBlocks(lines: string[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const block = renderFence(lines, i, fence[1] ?? '', fence[2] ?? '');
      out.push(block.html);
      i = block.next;
      continue;
    }

    if (RULE.test(line)) {
      out.push('<hr />');
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = (heading[1] ?? '').length;
      out.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`);
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const block = renderQuote(lines, i);
      out.push(block.html);
      i = block.next;
      continue;
    }

    if (listMarker(line)) {
      const block = renderList(lines, i);
      out.push(block.html);
      i = block.next;
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      if (current.trim() === '') break;
      if (paragraph.length > 0 && startsBlock(current)) break;
      paragraph.push(current);
      i += 1;
    }
    out.push(`<p>${renderInline(paragraph.join('\n'))}</p>`);
  }
  return out.join('');
}

/** A fenced code block. An unterminated fence still renders as a code block. */
function renderFence(lines: string[], start: number, marker: string, language: string): { html: string; next: number } {
  const closing = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`);
  const body: string[] = [];
  let i = start + 1;
  for (; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (closing.test(line)) {
      i += 1;
      break;
    }
    body.push(line);
  }
  const code = body.length > 0 ? `${body.join('\n')}\n` : '';
  const languageClass = /^[A-Za-z0-9_+#.-]{1,24}$/.test(language) ? ` class="language-${escapeHtml(language)}"` : '';
  return { html: `<pre><code${languageClass}>${escapeHtml(code)}</code></pre>`, next: i };
}

/** A block quote. A plain line continues the quote while the quote has content. */
function renderQuote(lines: string[], start: number): { html: string; next: number } {
  const inner: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const quoted = QUOTE.exec(line);
    if (quoted) {
      inner.push(quoted[1] ?? '');
      i += 1;
      continue;
    }
    if (line.trim() !== '' && inner.length > 0) {
      inner.push(line);
      i += 1;
      continue;
    }
    break;
  }
  return { html: `<blockquote>${renderBlocks(inner)}</blockquote>`, next: i };
}

/**
 * A list. Items are collected with their own continuation lines, then parsed
 * again, so a nested marker becomes a nested list.
 */
function renderList(lines: string[], start: number): { html: string; next: number } {
  const first = listMarker(lines[start] ?? '');
  if (!first) return { html: '', next: start + 1 };
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const marker = listMarker(lines[i] ?? '');
    if (!marker || marker.indent !== first.indent) break;
    const contentIndent = marker.indent + marker.width;
    const item: string[] = [marker.text];
    i += 1;
    while (i < lines.length) {
      const line = lines[i] ?? '';
      if (line.trim() === '') {
        // A blank line only belongs to the item when the list continues below it.
        const next = nextContent(lines, i);
        if (next === -1 || indentOf(lines[next] ?? '') < contentIndent) {
          i = next === -1 ? lines.length : next;
          break;
        }
        item.push('');
        i += 1;
        continue;
      }
      const nested = listMarker(line);
      if (nested && nested.indent <= marker.indent) break;
      if (indentOf(line) < contentIndent) {
        if (startsBlock(line)) break;
        item.push(line.trim());
        i += 1;
        continue;
      }
      item.push(stripIndent(line, contentIndent));
      i += 1;
    }
    items.push(`<li>${renderBlocks(item)}</li>`);
  }
  const tag = first.ordered ? 'ol' : 'ul';
  const startAttribute = first.ordered && first.start !== 1 ? ` start="${first.start}"` : '';
  return { html: `<${tag}${startAttribute}>${items.join('')}</${tag}>`, next: i };
}

function renderInline(text: string, depth = 0): string {
  if (depth > MAX_INLINE_DEPTH) return escapeHtml(text);
  const out: string[] = [];
  let plain = '';

  const flush = (): void => {
    if (plain === '') return;
    // Escaping first means the text can never contribute a tag of its own.
    out.push(escapeHtml(plain).replace(/\n/g, '<br />'));
    plain = '';
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // A bare URL becomes a link, but only where it stands on its own.
    if ((ch === 'h' || ch === 'H') && (i === 0 || !/[A-Za-z0-9]/.test(text[i - 1] ?? ''))) {
      const bare = BARE_URL.exec(text.slice(i));
      const url = (bare?.[0] ?? '').replace(/[.,;:!?]+$/, '');
      if (url.length > 0) {
        flush();
        out.push(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
        i += url.length;
        continue;
      }
    }

    if (ch === '\\' && i + 1 < text.length && ESCAPABLE.has(text[i + 1] ?? '')) {
      plain += text[i + 1];
      i += 2;
      continue;
    }

    if (ch === '`') {
      const span = codeSpan(text, i);
      if (span) {
        flush();
        out.push(`<code>${escapeHtml(span.text)}</code>`);
        i = span.end;
        continue;
      }
      plain += ch;
      i += 1;
      continue;
    }

    if (ch === '!' && text[i + 1] === '[') {
      const link = parseLink(text, i + 1);
      if (link) {
        flush();
        out.push(renderImage(link));
        i = link.end;
        continue;
      }
    }

    if (ch === '[') {
      const link = parseLink(text, i);
      if (link) {
        flush();
        out.push(renderAnchor(link, depth));
        i = link.end;
        continue;
      }
    }

    if (ch === '<') {
      const auto = AUTOLINK.exec(text.slice(i));
      if (auto) {
        const url = auto[1] ?? '';
        flush();
        // The label is the URL itself, so it is not run through the inline
        // renderer again: that would linkify the label inside the anchor.
        out.push(isSafeLink(url) ? `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>` : escapeHtml(auto[0]));
        i += auto[0].length;
        continue;
      }
    }

    if ((ch === '*' || ch === '_') && text[i + 1] === ch) {
      const close = text.indexOf(ch + ch, i + 2);
      if (close > i + 2) {
        flush();
        out.push(`<strong>${renderInline(text.slice(i + 2, close), depth + 1)}</strong>`);
        i = close + 2;
        continue;
      }
    }

    if (ch === '~' && text[i + 1] === '~') {
      const close = text.indexOf('~~', i + 2);
      if (close > i + 2) {
        flush();
        out.push(`<del>${renderInline(text.slice(i + 2, close), depth + 1)}</del>`);
        i = close + 2;
        continue;
      }
    }

    if (ch === '*' || ch === '_') {
      const close = emphasisClose(text, i);
      if (close !== -1) {
        flush();
        out.push(`<em>${renderInline(text.slice(i + 1, close), depth + 1)}</em>`);
        i = close + 1;
        continue;
      }
    }

    plain += ch;
    i += 1;
  }
  flush();
  return out.join('');
}

/** A code span, whose content is never interpreted again. */
function codeSpan(text: string, start: number): { text: string; end: number } | undefined {
  let run = 0;
  while (text[start + run] === '`') run += 1;
  const fence = '`'.repeat(run);
  let close = text.indexOf(fence, start + run);
  while (close !== -1) {
    const after = close + run;
    if (text[after] === '`') {
      // A longer run is not a closing fence of this length.
      close = text.indexOf(fence, after + 1);
      continue;
    }
    let content = text.slice(start + run, close);
    if (content.length > 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '') {
      content = content.slice(1, -1);
    }
    return { text: content, end: after };
  }
  return undefined;
}

/** A `[label](url)` link, with balanced parentheses in the target. */
function parseLink(text: string, start: number): ParsedLink | undefined {
  if (text[start] !== '[') return undefined;
  let depth = 0;
  let i = start;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0 || text[i] !== ']') return undefined;
  const label = text.slice(start + 1, i);
  if (text[i + 1] !== '(') return undefined;
  let parens = 0;
  let close = -1;
  for (let j = i + 2; j < text.length; j += 1) {
    const ch = text[j];
    if (ch === '(') parens += 1;
    else if (ch === ')') {
      if (parens === 0) {
        close = j;
        break;
      }
      parens -= 1;
    }
  }
  if (close === -1) return undefined;
  let url = text.slice(i + 2, close).trim();
  const title = /[ \t]+"[^"]*"$/.exec(url);
  if (title) url = url.slice(0, title.index).trim();
  return { label, url, end: close + 1 };
}

function renderAnchor(link: ParsedLink, depth: number): string {
  if (!isSafeLink(link.url)) return renderInline(link.label, depth + 1);
  return `<a href="${escapeHtml(link.url)}">${renderInline(link.label, depth + 1)}</a>`;
}

/**
 * An image cannot load: the chat webview's content security policy allows no
 * remote resource. It is shown as a link to the image instead.
 */
function renderImage(link: ParsedLink): string {
  const label = link.label.trim();
  if (!isSafeLink(link.url)) return escapeHtml(label);
  return `<a class="md-image" href="${escapeHtml(link.url)}">${escapeHtml(label || link.url)}</a>`;
}

function isSafeLink(url: string): boolean {
  return SAFE_LINK.test(url.trim());
}

/** The closing delimiter of an emphasis run, or -1. */
function emphasisClose(text: string, start: number): number {
  const marker = text[start];
  let j = start + 1;
  while (j < text.length) {
    const ch = text[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === marker) {
      if (j === start + 1) {
        j += 1;
        continue;
      }
      // An underscore inside a word is part of the word, not emphasis.
      if (marker === '_' && /\w/.test(text[j - 1] ?? '') && /\w/.test(text[j + 1] ?? '')) {
        j += 1;
        continue;
      }
      return j;
    }
    j += 1;
  }
  return -1;
}

/** The list marker of a line, if it starts one. */
function listMarker(line: string): ListMarker | undefined {
  const ordered = ORDERED.exec(line);
  if (ordered) {
    const indent = ordered[1] ?? '';
    const number = ordered[2] ?? '1';
    const delimiter = ordered[3] ?? '.';
    const space = ordered[4] ?? ' ';
    return {
      indent: indent.length,
      ordered: true,
      start: Number.parseInt(number, 10),
      text: ordered[5] ?? '',
      width: indent.length + number.length + delimiter.length + space.length,
    };
  }
  const unordered = UNORDERED.exec(line);
  if (unordered) {
    const indent = unordered[1] ?? '';
    const marker = unordered[2] ?? '-';
    const space = unordered[3] ?? ' ';
    return {
      indent: indent.length,
      ordered: false,
      start: 1,
      text: unordered[4] ?? '',
      width: indent.length + marker.length + space.length,
    };
  }
  return undefined;
}

/** Whether a line opens a block rather than continuing a paragraph. */
function startsBlock(line: string): boolean {
  return FENCE.test(line) || RULE.test(line) || HEADING.test(line) || QUOTE.test(line) || listMarker(line) !== undefined;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function stripIndent(line: string, count: number): string {
  let i = 0;
  while (i < count && i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
  return line.slice(i);
}

/** The index of the next line with content, or -1. */
function nextContent(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i += 1) {
    if ((lines[i] ?? '').trim() !== '') return i;
  }
  return -1;
}

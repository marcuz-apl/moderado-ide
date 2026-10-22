import type { ChatMessage } from '@moderado/contracts';

/**
 * Turning a recorded chat into a file the user owns.
 *
 * The export is plain Markdown so it opens in any editor, diff tool or issue
 * tracker. It reads the stored session and never the live panel, so what is
 * exported is exactly what the shared history holds.
 */

export interface ExportableSession {
  id: string;
  updatedAt: string;
  modelId?: string;
  mode?: string;
  messages: readonly ChatMessage[];
}

/** The label a role gets in the export. */
function roleLabel(role: ChatMessage['role']): string {
  if (role === 'user') return 'You';
  if (role === 'assistant') return 'Moderado';
  if (role === 'tool') return 'Tool';
  return 'System';
}

/** A fence that cannot be closed by the content it wraps. */
function fenced(text: string): string {
  const longest = (text.match(/`+/g) ?? []).reduce((most, run) => Math.max(most, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

function contentText(message: ChatMessage): string {
  const content = message.content;
  if (typeof content === 'string') return content.trim();
  // Image attachments and other structured content have no text to export.
  return content === undefined || content === null ? '' : '[non-text content]';
}

function isoDate(when: Date): string {
  return `${when.getFullYear().toString().padStart(4, '0')}-${(when.getMonth() + 1).toString().padStart(2, '0')}-${when.getDate().toString().padStart(2, '0')}`;
}

/**
 * The whole chat as Markdown.
 *
 * System messages are left out: they are prompt scaffolding, not something the
 * user said or the model answered.
 */
export function sessionMarkdown(session: ExportableSession, title: string, now: Date = new Date()): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    `- Exported: ${isoDate(now)}`,
    `- Chat: ${session.id}`,
    `- Model: ${session.modelId ?? 'not recorded'}`,
    `- Mode: ${session.mode ?? 'not recorded'}`,
    '',
    '---',
  ];
  for (const message of session.messages) {
    if (message.role === 'system') continue;
    const text = contentText(message);
    if (!text) continue;
    lines.push('', `## ${roleLabel(message.role)}`, '');
    // A tool result is machine output, so it is fenced; a human or model turn is
    // already Markdown and is left as written.
    lines.push(message.role === 'tool' ? fenced(text) : text);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * A file name for the export: dated, readable, and safe on Windows.
 *
 * Anything that is not a plain lowercase letter or digit collapses to a single
 * dash, so no title can escape the chosen folder or name a device.
 */
export function chatFileName(title: string, now: Date = new Date()): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `moderado-${isoDate(now)}-${slug || 'chat'}.md`;
}

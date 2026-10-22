import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@moderado/contracts';
import { chatFileName, sessionMarkdown } from '../src/session-export.js';

const when = new Date(2026, 9, 22);

const session = {
  id: '11111111-2222-3333-4444-555555555555',
  updatedAt: '2026-10-22T10:00:00.000Z',
  modelId: 'free/route',
  mode: 'Act',
  messages: [
    { role: 'system', content: 'You are Moderado.' },
    { role: 'user', content: 'Fix the login bug.' },
    { role: 'assistant', content: 'Looking at **auth.ts**.' },
    { role: 'tool', content: 'line 1\nline 2' },
  ] as ChatMessage[],
};

describe('session export', () => {
  it('writes a titled Markdown transcript with the metadata', () => {
    const markdown = sessionMarkdown(session, 'Login bug', when);
    expect(markdown.startsWith('# Login bug\n')).toBe(true);
    expect(markdown).toContain('- Exported: 2026-10-22');
    expect(markdown).toContain(`- Chat: ${session.id}`);
    expect(markdown).toContain('- Model: free/route');
    expect(markdown).toContain('## You\n\nFix the login bug.');
    expect(markdown).toContain('## Moderado\n\nLooking at **auth.ts**.');
    // A tool result is machine output, so it is fenced.
    expect(markdown).toContain('## Tool\n\n```text\nline 1\nline 2\n```');
  });

  it('leaves prompt scaffolding out', () => {
    expect(sessionMarkdown(session, 'Login bug', when)).not.toContain('You are Moderado.');
  });

  it('widens the fence when the tool output contains one', () => {
    const tricky: ChatMessage[] = [{ role: 'tool', content: 'before\n```\nafter' }];
    const markdown = sessionMarkdown({ ...session, messages: tricky }, 'Fences', when);
    expect(markdown).toContain('````text\nbefore\n```\nafter\n````');
  });

  it('skips empty turns instead of writing an empty heading', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: '   ' },
      { role: 'assistant', content: 'answer' },
    ];
    const markdown = sessionMarkdown({ ...session, messages }, 'Sparse', when);
    expect(markdown).not.toContain('## You');
    expect(markdown).toContain('## Moderado');
    expect(markdown).toContain('Model: free/route');
  });

  it('marks non-text content rather than dropping it silently', () => {
    const messages = [{ role: 'user', content: [{ type: 'image' }] }] as unknown as ChatMessage[];
    expect(sessionMarkdown({ ...session, messages }, 'Image', when)).toContain('[non-text content]');
  });

  it('names the file by date and title, and keeps it path safe', () => {
    expect(chatFileName('Fix the login bug', when)).toBe('moderado-2026-10-22-fix-the-login-bug.md');
    expect(chatFileName('../../etc/passwd', when)).toBe('moderado-2026-10-22-etc-passwd.md');
    expect(chatFileName('CON', when)).toBe('moderado-2026-10-22-con.md');
    // A title with nothing safe left still yields a usable name.
    expect(chatFileName('日本語', when)).toBe('moderado-2026-10-22-chat.md');
    expect(chatFileName('   ', when)).toBe('moderado-2026-10-22-chat.md');
  });

  it('bounds the slug so the path stays short', () => {
    const name = chatFileName('a'.repeat(200), when);
    expect(name.length).toBeLessThanOrEqual(90);
  });
});

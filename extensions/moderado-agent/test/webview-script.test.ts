import { describe, expect, it } from 'vitest';
import { Script } from 'node:vm';
import { chatHtml, ChatViewState } from '../src/chat-view.js';
import { emptySettings, SettingsState } from '../src/settings-view.js';

const preview = () => 'preview';

/** The webview's inline script, exactly as the browser would see it. */
function scriptOf(html: string): string {
  const open = html.indexOf('<script nonce="');
  const start = html.indexOf('>', open) + 1;
  const end = html.indexOf('</script>', start);
  return html.slice(start, end);
}

function state(over: Partial<ChatViewState> = {}): ChatViewState {
  return {
    transcript: [],
    running: false,
    pendingApproval: null,
    settings: { ...emptySettings(), open: true },
    ...over,
  };
}

/**
 * The webview script is emitted verbatim from a TypeScript template literal, so
 * a stray type annotation in it reaches the browser as invalid JavaScript. The
 * whole script then fails to parse, no event handler is ever bound, and every
 * control in the panel silently stops responding. Parsing the script here is
 * the only way to catch that before the editor ships it.
 */
function expectParses(label: string, html: string): void {
  const script = scriptOf(html);
  try {
    new Script(script, { filename: 'webview-inline.js' });
  } catch (error) {
    const err = error as Error & { stack?: string };
    const match = /webview-inline\.js:(\d+)/.exec(err.stack ?? '');
    const lines = script.split('\n');
    const context = match
      ? lines.slice(Math.max(0, Number(match[1]) - 4), Number(match[1]) + 3)
        .map((line, index) => `  ${line}`).join('\n')
      : '';
    throw new Error(`${label}: the webview script is not valid JavaScript: ${err.message}\n${context}`);
  }
}

describe('webview inline script', () => {
  it('parses with the settings pane open', () => {
    expectParses('settings open', chatHtml(state(), preview));
  });

  it('parses with the settings pane closed', () => {
    expectParses('settings closed', chatHtml(state({ settings: emptySettings() }), preview));
  });

  it('parses with a populated settings pane', () => {
    const settings: SettingsState = {
      ...emptySettings(),
      open: true,
      preset: 'moderado-cloud',
      status: 'Saved.',
      providers: [{ value: 'moderado-cloud', label: 'Moderado', description: 'Use browser sign-in.' }],
      models: [{ id: 'auto', name: 'auto', tier: 'unknown' }],
    };
    expectParses('populated settings', chatHtml(state({ settings }), preview));
  });

  it('parses with transcript entries, attachments, and a pending approval', () => {
    expectParses('busy view', chatHtml(state({
      running: true,
      transcript: [
        { kind: 'user', label: 'You', text: 'hello' },
        { kind: 'assistant', label: 'Moderado', text: 'hi' },
        { kind: 'error', label: 'Error', text: 'boom' },
      ],
      attachments: [{ id: '11111111-1111-4111-8111-111111111111', kind: 'image', label: 'shot.png' }],
      activeProviderName: 'Moderado',
      activeModelId: 'auto',
    }), preview));
  });

  it('redacts a Gateway key pasted into the composer', () => {
    const script = scriptOf(chatHtml(state(), preview));
    expect(script).toContain('redactGatewayKeys');
    expect(script).toContain('REDACTED Gateway key');
  });
});

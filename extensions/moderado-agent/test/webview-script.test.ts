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

type Listener = (event: Record<string, unknown>) => void;

class StubElement {
  readonly listeners = new Map<string, Listener[]>();
  readonly attributes = new Map<string, string>();
  readonly classList = { toggle: () => {}, add: () => {}, remove: () => {} };
  readonly style = { setProperty: () => {}, removeProperty: () => {} };
  readonly children: StubElement[] = [];
  value = '';
  defaultValue = '';
  selectionStart = 0;
  selectionEnd = 0;
  disabled = false;
  checked = false;
  type = 'text';
  textContent = '';
  innerHTML = '';
  scrollHeight = 0;
  scrollTop = 0;
  clientHeight = 0;
  dataset: Record<string, string> = {};

  constructor(readonly id: string) {}

  addEventListener(name: string, listener: Listener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  emit(name: string, event: Record<string, unknown> = {}): void {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }

  setSelectionRange(start: number, end: number): void {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  contains(): boolean { return false; }
  closest(): null { return null; }
  querySelector(): null { return null; }
  requestSubmit(): void {}
  insertAdjacentHTML(): void {}
  focus(): void {}
  remove(): void {}
}

function runChatScript(savedState?: unknown) {
  const elements = new Map<string, StubElement>();
  const getElementById = (id: string): StubElement => {
    let element = elements.get(id);
    if (!element) {
      element = new StubElement(id);
      elements.set(id, element);
    }
    return element;
  };
  let currentState = savedState;
  const messages: unknown[] = [];
  const document = {
    body: getElementById('body'),
    activeElement: null as StubElement | null,
    getElementById,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    getSelection: () => ({ isCollapsed: true, rangeCount: 0 }),
  };
  getElementById('prompt').focus = () => { document.activeElement = getElementById('prompt'); };
  const api = {
    getState: () => currentState,
    setState: (next: unknown) => { currentState = next; },
    postMessage: (message: unknown) => { messages.push(message); },
  };
  const script = new Script(scriptOf(chatHtml(state({ settings: emptySettings() }), preview)), { filename: 'webview-inline.js' });
  script.runInNewContext({
    acquireVsCodeApi: () => api,
    document,
    window: { addEventListener: () => {} },
    Element: StubElement,
    setTimeout: () => 1,
    clearTimeout: () => {},
    console,
  });
  return { elements, messages, getState: () => currentState };
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

  it('leaves ArrowUp on a middle line of a browsed multiline prompt to the caret', () => {
    const { elements } = runChatScript({ promptHistory: ['first line\nsecond line', 'newest prompt'] });
    const input = elements.get('prompt')!;
    const up = { key: 'ArrowUp', prevented: false, preventDefault() { this.prevented = true; } };

    input.emit('keydown', up);
    input.emit('keydown', up);
    expect(input.value).toBe('first line\nsecond line');
    input.setSelectionRange('first line\n'.length + 2, 'first line\n'.length + 2);
    up.prevented = false;
    input.emit('keydown', up);

    expect(up.prevented).toBe(false);
    expect(input.value).toBe('first line\nsecond line');
  });

  it('leaves ArrowDown on a middle line of a browsed multiline prompt to the caret', () => {
    const { elements } = runChatScript({ promptHistory: ['first line\nsecond line', 'newest prompt'] });
    const input = elements.get('prompt')!;
    const up = { key: 'ArrowUp', prevented: false, preventDefault() { this.prevented = true; } };
    const down = { key: 'ArrowDown', prevented: false, preventDefault() { this.prevented = true; } };

    input.emit('keydown', up);
    input.emit('keydown', up);
    expect(input.value).toBe('first line\nsecond line');
    input.setSelectionRange(2, 2);
    input.emit('keydown', down);

    expect(down.prevented).toBe(false);
    expect(input.value).toBe('first line\nsecond line');
  });

  it('leaves a selected range in a browsed prompt to normal keyboard behavior', () => {
    const { elements } = runChatScript({ promptHistory: ['older prompt', 'newest prompt'] });
    const input = elements.get('prompt')!;
    const up = { key: 'ArrowUp', prevented: false, preventDefault() { this.prevented = true; } };
    const down = { key: 'ArrowDown', prevented: false, preventDefault() { this.prevented = true; } };

    input.emit('keydown', up);
    input.setSelectionRange(2, 7);
    input.emit('keydown', down);

    expect(down.prevented).toBe(false);
    expect(input.value).toBe('newest prompt');
  });

  it('browses to older and newer prompts and restores the unsent draft', () => {
    const { elements } = runChatScript({ promptHistory: ['older prompt', 'newest prompt'] });
    const input = elements.get('prompt')!;
    input.value = 'unsent draft';
    const key = (name: string) => ({
      key: name,
      prevented: false,
      preventDefault() { this.prevented = true; },
    });
    const upToNewest = key('ArrowUp');
    input.emit('keydown', upToNewest);
    expect(upToNewest.prevented).toBe(true);
    expect(input.value).toBe('newest prompt');
    input.emit('keydown', key('ArrowUp'));
    expect(input.value).toBe('older prompt');
    const upAtOldest = key('ArrowUp');
    input.emit('keydown', upAtOldest);
    expect(upAtOldest.prevented).toBe(true);
    expect(input.value).toBe('older prompt');
    input.emit('keydown', key('ArrowDown'));
    expect(input.value).toBe('newest prompt');
    input.emit('keydown', key('ArrowDown'));
    expect(input.value).toBe('unsent draft');
    const downAtDraft = key('ArrowDown');
    input.emit('keydown', downAtDraft);
    expect(downAtDraft.prevented).toBe(false);
    expect(input.value).toBe('unsent draft');
  });

  it('resets browsing after the user edits an input field', () => {
    const { elements } = runChatScript({ promptHistory: ['older prompt', 'newest prompt'] });
    const input = elements.get('prompt')!;
    input.emit('keydown', { key: 'ArrowUp', preventDefault() {} });
    input.value = 'edited text';
    input.emit('input');
    input.emit('keydown', { key: 'ArrowDown', preventDefault() {} });

    expect(input.value).toBe('edited text');
  });

  it('filters and caps persisted prompt history at 100 entries', () => {
    const history = [null, '  ', ...Array.from({ length: 105 }, (_, index) => `prompt ${index}`)];
    const { elements, getState } = runChatScript({ promptHistory: history });
    const input = elements.get('prompt')!;
    input.value = 'new prompt';
    elements.get('composer')!.emit('submit', { preventDefault() {} });

    const saved = getState() as { promptHistory: string[] };
    expect(saved.promptHistory).toHaveLength(100);
    expect(saved.promptHistory[0]).toBe('prompt 6');
    expect(saved.promptHistory.at(-1)).toBe('new prompt');
    expect(saved.promptHistory.every((prompt) => typeof prompt === 'string' && prompt.trim())).toBe(true);
  });
});

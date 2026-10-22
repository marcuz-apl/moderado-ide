import { describe, expect, it } from 'vitest';
import type { ApprovalRequest } from '@moderado/contracts';
import { chatHtml, emptyAutoApprove, escapeHtml, transcriptEntryHtml, viewSnapshot, ChatViewState } from '../src/chat-view.js';
import {
  settingsPaneHtml,
  settingsSnapshot,
  parseSettingsForm,
  parseSettingsSubmission,
  SettingsState,
  emptySettings,
} from '../src/settings-view.js';
import { buildProviderChoices } from '../src/provider-setup.js';

const preview = () => 'preview';

function state(over: Partial<ChatViewState> = {}): ChatViewState {
  return { transcript: [], running: false, pendingApproval: null, ...over };
}

/** The declaration block of one CSS rule in the generated stylesheet. */
const cssRule = (html: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(html);
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
};

describe('chat view', () => {
  it('places project context before file/image attachment controls instead of a new-task plus', () => {
    const html = chatHtml(state(), preview);
    expect(html).toContain('id="foot-context"');
    expect(html).toContain('aria-label="Add context"');
    expect(html).toContain('id="foot-add"');
    expect(html).toContain('aria-label="Add files and Images"');
    expect(html.indexOf('id="foot-context"')).toBeLessThan(html.indexOf('id="foot-add"'));
    expect(html).toContain("postMessage({ type: 'addContext' })");
    expect(html).toContain("postMessage({ type: 'addFiles' })");
    expect(html).not.toContain('id="foot-new"');
  });

  it('escapes removable attachment labels and exposes only their opaque ids', () => {
    const html = chatHtml(state({ attachments: [{ id: '11111111-1111-4111-8111-111111111111', kind: 'image', label: '<img src=x onerror=bad>' }] }), preview);
    expect(html).toContain('&lt;img src=x onerror=bad&gt;');
    expect(html).not.toContain('<img src=x onerror=bad>');
    expect(html).toContain('data-attachment-id="11111111-1111-4111-8111-111111111111"');
    expect(html).toContain("type: 'removeAttachment'");
    expect(viewSnapshot(state(), preview).attachments).toBe('');
  });

  it('differentiates the user input from the Moderado reply', () => {
    // The user's own message is tinted and carries its own accent; the reply
    // stays on the panel canvas, so the answer keeps the full reading surface.
    const html = chatHtml(state(), preview);
    const user = cssRule(html, 'li.user');
    expect(user).toMatch(/background:/);
    expect(user).toMatch(/border-left-color:\s*var\(--vscode-focusBorder\)/);
    expect(cssRule(html, 'li')).not.toMatch(/background:/);
  });

  it('indents the user input', () => {
    const html = chatHtml(state(), preview);
    const leftMargin = (rule: string) =>
      Number.parseFloat((/margin:\s*([^;]+)/.exec(rule)?.[1] ?? '0 0 0 0').split(/\s+/)[3] ?? '0');
    expect(leftMargin(cssRule(html, 'li.user'))).toBeGreaterThan(leftMargin(cssRule(html, 'li')));
  });

  it('wraps every stylesheet in a style element', () => {
    // The regression: the stylesheet was emitted as bare text in <head>, so the
    // browser rendered the whole CSS block as visible body text and none of it
    // applied. There must be exactly one <style>, opening before any rule and
    // closing before </head>, with no CSS sitting outside it.
    const html = chatHtml(state(), preview);
    expect(html.split('<style>').length - 1).toBe(1);
    expect(html.split('</style>').length - 1).toBe(1);

    const styleStart = html.indexOf('<style>');
    const styleEnd = html.indexOf('</style>');
    const firstRule = html.indexOf('body {');
    expect(styleStart).toBeGreaterThan(-1);
    expect(firstRule).toBeGreaterThan(styleStart);
    expect(firstRule).toBeLessThan(styleEnd);
    // Nothing but the title precedes the stylesheet in <head>.
    expect(html.slice(styleStart, styleEnd)).toMatch(/^<style>\s*body \{/);
  });

  it('defines sr-only so the composer label is not shown', () => {
    // The label is accessibility-only. Without the rule it renders as visible
    // text beside the composer, as happened in the screenshot.
    const html = chatHtml(state(), preview);
    expect(html).toContain('<label class="sr-only"');
    expect(html).toMatch(/\.sr-only\s*\{[^}]*position:\s*absolute/);
    // The settings model dropdown is hidden on purpose: the model cards are the
    // visible picker. Defining .sr-only must actually hide it, which needs the
    // .settings scope to outrank `.settings input, .settings select`.
    expect(html).toMatch(/\.settings\s+\.sr-only\s*\{[^}]*position:\s*absolute/);
  });

  it('does not reserve space for an empty settings host', () => {
    // #settings-host is flex:1. When it has no children that is an invisible
    // spacer which splits the sidebar in half and squeezes the chat into the
    // bottom half, which is what made the panel look misaligned.
    const html = chatHtml(state(), preview);
    expect(html).toContain('<div id="settings-host"></div>');
    expect(html).toMatch(/#settings-host:empty\s*\{[^}]*display:\s*none/);
  });

  it('shows current task token usage in the Moderado header', () => {
    const usage = {
      usage: { promptTokens: 1234, completionTokens: 2345, totalTokens: 3579 },
      outputTokensPerSecond: 111.6,
      estimated: false,
    };
    const html = chatHtml(state({ tokenUsage: usage }), preview);
    expect(html).toContain('MODERADO');
    expect(html).toContain('In: 1234 | Out: 2345 | Total: 3579 | Rate: 112 tok/s');
    expect(viewSnapshot(state({ tokenUsage: usage }), preview).tokenUsage)
      .toBe('In: 1234 | Out: 2345 | Total: 3579 | Rate: 112 tok/s');
  });

  it('gives the settings pane the whole sidebar while it is open', () => {
    // Settings is its own full-height screen. Leaving the transcript, composer,
    // and auto-approve bar mounted underneath it stacks the chat into a strip.
    const html = chatHtml(state(), preview);
    expect(html).toMatch(/body\.settings-open #scroll[^{]*\{[^}]*display:\s*none/);
    expect(html).toMatch(/body\.settings-open #composer[^{]*\{[^}]*display:\s*none/);
    expect(html).toMatch(/body\.settings-open #auto-approve-host[^{]*\{[^}]*display:\s*none/);
    expect(html).toMatch(/body\.settings-open #panel-foot[^{]*\{[^}]*display:\s*none/);
    // The class has to actually be toggled, or the rules never take effect.
    expect(html).toContain("classList.toggle('settings-open'");
    // It is also rendered server-side, so an open pane does not flash the chat
    // surface for one frame before the script runs.
    expect(html).toContain('<body>');
    const open = chatHtml(
      state({ settings: { ...emptySettings(), open: true } }),
      preview,
    );
    expect(open).toContain('<body class="settings-open">');
  });

  it('wires the settings gear exactly once', () => {
    // The listener was registered twice, so a single click sent two
    // openSettings messages. The host answers that by re-reading the profile and
    // awaiting provider model discovery, so the gear fired two network requests
    // that raced on the same state.
    const html = chatHtml(state(), preview);
    const registrations =
      html.split("getElementById('open-settings').addEventListener").length - 1;
    expect(registrations).toBe(1);
  });

  it('does not stack two borders where the toolbar meets the pane', () => {
    // #panel-bar already carries a border-bottom. The pane adding its own
    // border-top put two 1px lines side by side, reading as a 2px seam.
    const html = chatHtml(state(), preview);
    expect(html).toMatch(/body\.settings-open #settings-host\s*\{[^}]*border-top:\s*none/);
  });

  it('has no auto-approve expand control, because the toggles are in the row', () => {
    // The row used to be a button that expanded a separate checkbox grid.
    // The checkboxes moved into the row, so the chevron is gone with it.
    const html = chatHtml(state(), preview);
    expect(html).not.toContain('&#9656;');
    expect(html).not.toContain('&#9662;');
    expect(html).not.toContain('aa-chevron');
    expect(html).toContain('data-key="readFiles"');
  });

  it('does not drag the transcript back down when the reader scrolled up', () => {
    // scrollTop was assigned on every update, so a reader who scrolled up to
    // re-read earlier output was yanked to the bottom by the next streamed token.
    // The tail may only be followed when it was already pinned there.
    const html = chatHtml(state(), preview);
    expect(html).toMatch(/const pinned =/);
    expect(html).toMatch(/if \(pinned\) scroll\.scrollTop = scroll\.scrollHeight/);
  });

  it('renders a composer input so there is somewhere to type', () => {
    const html = chatHtml(state(), preview);
    expect(html).toContain('id="prompt"');
    expect(html).toContain('id="composer"');
    expect(html).toContain('id="send"');
  });

  it('keeps the input out of the document only once', () => {
    // The regression: the panel used to be re-rendered per streamed token by
    // reassigning webview.html, which rebuilt the document, discarded the
    // composer's contents, and stole focus. Updates must be a separate message.
    const html = chatHtml(state(), preview);
    const occurrences = html.split('id="prompt"').length - 1;
    expect(occurrences).toBe(1);
  });

  it('applies later state as an in-place update, not a new document', () => {
    const html = chatHtml(state(), preview);
    // The update path must mutate the existing DOM nodes only.
    expect(html).toContain("update.type !== 'update'");
    expect(html).toContain('transcript.innerHTML = update.rows');
    expect(html).toContain('input.disabled = update.running');
  });

  it('applies a streamed entry as a single-row delta', () => {
    const html = chatHtml(state(), preview);
    expect(html).toContain("update.type === 'delta'");
    expect(html).toContain('transcript.children[index]');
    expect(html).toContain('outerHTML = update.html');
    // The welcome state must not survive the first streamed entry.
    expect(html).toContain("querySelector('.empty-state')");
  });

  it('renders one escaped transcript row for delta updates', () => {
    const entry = { kind: 'assistant' as const, label: '<b>Moderado</b>', text: '<img src=x onerror=bad>' };
    const row = transcriptEntryHtml(entry);
    expect(row).toContain('&lt;b&gt;Moderado&lt;/b&gt;');
    expect(row).toContain('&lt;img src=x onerror=bad&gt;');
    expect(row).not.toContain('<img src=x');
    expect(viewSnapshot(state({ transcript: [entry] }), preview).rows).toBe(row);
  });

  it('drops the welcome state when a full update has rows', () => {
    const html = chatHtml(state(), preview);
    expect(html).toContain('update.empty === false');
  });

  it('authorises scripts with a per-render nonce', () => {
    const html = chatHtml(state(), preview);
    const csp = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(html);
    expect(csp).not.toBeNull();
    expect(csp?.[1]?.length).toBeGreaterThanOrEqual(16);
    // The script tag must carry the same nonce the policy advertises.
    expect(html).toContain(`<script nonce="${csp?.[1]}">`);
    // 'unsafe-inline' would let any injected inline script run.
    expect(html).not.toContain("script-src 'unsafe-inline'");
  });

  it('escapes untrusted transcript text', () => {
    const html = chatHtml(
      state({ transcript: [{ kind: 'assistant', label: 'x', text: '<img src=x onerror=alert(1)>' }] }),
      preview,
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('produces a snapshot whose approval block is empty when nothing is pending', () => {
    const snap = viewSnapshot(state(), preview);
    expect(snap.approval).toBe('');
    expect(snap.pendingId).toBeNull();
    expect(snap.running).toBe(false);
  });

  it('carries the pending request id so only that request can be answered', () => {
    const pending = { requestId: 'req-1', actionSummary: 'write a file' } as unknown as ApprovalRequest;
    const snap = viewSnapshot(state({ pendingApproval: pending }), preview);
    expect(snap.pendingId).toBe('req-1');
    expect(snap.approval).toContain('Allow');
    expect(snap.approval).toContain('Deny');
    // The sidebar is too narrow for a full diff, so it must offer to open one.
    expect(snap.approval).toContain('id="full-diff"');
  });

  it('offers the full-change action only for a pending approval', () => {
    const html = chatHtml(state(), preview);
    expect(html).not.toContain('id="full-diff"');
    expect(html).toContain('id="prompt"');
  });

  it('keeps the composer pinned below a scrollable transcript', () => {
    const html = chatHtml(state(), preview);
    expect(html).toContain('id="scroll"');
    expect(html.indexOf('id="scroll"')).toBeLessThan(html.indexOf('id="composer"'));
  });

  it('escapes approval previews, which contain file paths and diffs', () => {
    const pending = { requestId: 'r', actionSummary: '<b>x</b>' } as unknown as ApprovalRequest;
    const snap = viewSnapshot(state({ pendingApproval: pending }), () => '<script>bad</script>');
    expect(snap.approval).not.toContain('<script>');
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
  });

  it('shows the active provider and model in the composer footer', () => {
    const html = chatHtml(state({ activeProviderName: 'Moderado', activeModelId: 'auto' }), preview);
    const footer = html.slice(html.indexOf('id="panel-foot"'));
    expect(footer).toContain('Moderado');
    expect(footer).toContain('auto');
  });

  it('escapes the active provider and model before they reach the footer', () => {
    const html = chatHtml(state({ activeProviderName: '<script>bad</script>', activeModelId: 'a"b' }), preview);
    expect(html).not.toContain('<script>bad</script>');
    const snap = viewSnapshot(state({ activeProviderName: '<b>p</b>', activeModelId: 'a"b' }), preview);
    // The snapshot feeds live updates, so it must be escaped too.
    expect(snap.activeContext).toBe('&lt;b&gt;p&lt;/b&gt; · a&quot;b');
  });

  it('preserves an exact pinned route id in the footer context', () => {
    const snap = viewSnapshot(state({ activeProviderName: 'Moderado', activeModelId: 'moonshotai/kimi-k3' }), preview);
    expect(snap.activeContext).toBe('Moderado · moonshotai/kimi-k3');
    expect(viewSnapshot(state(), preview).activeContext).toBe('');
  });
});

describe('moderado settings pane', () => {
  function settings(over: Partial<SettingsState> = {}): SettingsState {
    return { ...emptySettings(), ...over };
  }

  it('offers a gear control that opens the pane', () => {
    // The entry point is the gear in the chat header; without it the pane is
    // unreachable from the panel.
    const html = chatHtml(state(), preview);
    expect(html).toContain('id="open-settings"');
    expect(html).toContain("postMessage({ type: 'openSettings' })");
  });

  it('puts the gear in a right-aligned bar at the top', () => {
    // The bug: the gear used float:right, which a flex container ignores, so it
    // rendered at the top-LEFT. It must live in a bar that justifies to the end,
    // above the transcript.
    const html = chatHtml(state(), preview);
    expect(html).toMatch(/#panel-bar\s*\{[^}]*justify-content:\s*flex-end/);
    expect(html.indexOf('id="panel-bar"')).toBeLessThan(html.indexOf('id="scroll"'));
    expect(html).not.toMatch(/#open-settings\s*\{[^}]*float:/);
    expect(html.indexOf('id="open-settings"')).toBeLessThan(html.indexOf('id="scroll"'));
  });

  it('keeps the token usage on the left, next to the Moderado title', () => {
    // The title used margin-right:auto, which pushed the usage to the far
    // right. The usage belongs beside the title; the buttons stay right-aligned.
    const html = chatHtml(state(), preview);
    expect(html.indexOf('class="brand-title"')).toBeLessThan(html.indexOf('id="token-usage"'));
    expect(html).not.toMatch(/\.brand-title\s*\{[^}]*margin-right:\s*auto/);
    expect(html).toMatch(/#panel-bar button:first-of-type\s*\{[^}]*margin-left:\s*auto/);
    // The usage reads from the left and is larger than before.
    expect(html).toMatch(/\.token-usage\s*\{[^}]*text-align:\s*left/);
    expect(html).toMatch(/\.token-usage\s*\{[^}]*font-size:\s*0\.72rem/);
  });

  it('places the single sessions icon immediately before Settings in the top bar', () => {
    const html = chatHtml(state(), preview);
    expect(html).toMatch(/id="toggle-history"[^>]*>[^<]*<\/button>\s*<button id="open-settings"/);
    expect(html).not.toContain('id="foot-history"');
  });

  it('opens API Config from the current provider and model control', () => {
    const html = chatHtml(state({ activeProviderName: 'OpenRouter', activeModelId: 'route/free' }), preview);
    expect(html).toContain('<button type="button" id="active-ctx"');
    expect(html).toContain("getElementById('active-ctx').addEventListener('click', () => vscode.postMessage({ type: 'openApiConfig' }))");
  });

  it('keeps the attachment hint in the Cancel and Send row', () => {
    const html = chatHtml(state(), preview);
    expect(html).toMatch(/<div class="composer-foot">\s*<p class="composer-hint"[^>]*>[^<]*<\/p>\s*<button type="button" id="cancel"/);
  });

  it('shows the brand welcome state only while the transcript is empty', () => {
    const fresh = chatHtml(state(), preview);
    expect(fresh).toContain('class="empty-state"');
    expect(fresh).toContain('What can I do for you?');
    const started = chatHtml(
      state({ transcript: [{ kind: 'user', label: 'You', text: 'hi' }] }),
      preview,
    );
    expect(started).not.toContain('class="empty-state"');
  });

  it('renders a RECENT list with cost badges when sessions exist', () => {
    const html = chatHtml(state({
      historyOpen: true,
      recents: [
        { id: 's1', title: 'Fix the login bug', updatedAt: 'Sep 25', costLabel: '$0.00' },
        { id: 's2', title: 'Second task', updatedAt: 'Sep 20', costLabel: null },
      ],
    }), preview);
    expect(html).toContain('RECENT');
    expect(html).toContain('View All');
    expect(html).toContain('Fix the login bug');
    expect(html).toContain('aria-label="Rename chat: Fix the login bug"');
    expect(html).toContain("type: 'renameSession'");
    expect(html).toContain('class="recent-cost">$0.00</span>');
    // No cost badge when the engine reported none: two sessions, one badge.
    expect(html.split('class="recent-cost"').length - 1).toBe(1);
  });

  it('escapes untrusted recent-session titles', () => {
    const html = chatHtml(state({
      historyOpen: true,
      recents: [{ id: 's1', title: '<img src=x onerror=alert(1)>', updatedAt: 'Sep 25', costLabel: null }],
    }), preview);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('exposes a rename action for each chat in Chat History', () => {
    const html = chatHtml(state({
      historyOpen: true,
      recents: [{ id: 's1', title: 'A chat', updatedAt: 'Sep 25', costLabel: null }],
    }), preview);
    expect(html).toContain('class="rename-session"');
    expect(html).toContain('data-rename-session="s1"');
    expect(html).toContain('title="Rename chat"');
  });

  it('pre-enables the requested auto-approve categories but not commands', () => {
    const html = chatHtml(state({
      autoApprove: { ...emptyAutoApprove() },
    }), preview);
    expect(html).toContain('Auto-approve:');
    expect(html).toContain('data-key="readFiles" checked');
    expect(html).toContain('data-key="editFiles" checked');
    expect(html).toContain('data-key="fetchWeb" checked');
    expect(html).toContain('data-key="useMcp" checked');
    expect(html).toMatch(/data-key="executeCommands"(?! checked)/);
  });

  it('puts each auto-approve checkbox in the row, in front of its item', () => {
    // The privilege toggles sit in the row itself, so the user reaches them
    // directly instead of opening a panel first.
    const html = chatHtml(state({
      autoApprove: { ...emptyAutoApprove(), readFiles: true, editFiles: false },
    }), preview);
    const item = (key: string) => {
      const at = html.indexOf(`data-key="${key}"`);
      expect(at).toBeGreaterThan(-1);
      return html.slice(at, html.indexOf('</label>', at));
    };
    for (const [key, label] of [['readFiles', 'Read files'], ['editFiles', 'Edit files'],
      ['executeCommands', 'Execute commands'], ['fetchWeb', 'Fetch web content'], ['useMcp', 'Use MCP servers']] as const) {
      const markup = item(key);
      expect(markup).toContain(label);
      // The checkbox comes before the label text it belongs to.
      expect(markup.indexOf('type="checkbox"')).toBeLessThan(markup.indexOf(label));
    }
    // The row is no longer a click-to-expand control.
    expect(html).not.toContain('id="aa-toggle"');
    expect(html).not.toContain('aa-grid');
    expect(html).toContain('id="auto-approve"');
  });

  it('shows the auto-approve warning as a popup on an exclamation mark', () => {
    // The warning must not occupy the row: it is a popup on the mark.
    const html = chatHtml(state(), preview);
    expect(html).not.toContain('aa-note');
    expect(html).toContain('&#9888;');
    // A webview draws no native title tooltip, so the mark carries the text
    // and the stylesheet turns it into a popup on hover and on focus.
    expect(html).not.toMatch(/class="aa-warn"[^>]*\stitle=/);
    expect(html).toMatch(/class="aa-warn"[^>]*data-warning="[^"]*Turn a category off to require approval\./);
    expect(html).toMatch(/\.aa-warn::after\s*\{[^}]*content:\s*attr\(data-warning\)/);
    expect(html).toMatch(/\.aa-warn:hover::after[^{]*\{[^}]*opacity:\s*1/);
    // The mark sits with the label, ahead of the categories.
    const row = html.slice(html.indexOf('<div class="aa" id="auto-approve">'));
    expect(row.indexOf('aa-warn')).toBeLessThan(row.indexOf('aa-title'));
    expect(row.indexOf('aa-title')).toBeLessThan(row.indexOf('aa-items'));
  });

  it('reports an auto-approve change to the host rather than deciding locally', () => {
    // The renderer must never conclude on its own that an action is approved.
    const html = chatHtml(state(), preview);
    expect(html).toContain("postMessage({ type: 'setAutoApprove'");
  });

  it('offers a Plan/Act toggle in the footer', () => {
    const html = chatHtml(state(), preview);
    expect(html).toContain('id="mode-plan"');
    expect(html).toContain('id="mode-act"');
    expect(html).toContain("postMessage({ type: 'setMode'");
  });

  it('uses a multi-line composer that sends on Enter', () => {
    const html = chatHtml(state(), preview);
    expect(html).toContain('<textarea id="prompt"');
    expect(html).toContain('Type your task here...');
    expect(html).toContain("event.key === 'Enter' && !event.shiftKey");
  });

  it('browses submitted prompt history with boundary arrow keys and preserves the draft', () => {
    const html = chatHtml(state(), preview);
    expect(html).toContain('const promptHistory = Array.isArray(savedState?.promptHistory)');
    expect(html).toContain('promptHistory.length > 100');
    expect(html).toContain("event.key === 'ArrowUp'");
    expect(html).toContain("event.key === 'ArrowDown'");
    expect(html).toContain('historyDraft = input.value');
    expect(html).toContain('vscode.setState');
  });

  it('keeps the pane out of the document until it is opened', () => {
    const html = chatHtml(state(), preview);
    expect(html).not.toContain('id="settings-pane"');
  });

  it('shows the active connection compactly, without the bulky path block', () => {
    // The previous layout rendered every connection as a card under a full
    // profile-path heading, which dominated the pane.
    const pane = settingsPaneHtml(settings({
      profilePath: 'C:\\Users\\marcu\\.moderado\\config.json',
      activeConnectionId: 'example-provider',
      savedConnections: [
        { id: 'example-provider', displayName: 'Example AI', kind: 'openai-compatible', baseUrl: 'https://a/v1', hasCredential: true },
      ],
    }));
    // One short line, and the path only as a tooltip.
    expect(pane).toContain('class="active-line"');
    expect(pane).toContain('Using <strong>Example AI</strong>');
    expect(pane).not.toContain('<h3>From');
    expect(pane).not.toContain('class="saved-list"');
    // The path is still discoverable without occupying layout space.
    expect(pane).toContain('title="Shared profile: C:\\Users\\marcu\\.moderado\\config.json"');
  });

  it('reflects the selected provider key state, not the previous one', () => {
    // Picking a provider must show whether *that* provider already has a key.
    const pane = settingsPaneHtml(settings({
      preset: 'openrouter',
      providers: [
        { value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true, hasCredential: true },
        { value: 'openrouter', label: 'OpenRouter', description: 'd', requiresApiKey: true, hasCredential: false },
      ],
    }));
    expect(pane).not.toContain('A key is stored for this provider');
    expect(pane).toContain('Paste a key and save.');
  });

  it('marks the key as stored for the provider that has one', () => {
    const pane = settingsPaneHtml(settings({
      preset: 'nvidia-nim',
      providers: [
        { value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true, hasCredential: true },
        { value: 'openrouter', label: 'OpenRouter', description: 'd', requiresApiKey: true, hasCredential: false },
      ],
    }));
    expect(pane).toContain('A key is stored for this provider');
    expect(pane).toContain('Paste a new key to replace it.');
    // The key is collected in an editable masked field.
    expect(pane).toContain('id="settings-api-key"');
    expect(pane).toContain('type="password"');
  });

  it('explains that provider and model changes need Save settings', () => {
    const pane = settingsPaneHtml(settings());
    expect(pane).toContain('Save settings to keep the provider and model after restart.');
  });

  it('lists free models in a compact dropdown and summarises the counts', () => {
    const pane = settingsPaneHtml(settings({
      preset: 'nvidia-nim',
      providers: [{ value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true }],
      models: [
        { id: 'free-a', accessTier: 'free_trial', isFree: true },
        { id: 'paid-b', accessTier: 'paid', isFree: false },
      ],
      defaultModel: 'free-a', allowPaid: true,
    }));
    // Keep the chosen model in the dropdown without expanding the catalog into cards.
    expect(pane).toContain('<option value="free-a" selected>');
    expect(pane).not.toContain('class="model-card');
    expect(pane).not.toContain('settings-model-search');
    expect(pane).toContain('★ free-a</option>');
    expect(pane).not.toContain('free_trial');
    expect(pane).toContain('1 free');
    expect(pane).toContain('2 listed');
  });

  it('shows only free models on the Free tab and paid on the Paid tab', () => {
    const free = settingsPaneHtml(settings({
      preset: 'nvidia-nim', modelTab: 'free',
      providers: [{ value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true }],
      models: [
        { id: 'free-a', accessTier: 'free_trial', isFree: true },
        { id: 'paid-b', accessTier: 'paid', isFree: false },
      ],
      allowPaid: true,
    }));
    expect(free).toContain('<option value="free-a"');
    expect(free).not.toContain('<option value="paid-b"');
    const paid = settingsPaneHtml(settings({
      preset: 'nvidia-nim', modelTab: 'paid',
      providers: [{ value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true }],
      models: [
        { id: 'free-a', accessTier: 'free_trial', isFree: true },
        { id: 'paid-b', accessTier: 'paid', isFree: false },
      ],
      allowPaid: true,
    }));
    expect(paid).toContain('<option value="paid-b"');
    expect(paid).not.toContain('<option value="free-a"');
  });

  it('offers the Free and Paid tabs with Free as the default', () => {
    const pane = settingsPaneHtml(settings({}));
    expect(pane).toContain('data-tab="paid"');
    expect(pane).toContain('data-tab="free"');
    expect(pane).toContain('>Free</button>');
    expect(pane).toContain('>Paid</button>');
    expect(pane).not.toContain('>Recommended</button>');
    // Free is on when no tab was ever chosen.
    expect(pane).toMatch(/data-tab="free" class="on"/);
  });

  it('explains an empty model list', () => {
    const pane = settingsPaneHtml(settings({
      preset: 'nvidia-nim',
      providers: [{ value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true }],
    }));
    expect(pane).toContain('No models loaded yet.');
  });

  it('has a left settings nav with the reference sections', () => {
    const pane = settingsPaneHtml(settings({ page: 'api' }));
    for (const label of ['API Config', 'Features', 'About']) {
      expect(pane).toContain(label);
    }
    expect(pane).not.toContain('data-page="general"');
    expect(pane).toContain('class="set-nav"');
    expect(pane).toContain('data-page="api"');
    expect(pane).toContain('>Done</button>');
  });

  it('renders provider, key, and model controls when opened', () => {
    const pane = settingsPaneHtml(settings({ preset: 'nvidia-nim', providers: [
      { value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'Free-first routing.', requiresApiKey: true },
    ] }));
    expect(pane).toContain('id="settings-provider"');
    expect(pane).toContain('id="settings-api-key"');
    expect(pane).toContain('id="settings-model"');
  });

  it('shows an editable base URL for a known provider', () => {
    // The preset already knows its endpoint. Asking for it would invite a user
    // to break a working provider by editing a value that is not theirs.
    const pane = settingsPaneHtml(settings({ preset: 'openrouter', providers: [
      { value: 'openrouter', label: 'OpenRouter', description: 'Free tier.', requiresApiKey: true },
    ] }));
    expect(pane).toContain('id="settings-base-url"');
    expect(pane).not.toContain('id="settings-display-name"');
  });

  it('shows the base URL and name fields for a custom endpoint', () => {
    const pane = settingsPaneHtml(settings({ preset: 'openai-compatible', providers: [
      { value: 'openai-compatible', label: 'Other', description: 'Any endpoint.', requiresApiKey: true, custom: true },
    ] }));
    expect(pane).toContain('id="settings-base-url"');
    expect(pane).toContain('id="settings-display-name"');
  });

  it('offers an optional key field for a local runtime', () => {
    // Ollama and LM Studio authenticate with no key; asking for one implies a
    // requirement that does not exist.
    const pane = settingsPaneHtml(settings({ preset: 'ollama', providers: [
      { value: 'ollama', label: 'Ollama', description: 'Local.', requiresApiKey: false },
    ] }));
    expect(pane).toContain('id="settings-api-key"');
    expect(pane).toContain('needs no API key');
  });
  it('shows provider names without a free-model suffix and retains local tags', () => {
    const pane = settingsPaneHtml(settings({ preset: 'ollama', providers: [
      { value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true },
      { value: 'ollama', label: 'Ollama', description: 'd', requiresApiKey: false, tag: 'Local' },
    ] }));
    expect(pane).toContain('>NVIDIA NIM</option>');
    expect(pane).not.toContain('Free Models');
    expect(pane).toContain('Ollama - Local');
  });

  it('labels the local runtimes Ollama - Local and LM Studio - Local', () => {
    const pane = settingsPaneHtml(settings({ preset: 'ollama', providers: buildProviderChoices() }));
    expect(pane).toContain('>Ollama - Local</option>');
    expect(pane).toContain('>LM Studio - Local</option>');
  });

  it('offers a masked write-only key input', () => {
    // A visible key field would put a provider secret on screen and in shoulder
    // surfing. The value is write-only: it is sent out and never sent back.
    const pane = settingsPaneHtml(settings({ preset: 'nvidia-nim', providers: [
      { value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true },
    ] }));
    expect(pane).toContain('type="password"');
    expect(pane).toContain('id="settings-api-key"');
  });

  it('never echoes a stored API key back into the pane', () => {
    // The credential state is a hint, never the value: the secret stays in
    // Credential Manager and is resolved host-side.
    const pane = settingsPaneHtml(settings({
      preset: 'nvidia-nim',
      providers: [{ value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true, hasCredential: true }],
    }));
    expect(pane).not.toContain('sk-live-secret');
    expect(pane).toContain('A key is stored for this provider');
    expect(pane).toContain('type="password"');
    expect(pane).toContain('id="settings-api-key"');
  });

  it('marks the selected provider and model', () => {
    const pane = settingsPaneHtml(
      settings({
        preset: 'ollama',
        providers: [
          { value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true },
          { value: 'ollama', label: 'Ollama', description: 'd', requiresApiKey: false },
        ],
        models: [
          { id: 'model-a', accessTier: 'free_trial', isFree: true },
          { id: 'model-b', accessTier: 'paid', isFree: false },
        ],
        modelTab: 'paid',
        defaultModel: 'model-b', allowPaid: true,
      }),
    );
    expect(pane).toContain('<option value="ollama" selected');
    expect(pane).toContain('<option value="model-b" selected');
  });

  it('keeps access tier labels out of model names while preserving tab eligibility', () => {
    // Free renders on the default tab; paid/unknown render on the Paid tab.
    const free = settingsPaneHtml(
      settings({
        preset: 'nvidia-nim', allowPaid: true, allowUnknown: true,
        models: [
          { id: 'model-a', accessTier: 'free_trial', isFree: true },
          { id: 'model-b', accessTier: 'paid', isFree: false },
          { id: 'model-c', accessTier: 'unknown', isFree: false },
        ],
      }),
    );
    expect(free).toContain('★ model-a</option>');
    expect(free).not.toContain('free_trial');
    expect(free).not.toContain('model-b');
    const paid = settingsPaneHtml(
      settings({
        preset: 'nvidia-nim', modelTab: 'paid', allowPaid: true, allowUnknown: true,
        models: [
          { id: 'model-a', accessTier: 'free_trial', isFree: true },
          { id: 'model-b', accessTier: 'paid', isFree: false },
          { id: 'model-c', accessTier: 'unknown', isFree: false },
        ],
      }),
    );
    expect(paid).toContain('<option value="model-b">model-b</option>');
    expect(paid).toContain('<option value="model-c">model-c</option>');
    expect(paid).not.toContain('— paid');
    expect(paid).not.toContain('— unknown');
  });

  it('escapes untrusted provider names, base URLs, and model ids', () => {
    const pane = settingsPaneHtml(
      settings({
        preset: 'openai-compatible',
        providers: [{ value: 'custom:x', label: '<img src=x onerror=alert(1)>', description: 'd', requiresApiKey: true, custom: true }],
        baseUrl: '"><script>bad</script>',
        models: [{ id: '<script>bad</script>', accessTier: 'free_trial', isFree: true }],
      }),
    );
    expect(pane).not.toContain('<img src=x');
    expect(pane).not.toContain('<script>bad</script>');
    expect(pane).toContain('&lt;script&gt;');
  });

  it('reports a corrupt profile instead of showing empty defaults', () => {
    // Silently rendering an empty form would invite overwriting a corrupt
    // config.json with fresh defaults.
    const pane = settingsPaneHtml(settings({ profileError: 'config.json is not valid JSON' }));
    expect(pane).toContain('config.json is not valid JSON');
    expect(pane).toContain('disabled');
  });

  it('parses a submitted form into validated values', () => {
    const parsed = parseSettingsForm({
      preset: 'nvidia-nim',
      modelId: 'model-a',
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.value?.preset).toBe('nvidia-nim');
    expect(parsed.value?.modelId).toBe('model-a');
  });

  it('rejects a missing or malformed provider value', () => {
    expect(parseSettingsForm({ apiKey: 'k' }).ok).toBe(false);
    expect(parseSettingsForm({ preset: 'x y z' }).ok).toBe(false);
  });

  it('rejects a provider name that cannot become a credential target', () => {
    // The name is slugified into the connection id, which becomes the
    // Credential Manager target name.
    expect(parseSettingsForm({ preset: 'openai-compatible', displayName: '///' }).ok).toBe(false);
  });

  it('rejects even an empty API key sent by a webview', () => {
    // The pane never receives the existing key, so an empty field must not be
    // read as a request to erase it.
    const parsed = parseSettingsForm({ preset: 'openrouter', apiKey: '   ' });
    expect(parsed.ok).toBe(false);
  });

  it('rejects a malformed message instead of guessing', () => {
    expect(parseSettingsForm(undefined).ok).toBe(false);
    expect(parseSettingsForm({ preset: 42 }).ok).toBe(false);
  });

  it('carries a snapshot that updates the open pane in place', () => {
    const snap = settingsSnapshot(settings({ open: true, preset: 'nvidia-nim', providers: [
      { value: 'nvidia-nim', label: 'NVIDIA NIM', description: 'd', requiresApiKey: true },
    ] }));
    expect(snap.settingsOpen).toBe(true);
    expect(snap.settings).toContain('id="settings-provider"');
    expect(settingsSnapshot(emptySettings()).settings).toBe('');
  });
});

describe('provider settings submissions', () => {
  it('accepts a bounded user-pasted key only in an explicit submission', () => {
    const result = parseSettingsSubmission({ preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: ' pasted-key ' });
    expect(result).toMatchObject({ ok: true, value: { apiKey: 'pasted-key' } });
    expect(parseSettingsForm({ preset: 'openrouter', apiKey: 'pasted-key' }).ok).toBe(false);
  });
  it.each([42, 'x'.repeat(8193), 'key\nheader'])('rejects malformed or oversized key drafts', apiKey => {
    expect(parseSettingsSubmission({ preset: 'openrouter', apiKey }).ok).toBe(false);
  });
  it('does not accept injected stored credential references', () => {
    expect(parseSettingsSubmission({ preset: 'openrouter', apiKey: 'key', credentialReference: 'other' }).ok).toBe(false);
  });
});

import type { AttachmentDescriptor } from './attachments.js';
import { DEFAULT_AUTO_APPROVE } from './auto-approve.js';
import type { ApprovalRequest } from '@moderado/contracts';
import { escapeHtml } from './html.js';
import { settingsPaneHtml, SettingsState, emptySettings } from './settings-view.js';

export { escapeHtml } from './html.js';

/**
 * The chat webview, as pure string building.
 *
 * Deliberately separate from extension.ts so it carries no `vscode` import and
 * can be tested directly.
 *
 * The document is written once. Later state changes are pushed to the webview as
 * `update` messages and applied to the live DOM. Reassigning `webview.html` on
 * every event rebuilds the document, which discards whatever the user is typing
 * and steals keyboard focus, which made the composer unusable during streaming.
 */

export interface TranscriptEntry {
  kind: 'user' | 'assistant' | 'tool' | 'error';
  label: string;
  text: string;
}

export interface RecentSession {
  id: string;
  title: string;
  updatedAt: string;
  costLabel: string | null;
}

/** Auto-approve categories, mirroring the approval boundary in AGENTS.md. */
export interface AutoApproveState {
  expanded: boolean;
  readFiles: boolean;
  editFiles: boolean;
  executeCommands: boolean;
  fetchWeb: boolean;
  useMcp: boolean;
}

export function emptyAutoApprove(): AutoApproveState {
  return { expanded: false, ...DEFAULT_AUTO_APPROVE };
}

export interface ChatViewState {
  attachments?: AttachmentDescriptor[];
  transcript: TranscriptEntry[];
  running: boolean;
  pendingApproval: ApprovalRequest | null;
  /** The in-panel settings pane; see settings-view.ts. */
  settings?: SettingsState;
  recents?: RecentSession[];
  /** True when the Chat History panel is expanded via the top-bar icon. */
  historyOpen?: boolean;
  autoApprove?: AutoApproveState;
  /** Workspace folder name shown in the footer. */
  workspaceLabel?: string;
  /** Display-safe active connection name for the composer footer. */
  activeProviderName?: string;
  /** Display-safe active model id (`auto` or an exact route) for the footer. */
  activeModelId?: string;
}

/** The parts of the view the webview updates in place. */
export interface ViewSnapshot {
  attachments: string;
  rows: string;
  approval: string;
  running: boolean;
  pendingId: string | null;
  settingsOpen: boolean;
  settings: string;
  settingsStatus: string;
  recents: string;
  historyOpen: boolean;
  autoApprove: string;
  autoApproveExpanded: boolean;
  planMode: boolean;
  empty: boolean;
  /** Escaped `provider · model` footer context, refreshed with the connection. */
  activeContext: string;
}

/** A fresh per-render nonce, which is what a VS Code webview CSP expects. */
export function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return text;
}

/** Top toolbar: New Session + Chat History before the gear, right aligned. */
function toolbarHtml(historyOpen: boolean): string {
  return `<div id="panel-bar">
    <button id="new-session" type="button" title="New session" aria-label="New session">&#65291;</button>
    <button id="toggle-history" type="button" title="Chat history" aria-label="Chat history" aria-pressed="${historyOpen ? 'true' : 'false'}">&#9783;</button>
    <button id="open-settings" type="button" title="Moderado settings" aria-label="Moderado settings">&#9881;</button>
  </div>`;
}

/**
 * The centred welcome state.
 *
 * Shown only while the transcript is empty, so the panel opens on the brand mark
 * and a prompt rather than a blank list.
 */
function emptyStateHtml(): string {
  return `<div class="empty-state">
    <svg class="brand-mark" viewBox="0 0 100 100" width="72" height="72" role="img" aria-label="Moderado">
      <ellipse cx="50" cy="50" rx="47" ry="47" fill="#14233a" stroke="#5b7ba6" stroke-width="2"/>
      <path d="M28,74 L28,38 L50,56 L72,38 L72,74" fill="none" stroke="#ffffff" stroke-width="8"
            stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="70.5" cy="29.5" r="6.5" fill="#ff8b5c"/>
    </svg>
    <h1 class="empty-title">What can I do for you?</h1>
  </div>`;
}

/** The RECENT list: newest sessions with their date and cost badge.
 * Shown only when the Chat History top-bar icon expands it. */
function recentsHtml(state: ChatViewState): string {
  if (!state.historyOpen) return '';
  const recents = state.recents ?? [];
  if (!recents.length) return '';
  const rows = recents
    .map(
      (session) => `<div class="recent-item"><button class="recent-row" type="button" data-session="${escapeHtml(session.id)}">
        <span class="recent-title">${escapeHtml(session.title)}</span>
        <span class="recent-meta">
          ${session.costLabel ? `<span class="recent-cost">${escapeHtml(session.costLabel)}</span>` : ''}
          <span class="recent-date">${escapeHtml(session.updatedAt)}</span>
        </span>
      </button><button type="button" class="delete-session" data-delete-session="${escapeHtml(session.id)}" aria-label="Delete chat: ${escapeHtml(session.title)}" title="Delete chat">Delete</button></div>`,
    )
    .join('');
  return `<section class="recents">
    <header class="section-head"><span>RECENT</span><button id="view-all-sessions" type="button">View All &rsaquo;</button></header>
    ${rows}
  </section>`;
}

/** The categories the auto-approve panel toggles, in the reference order. */
const AUTO_APPROVE_CATEGORIES = [
  { key: 'readFiles', label: 'Read files', icon: '&#128269;' },
  { key: 'editFiles', label: 'Edit files', icon: '&#9998;' },
  { key: 'executeCommands', label: 'Execute commands', icon: '&#9001;' },
  { key: 'fetchWeb', label: 'Fetch web content', icon: '&#127760;' },
  { key: 'useMcp', label: 'Use MCP servers', icon: '&#128196;' },
] as const;

/** A short summary of what is currently auto-approved, for the collapsed bar. */
export function autoApproveSummary(auto: AutoApproveState): string {
  const on = AUTO_APPROVE_CATEGORIES.filter((c) => auto[c.key]).map((c) => c.label);
  return on.length ? on.join(', ') : 'nothing';
}

/**
 * The collapsible auto-approve bar and its expanded checkbox grid.
 *
 * The default categories are pre-approved; command execution remains opt-in.
 */
function autoApproveHtml(auto: AutoApproveState): string {
  const grid = AUTO_APPROVE_CATEGORIES.map(
    (category) => `<label class="aa-item">
      <input type="checkbox" class="aa-box" data-key="${category.key}"${auto[category.key] ? ' checked' : ''} />
      <span class="aa-icon">${category.icon}</span>
      <span class="aa-label">${escapeHtml(category.label)}</span>
    </label>`,
  ).join('');
  return `<div class="aa${auto.expanded ? ' open' : ''}" id="auto-approve">
    <button id="aa-toggle" class="aa-head" type="button" aria-expanded="${auto.expanded}">
      <span>Auto-approve: ${escapeHtml(autoApproveSummary(auto))}</span>
      <span class="aa-chevron">${auto.expanded ? '&#9662;' : '&#9656;'}</span>
    </button>
    ${auto.expanded ? `<div class="aa-body">
      <p class="aa-note">Let Moderado take these actions without asking for approval.
        <span class="aa-warn">Enabled actions run without asking. Turn a category off to require approval.</span>
      </p>
      <div class="aa-grid">${grid}</div>
    </div>` : ''}
  </div>`;
}

/** Builds the approval prompt. Empty when nothing is awaiting a decision. */
export function approvalHtml(
  pending: ApprovalRequest | null,
  preview: (r: ApprovalRequest) => string,
): string {
  if (!pending) return '';
  return `<section class="approval" role="alertdialog" aria-label="Approval required">
            <h2>Approval required</h2>
            <p>${escapeHtml(pending.actionSummary)}</p>
            <pre>${escapeHtml(preview(pending))}</pre>
            <button id="full-diff" type="button">Show full change</button>
            <button id="allow" type="button">Allow</button>
            <button id="deny" type="button">Deny</button>
          </section>`;
}

export function chatHtml(state: ChatViewState, preview: (r: ApprovalRequest) => string): string {
  const snapshot = viewSnapshot(state, preview);
  const nonce = createNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>Moderado</title>
<style>
body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); margin: 0; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; background: var(--vscode-sideBar-background, transparent); }
  button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
  /* Toolbar: icon-only actions, right aligned. */
  #panel-bar { display: flex; align-items: center; justify-content: flex-end; gap: 0.15rem; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--vscode-panel-border); flex: 0 0 auto; }
  #panel-bar button { padding: 0.2rem 0.4rem; line-height: 1; border-radius: 3px; font-size: 1rem; opacity: 0.85; }
  #panel-bar button:hover { background: var(--vscode-toolbar-hoverBackground); opacity: 1; }
  /* Scrollable middle: welcome state, recents, transcript. */
  #scroll { flex: 1; overflow-y: auto; min-height: 0; padding: 0.5rem 0.75rem; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2rem 0 1.5rem; }
  .brand-mark { opacity: 0.95; }
  .empty-title { font-size: 1.15rem; font-weight: 600; margin: 0.9rem 0 0; }
  /* Recents */
  .section-head { display: flex; align-items: center; justify-content: space-between; font-size: 0.72rem; letter-spacing: 0.06em; opacity: 0.7; margin: 0.6rem 0 0.3rem; }
  .section-head button { font-size: 0.72rem; opacity: 0.8; padding: 0.1rem 0.2rem; }
  .section-head button:hover { color: var(--vscode-textLink-foreground); }
  .recent-item { display: flex; align-items: center; gap: 0.4rem; }
  .recent-item .recent-row { flex: 1; min-width: 0; }
  .delete-session { flex: 0 0 auto; }
  .recent-row { display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; width: 100%; text-align: left; padding: 0.45rem 0.55rem; margin-bottom: 0.3rem; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: var(--vscode-editorWidget-background, transparent); }
  .recent-row:hover { background: var(--vscode-list-hoverBackground); }
  .recent-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .recent-meta { display: flex; align-items: center; gap: 0.5rem; font-size: 0.72rem; opacity: 0.75; }
  .recent-cost { background: var(--vscode-charts-blue, #2f7ae5); color: #fff; border-radius: 8px; padding: 0 0.4rem; font-size: 0.68rem; }
  /* Auto-approve */
  #auto-approve { flex: 0 0 auto; border-top: 1px solid var(--vscode-panel-border); }
  .aa-head { display: flex; align-items: center; justify-content: space-between; width: 100%; text-align: left; padding: 0.5rem 0.75rem; font-size: 0.8rem; }
  .aa-head:hover { background: var(--vscode-toolbar-hoverBackground); }
  .aa-chevron { opacity: 0.7; }
  .aa-body { padding: 0 0.75rem 0.6rem; }
  .aa-note { font-size: 0.75rem; margin: 0 0 0.5rem; opacity: 0.8; }
  .aa-warn { display: block; color: var(--vscode-editorWarning-foreground); opacity: 0.9; margin-top: 0.15rem; }
  .aa-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem 0.75rem; }
  .aa-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; cursor: pointer; }
  .aa-box { accent-color: var(--vscode-focusBorder); }
  /* Composer */
  #composer { flex: 0 0 auto; display: flex; flex-direction: column; border: 1px solid var(--vscode-input-border, var(--vscode-focusBorder)); border-radius: 5px; margin: 0.5rem 0.75rem; background: var(--vscode-input-background); }
  #prompt { resize: none; border: none; outline: none; background: transparent; color: inherit; font: inherit; padding: 0.55rem 0.6rem 0.2rem; min-height: 3.2rem; max-height: 12rem; }
  .composer-foot { display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem; padding: 0.25rem 0.4rem 0.4rem; }
  .composer-foot button { padding: 0.25rem 0.6rem; border-radius: 4px; border: 1px solid var(--vscode-panel-border); font-size: 0.78rem; }
  .composer-foot #send { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  .composer-hint { font-size: 0.68rem; opacity: 0.55; padding: 0 0.6rem 0.4rem; }
  /* Footer */
  #panel-foot { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; padding: 0.3rem 0.75rem; border-top: 1px solid var(--vscode-panel-border); font-size: 0.72rem; }
  .foot-left { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
  .foot-left button { padding: 0.1rem 0.3rem; opacity: 0.8; }
  .ws-label { opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ctx-label { opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 14rem; }
  .mode-toggle { display: flex; border: 1px solid var(--vscode-panel-border); border-radius: 4px; overflow: hidden; }
  .mode-toggle button { padding: 0.15rem 0.5rem; font-size: 0.72rem; opacity: 0.8; }
  .mode-toggle button.on { background: var(--vscode-button-background); color: var(--vscode-button-foreground); opacity: 1; }
  /* Transcript */
  ul { list-style: none; padding: 0; }
  li { border-left: 3px solid var(--vscode-panel-border); margin: 0.4rem 0; padding-left: 0.6rem; }
  li.error { border-color: var(--vscode-errorForeground); }
  li.tool { border-color: var(--vscode-charts-blue); }
  .who { font-size: 0.72rem; text-transform: uppercase; opacity: 0.7; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0.2rem 0 0; font-family: inherit; }
  .approval { border: 1px solid var(--vscode-focusBorder); padding: 0.75rem; margin-top: 1rem; border-radius: 4px; }
  .approval h2 { font-size: 1rem; margin: 0 0 0.4rem; }
  /* Visually hidden, still read by a screen reader. Repeated with the .settings
     scope because the .settings input/select rule is more specific than a bare
     class and would otherwise win the width and display properties. */
  .sr-only, .settings .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .settings .active-line { font-size: 0.78rem; margin: 0 0 0.5rem; opacity: 0.85; }
  .settings label { display: block; margin: 0.6rem 0 0.2rem; font-size: 0.8rem; opacity: 0.85; }
  .settings input, .settings select { width: 100%; box-sizing: border-box; padding: 0.35rem; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 4px; }
  .settings .note { font-size: 0.75rem; opacity: 0.75; margin: 0.3rem 0 0; }
  .settings .problem { color: var(--vscode-errorForeground); font-size: 0.8rem; }
  .settings .row { display: flex; gap: 0.4rem; margin-top: 0.8rem; }
  .settings .status { font-size: 0.8rem; min-height: 1.2em; margin: 0.4rem 0 0; }
  #attachments-host { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.4rem; }
  #attachments-host:empty { display: none; }
  .attachment-chip { display: inline-flex; align-items: center; gap: 0.2rem; max-width: 100%; padding: 0.15rem 0.35rem; border: 1px solid var(--vscode-panel-border); border-radius: 4px; font-size: 0.75rem; }
  .attachment-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .attachment-chip button { flex: 0 0 auto; padding: 0 0.2rem; }
  /* Settings shell: left nav plus content, matching the reference layout. */
  #settings-host { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  /* An empty host still grows, reserving half the sidebar for nothing. */
  #settings-host:empty { display: none; }
  #settings-host:not(:empty) { border-top: 1px solid var(--vscode-panel-border); }
  /* Settings is its own screen in the reference, not a strip above the chat. */
  body.settings-open #scroll,
  body.settings-open #auto-approve-host,
  body.settings-open #composer,
  body.settings-open #panel-foot { display: none; }
  /* #panel-bar already draws a border-bottom, so the pane does not add another. */
  body.settings-open #settings-host { border-top: none; }
  .settings { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .settings .set-head { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--vscode-panel-border); }
  .settings .set-head h2 { font-size: 1.05rem; margin: 0; }
  .settings .done { padding: 0.3rem 0.9rem; border-radius: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .settings .set-body { display: flex; flex: 1; min-height: 0; }
  .settings .set-nav { flex: 0 0 auto; width: 8.5rem; padding: 0.5rem 0.35rem; border-right: 1px solid var(--vscode-panel-border); overflow-y: auto; }
  .settings .set-nav button { display: block; width: 100%; text-align: left; padding: 0.4rem 0.5rem; border-radius: 4px; font-size: 0.82rem; opacity: 0.85; }
  .settings .set-nav button:hover { background: var(--vscode-list-hoverBackground); }
  .settings .set-nav button.on { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); opacity: 1; }
  .settings .set-content { flex: 1; min-width: 0; overflow-y: auto; padding: 0.7rem 0.75rem; }
  .settings .set-content h3 { font-size: 0.9rem; margin: 0 0 0.4rem; }
  .settings .model-card { display: flex; flex-direction: column; gap: 0.15rem; width: 100%; text-align: left; padding: 0.5rem 0.6rem; margin-bottom: 0.35rem; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
  .settings .model-card:hover { background: var(--vscode-list-hoverBackground); }
  .settings .model-card[hidden] { display: none; }
  .settings input:focus-visible, .settings select:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .settings .model-card.on { border-color: var(--vscode-focusBorder); }
  .settings .model-top { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; }
  .settings .model-name { font-weight: 600; font-size: 0.85rem; overflow-wrap: anywhere; }
  .settings .model-badge { font-size: 0.62rem; letter-spacing: 0.05em; padding: 0.05rem 0.35rem; border-radius: 3px; background: var(--vscode-charts-blue, #2f7ae5); color: #fff; }
  .settings .model-desc { font-size: 0.75rem; color: var(--vscode-descriptionForeground); overflow-wrap: anywhere; }
  @media (max-width: 480px) {
    .settings .set-body { flex-direction: column; }
    .settings .set-nav { width: auto; display: flex; flex-wrap: wrap; border-right: none; border-bottom: 1px solid var(--vscode-panel-border); }
    .settings .set-nav button { width: auto; flex: 1 0 auto; text-align: center; }
    .settings .set-content { min-height: 0; }
  }
  .settings-card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 0.8rem; margin: 0.7rem 0 1.2rem; }
  .settings-card h3 { margin: 0 0 0.8rem; font-size: 0.85rem; font-weight: 600; }
  .settings .settings-toggle { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 0.8rem 0; }
  .settings-toggle > span { min-width: 0; }
  .settings-toggle .note { display: block; margin-top: 0.3rem; font-weight: normal; }
  .settings .settings-toggle input { width: auto; flex: 0 0 auto; accent-color: var(--vscode-button-background); }
  .settings .tab-row { display: flex; gap: 1rem; border-bottom: 1px solid var(--vscode-panel-border); margin: 0.4rem 0 0.6rem; }
  .settings .tab-row button { padding: 0.35rem 0.2rem; font-size: 0.8rem; opacity: 0.75; border-bottom: 2px solid transparent; }
  .settings .tab-row button.on { opacity: 1; border-bottom-color: var(--vscode-textLink-foreground); }
  .settings .summary { display: flex; gap: 0.9rem; font-size: 0.72rem; opacity: 0.75; margin-top: 0.5rem; }
</style>
</head>
<body${snapshot.settingsOpen ? ' class="settings-open"' : ''}>
${toolbarHtml(snapshot.historyOpen)}
<div id="settings-host">${snapshot.settings}</div>
<div id="scroll">
  ${snapshot.empty ? emptyStateHtml() : ''}
  <div id="recents-host">${snapshot.recents}</div>
  <ul id="transcript">${snapshot.rows}</ul>
  <div id="approval-host">${snapshot.approval}</div>
</div>
<div id="auto-approve-host">${snapshot.autoApprove}</div>
<form id="composer">
  <label class="sr-only" for="prompt">Ask Moderado</label>
  <div id="attachments-host" role="list" aria-label="Attached context">${snapshot.attachments}</div>
  <textarea id="prompt" placeholder="Type your task here..." autocomplete="off" ${snapshot.running ? 'disabled' : ''}></textarea>
  <p class="composer-hint">Use @ for project context or + to attach files and images.</p>
  <div class="composer-foot">
    <button type="button" id="cancel" ${snapshot.running ? '' : 'disabled'}>Cancel</button>
    <button type="submit" id="send" ${snapshot.running ? 'disabled' : ''}>Send</button>
  </div>
</form>
<div id="panel-foot">
  <span class="foot-left">
    <button type="button" id="foot-context" title="Add context" aria-label="Add context" ${snapshot.running ? 'disabled' : ''}>@</button>
    <button type="button" id="foot-add" title="Add files and Images" aria-label="Add files and Images" ${snapshot.running ? 'disabled' : ''}>&#43;</button>
    <button type="button" id="foot-history" title="Sessions" aria-label="Sessions">&#128340;</button>
    <span class="ws-label">${escapeHtml(state.workspaceLabel ?? '')}</span>
    <span class="ctx-label" id="active-ctx" title="Active provider and model">${snapshot.activeContext}</span>
  </span>
  <span class="mode-toggle">
    <button type="button" id="mode-plan" class="${snapshot.planMode ? 'on' : ''}">Plan</button>
    <button type="button" id="mode-act" class="${snapshot.planMode ? '' : 'on'}">Act</button>
  </span>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const input = document.getElementById('prompt');
  const send = document.getElementById('send');
  const cancel = document.getElementById('cancel');
  const transcript = document.getElementById('transcript');
  const approvalHost = document.getElementById('approval-host');
  const scroll = document.getElementById('scroll');

  function bindApproval(pendingId) {
    const allow = document.getElementById('allow');
    const deny = document.getElementById('deny');
    const full = document.getElementById('full-diff');
    if (allow) allow.addEventListener('click', () => vscode.postMessage({ type: 'approval', requestId: pendingId, status: 'approved' }));
    if (deny) deny.addEventListener('click', () => vscode.postMessage({ type: 'approval', requestId: pendingId, status: 'denied' }));
    if (full) full.addEventListener('click', () => vscode.postMessage({ type: 'preview', requestId: pendingId }));
  }

  // User-pasted keys stay in a transient password input; stored keys never return.
  // Keep the pane mounted until its host-rendered content actually changes.
  const settingsHost = document.getElementById('settings-host');
  let settingsOpen = ${JSON.stringify(snapshot.settingsOpen)};
  let renderedSettings = ${JSON.stringify(snapshot.settings)};
  let discoveryTimer;
  let renderedPreset = ${JSON.stringify(state.settings?.preset ?? '')};
  // While the pane is open the chat surface is hidden, so settings owns the
  // sidebar instead of sharing it with a half-height transcript.
  function applySettingsVisibility() {
    document.body.classList.toggle('settings-open', Boolean(settingsOpen));
  }
  applySettingsVisibility();
  if (settingsOpen) bindSettings();
  const status = () => document.getElementById('settings-status');

  function say(text) {
    const node = status();
    if (node) node.textContent = text;
  }

  // A picked preset supplies the endpoint, kind, and id. The extra name/base-URL
  // fields only exist for the generic "other endpoint" entry.
  function readSettings() {
    const provider = document.getElementById('settings-provider');
    const displayName = document.getElementById('settings-display-name');
    const baseUrl = document.getElementById('settings-base-url');
    const loginMethod = document.getElementById('settings-login-method');
    const model = document.getElementById('settings-model');
    return {
      preset: provider ? provider.value : '',
      displayName: displayName ? displayName.value : '',
      baseUrl: baseUrl ? baseUrl.value : '',
      loginMethod: loginMethod ? loginMethod.value : 'public',
      modelId: model ? model.value : '',
    };
  }

  function readSettingsSubmission() {
    const key = document.getElementById('settings-api-key');
    return { ...readSettings(), ...(key && key.value ? { apiKey: key.value } : {}) };
  }

  function reloadModels() {
    clearTimeout(discoveryTimer);
    say('Loading free models…');
    vscode.postMessage({ type: 'refreshModels', ...readSettingsSubmission() });
  }

  function scheduleModels() {
    clearTimeout(discoveryTimer);
    discoveryTimer = setTimeout(reloadModels, 400);
  }

  function bindSettings() {
    const close = document.getElementById('close-settings');
    const save = document.getElementById('settings-save');
    const refresh = document.getElementById('settings-refresh');
    const provider = document.getElementById('settings-provider');
    const setKey = document.getElementById('settings-set-key');
    const browserLogin = document.getElementById('settings-browser-login');
    const loginMethod = document.getElementById('settings-login-method');
    const modelSelect = document.getElementById('settings-model-select');
    const apiKey = document.getElementById('settings-api-key');
    const baseUrl = document.getElementById('settings-base-url');
    if (modelSelect) modelSelect.addEventListener('change', () => {
      const model = document.getElementById('settings-model');
      if (model) model.value = modelSelect.value;
      vscode.postMessage({ type: 'chooseModel', ...readSettings(), id: modelSelect.value });
    });
    if (close) close.addEventListener('click', () => { clearTimeout(discoveryTimer); if (apiKey) apiKey.value = ''; vscode.postMessage({ type: 'closeSettings' }); });
    if (save) save.addEventListener('click', () => {
      say('Saving…');
      clearTimeout(discoveryTimer);
      vscode.postMessage({ type: 'saveSettings', ...readSettingsSubmission() });
    });
    // Reload must use what is currently in the form, not only what was last
    // saved, or it would list the previous provider's models.
    if (refresh) refresh.addEventListener('click', reloadModels);
    if (baseUrl) baseUrl.addEventListener('input', scheduleModels);
    if (apiKey) apiKey.addEventListener('input', () => {
      if (apiKey.value && loginMethod && loginMethod.value === 'public') loginMethod.value = 'manual';
      scheduleModels();
    });
    if (provider) provider.addEventListener('change', () => {
      clearTimeout(discoveryTimer);
      if (apiKey) apiKey.value = '';
      vscode.postMessage({ type: 'selectPreset', preset: provider.value });
    });
    if (setKey) setKey.addEventListener('click', () => vscode.postMessage({ type: 'setProviderKey', ...readSettings() }));
    if (browserLogin) browserLogin.addEventListener('click', () => vscode.postMessage({ type: 'gatewayBrowserLogin', ...readSettings() }));
    if (loginMethod) loginMethod.addEventListener('change', () => vscode.postMessage({ type: 'setGatewayLoginMethod', ...readSettings() }));
    for (const field of document.querySelectorAll('[data-preference]')) {
      field.addEventListener('change', () => {
        const value = field.type === 'checkbox' ? field.checked : field.type === 'number' ? Number(field.value) : field.value;
        vscode.postMessage({ type: 'setPreference', key: field.getAttribute('data-preference'), value });
      });
    }
    // Model dropdown, cost tabs, and Settings navigation.
    for (const tab of document.querySelectorAll('.tab-row button')) {
      tab.addEventListener('click', () => vscode.postMessage({ type: 'setModelTab', ...readSettings(), tab: tab.getAttribute('data-tab') }));
    }
    for (const nav of document.querySelectorAll('.set-nav button')) {
      nav.addEventListener('click', () => { clearTimeout(discoveryTimer); vscode.postMessage({ type: 'setSettingsPage', ...readSettings(), page: nav.getAttribute('data-page') }); });
    }
  }

  // Auto-approve: expanding and toggling are host decisions. The renderer never
  // decides for itself that an action is approved.
  const aaHost = document.getElementById('auto-approve-host');
  function bindAutoApprove() {
    const toggle = document.getElementById('aa-toggle');
    if (toggle) toggle.addEventListener('click', () => vscode.postMessage({ type: 'toggleAutoApprovePanel' }));
    for (const box of document.querySelectorAll('.aa-box')) {
      box.addEventListener('change', () => vscode.postMessage({ type: 'setAutoApprove', key: box.getAttribute('data-key'), value: box.checked }));
    }
  }
  bindAutoApprove();

  document.getElementById('new-session').addEventListener('click', () => vscode.postMessage({ type: 'newSession' }));
  document.getElementById('toggle-history').addEventListener('click', () => vscode.postMessage({ type: 'toggleHistory' }));
  document.getElementById('open-settings').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
  document.getElementById('mode-plan').addEventListener('click', () => vscode.postMessage({ type: 'setMode', mode: 'Plan' }));
  document.getElementById('mode-act').addEventListener('click', () => vscode.postMessage({ type: 'setMode', mode: 'Act' }));
  document.getElementById('foot-context').addEventListener('click', () => vscode.postMessage({ type: 'addContext' }));
  document.getElementById('foot-add').addEventListener('click', () => vscode.postMessage({ type: 'addFiles' }));
  document.getElementById('foot-history').addEventListener('click', () => vscode.postMessage({ type: 'showSessions' }));

  // Enter sends; Shift+Enter inserts a newline, as in the reference composer.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      document.getElementById('composer').requestSubmit();
    }
  });

  document.getElementById('composer').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text && !document.querySelector('[data-attachment-id]')) return;
    vscode.postMessage({ type: 'prompt', text });
    input.value = '';
  });
  cancel.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
  function bindAttachments() {
    for (const button of document.querySelectorAll('[data-attachment-id]')) {
      button.addEventListener('click', () => vscode.postMessage({ type: 'removeAttachment', id: button.getAttribute('data-attachment-id') }));
    }
  }
  bindAttachments();
  let renderedAttachments = ${JSON.stringify(snapshot.attachments)};
  bindApproval(${JSON.stringify(snapshot.pendingId)});

  // Snapshots of the last rendered markup, so an update that did not change a
  // section does not rewrite its DOM (which would drop focus or a selection).
  let renderedRecents = ${JSON.stringify(snapshot.recents)};
  let renderedHistoryOpen = ${JSON.stringify(snapshot.historyOpen)};
  let aaHtml = ${JSON.stringify(snapshot.autoApprove)};
  let renderedContext = ${JSON.stringify(snapshot.activeContext)};

  function bindRecents() {
    for (const button of document.querySelectorAll('[data-delete-session]')) {
      button.addEventListener('click', () => vscode.postMessage({ type: 'deleteSession', id: button.getAttribute('data-delete-session') }));
    }
    for (const row of document.querySelectorAll('.recent-row')) {
      row.addEventListener('click', () => vscode.postMessage({ type: 'openSession', id: row.getAttribute('data-session') }));
    }
    const all = document.getElementById('view-all-sessions');
    if (all) all.addEventListener('click', () => vscode.postMessage({ type: 'showSessions' }));
  }
  bindRecents();

  // Updates are applied to the live DOM. Rebuilding the document here would
  // discard whatever the user is currently typing and steal focus.
  window.addEventListener('message', (event) => {
    const update = event.data;
    if (update && update.type === 'providerSaved') {
      const field = document.getElementById('settings-api-key');
      if (field) field.value = '';
      return;
    }
    if (!update || update.type !== 'update') return;
    // Measured before the DOM is rewritten. A reader who scrolled up to re-read
    // earlier output must not be dragged back down by the next streamed token,
    // so the tail is only followed when it was already in view.
    const pinned = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 24;
    transcript.innerHTML = update.rows;
    approvalHost.innerHTML = update.approval;
    input.disabled = update.running;
    document.getElementById('foot-context').disabled = update.running;
    document.getElementById('foot-add').disabled = update.running;
    if (update.attachments !== undefined && update.attachments !== renderedAttachments) {
      renderedAttachments = update.attachments;
      document.getElementById('attachments-host').innerHTML = update.attachments;
      bindAttachments();
    }
    send.disabled = update.running;
    cancel.disabled = !update.running;
    if (update.pendingId) bindApproval(update.pendingId);
    // The welcome state and the RECENT list change far less often than the
    // transcript, so they are only rewritten when their content actually differs.
    // The history toggle also updates the top-bar pressed state.
    if ((update.recents !== undefined && update.recents !== renderedRecents)
      || (update.historyOpen !== undefined && update.historyOpen !== renderedHistoryOpen)) {
      if (update.recents !== undefined) renderedRecents = update.recents;
      if (update.historyOpen !== undefined) renderedHistoryOpen = update.historyOpen;
      const host = document.getElementById('recents-host');
      if (host) {
        host.innerHTML = renderedRecents;
        bindRecents();
      }
      const historyToggle = document.getElementById('toggle-history');
      if (historyToggle) historyToggle.setAttribute('aria-pressed', String(renderedHistoryOpen));
    }
    if (update.autoApprove !== undefined && update.autoApprove !== aaHtml) {
      aaHtml = update.autoApprove;
      aaHost.innerHTML = update.autoApprove;
      bindAutoApprove();
    }
    // The active provider/model footer follows the connection and model, so it
    // is only rewritten when the escaped context actually differs.
    if (update.activeContext !== undefined && update.activeContext !== renderedContext) {
      renderedContext = update.activeContext;
      const ctx = document.getElementById('active-ctx');
      if (ctx) ctx.innerHTML = update.activeContext;
    }
    // Discovery and provider/model changes must refresh an already-open pane.
    // Identical snapshots leave the form intact during unrelated chat updates.
    if (update.settingsOpen !== undefined
      && (update.settingsOpen !== settingsOpen || update.settings !== renderedSettings)) {
      const drafts = [];
      for (const id of ['settings-display-name', 'settings-base-url', 'settings-api-key']) {
        const field = document.getElementById(id);
        if (field && field.value !== field.defaultValue) drafts.push([id, field.value]);
      }
      const focused = document.activeElement;
      const focusedId = focused && focused.id;
      const selectionStart = focused && focused.selectionStart;
      const selectionEnd = focused && focused.selectionEnd;
      settingsOpen = update.settingsOpen;
      if (!settingsOpen) clearTimeout(discoveryTimer);
      renderedSettings = update.settings || '';
      settingsHost.innerHTML = renderedSettings;
      const provider = document.getElementById('settings-provider');
      const nextPreset = provider ? provider.value : '';
      if (settingsOpen && nextPreset === renderedPreset) {
        for (const [id, value] of drafts) {
          const field = document.getElementById(id);
          if (field) field.value = value;
        }
        const field = focusedId && document.getElementById(focusedId);
        if (field) {
          field.focus();
          if (selectionStart !== null && selectionStart !== undefined && field.setSelectionRange) {
            field.setSelectionRange(selectionStart, selectionEnd);
          }
        }
      }
      renderedPreset = nextPreset;
      applySettingsVisibility();
      if (settingsOpen) {
        bindSettings();
    
      }
    }
    if (update.settingsStatus !== undefined) say(update.settingsStatus);
    for (const [id, on] of [['mode-plan', update.planMode], ['mode-act', !update.planMode]]) {
      const node = document.getElementById(id);
      if (node) node.classList.toggle('on', Boolean(on));
    }
    if (pinned) scroll.scrollTop = scroll.scrollHeight;
  });
</script>
</body>
</html>`;
}
export function viewSnapshot(
  state: ChatViewState,
  preview: (r: ApprovalRequest) => string,
): ViewSnapshot {
  const rows = state.transcript
    .map(
      (entry) =>
        `<li class="${escapeHtml(entry.kind)}"><span class="who">${escapeHtml(entry.label)}</span><pre>${escapeHtml(entry.text)}</pre></li>`,
    )
    .join('');
  const settings = state.settings ?? emptySettings();
  const auto = state.autoApprove ?? {
    expanded: false,
    readFiles: false,
    editFiles: false,
    executeCommands: false,
    fetchWeb: false,
    useMcp: false,
  };
  const planMode = (state as { planMode?: boolean }).planMode === true;
  // Only display-safe strings reach the DOM, and only after escaping: the
  // provider name comes from the shared profile and the model id from the
  // validated Settings selection, but both are still treated as untrusted.
  const activeContext = escapeHtml(
    [state.activeProviderName, state.activeModelId].filter((part) => part && part.trim()).join(' · '),
  );
  return {
    attachments: (state.attachments ?? []).map(attachment => `<span class="attachment-chip" role="listitem" title="${escapeHtml(attachment.kind)}"><span>${attachment.kind === 'context' ? '@ ' : ''}${escapeHtml(attachment.label)}</span><button type="button" data-attachment-id="${escapeHtml(attachment.id)}" aria-label="Remove ${escapeHtml(attachment.label)}" ${state.running ? 'disabled' : ''}>&times;</button></span>`).join(''),
    rows,
    approval: approvalHtml(state.pendingApproval, preview),
    running: state.running,
    pendingId: state.pendingApproval?.requestId ?? null,
    recents: recentsHtml(state),
    historyOpen: state.historyOpen === true,
    autoApprove: autoApproveHtml(auto),
    autoApproveExpanded: auto.expanded,
    planMode,
    // The welcome state only shows before the first message; afterwards the
    // transcript speaks for itself.
    empty: state.transcript.length === 0,
    settingsOpen: settings.open,
    // Empty unless open, so the pane never reaches the document unasked.
    settings: settings.open ? settingsPaneHtml(settings) : '',
    settingsStatus: settings.status ?? '',
    activeContext,
  };
}

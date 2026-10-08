import { defaultSettingsPreferences, settingsFeaturesHtml, settingsGeneralHtml, type SettingsPreferences } from './settings-preferences.js';
import { settingsAboutHtml } from './settings-about.js';
import { escapeHtml } from './html.js';
import { validateProviderBaseUrl } from './provider-setup.js';
import type { GatewayLoginMethod } from './gateway-login.js';

/**
 * The in-panel Moderado settings pane, as pure string building.
 *
 * Same split as chat-view.ts: no `vscode` import, so this is directly testable.
 *
 * SECURITY BOUNDARY. This pane carries nonsecret choices only. User-entered keys live transiently
 * in a password input; stored keys are never rendered and persistence stays in the host.
 *  - Everything rendered here (provider names, base URLs, model ids, profile
 *    errors) is untrusted data from the shared profile and is escaped.
 */

export interface SettingsModel {
  id: string;
  /** Engine `AccessTier`: free_trial | paid | local | unknown. */
  accessTier: string;
  isFree: boolean;
  provider?: string;
  ownedBy?: string;
  capabilities?: string[];
  dataNote?: string;
}

/** A saved connection read back from the shared `~/.moderado/config.json`. */
export interface SettingsConnectionView {
  id: string;
  displayName: string;
  baseUrl: string;
  kind: string;
  /** True when a Credential Manager reference (or legacy key) is stored. */
  hasCredential: boolean;
  defaultModel?: string;
}

/** A picker entry; mirrors the engine's preset metadata plus CLI tags. */
export interface SettingsProviderChoice {
  value: string;
  label: string;
  description: string;
  tag?: string;
  baseUrl?: string;
  defaultModel?: string;
  requiresApiKey: boolean;
  /** True for the generic "other endpoint" entry, which needs the extra fields. */
  custom?: boolean;
  /**
   * True when this provider already has a credential in Windows Credential
   * Manager. Only the presence is exposed; the secret never reaches the pane.
   */
  hasCredential?: boolean;
  /** Endpoint already recorded in the profile, if any. */
  storedBaseUrl?: string;
}

export interface SettingsState {
  open: boolean;
  /** The engine-driven provider picker, in the CLI's order. */
  providers: SettingsProviderChoice[];
  /** Currently selected picker value. */
  preset: string;
  /** Connections already present in the shared profile, so the CLI's work is visible. */
  savedConnections: SettingsConnectionView[];
  activeConnectionId: string;
  /** The resolved `config.json` path, shown so the user can confirm what was read. */
  profilePath: string;
  baseUrl: string;
  displayName: string;
  /** True when a Credential Manager entry exists. The key itself is never here. */
  apiKeyStored: boolean;
  models: SettingsModel[];
  defaultModel: string;
  loginMethod?: GatewayLoginMethod;
  allowPaid?: boolean;
  allowUnknown?: boolean;
  /** Set when the profile could not be read; blocks saving rather than defaulting. */
  profileError?: string;
  /** Transient feedback line, e.g. "Saved." or a failure reason. */
  status?: string;
  /** Which settings section the left nav has selected. */
  page?: string;
  /** 'free' shows cost-free models (default); 'paid' shows paid models. */
  modelTab?: string;
  ideVersion?: string;
  editorVersion?: string;
  preferences?: SettingsPreferences;
}

export function emptySettings(): SettingsState {
  return {
    open: false,
    providers: [],
    preset: '',
    savedConnections: [],
    activeConnectionId: '',
    profilePath: '',
    baseUrl: '',
    displayName: '',
    apiKeyStored: false,
    models: [],
    defaultModel: '',
    loginMethod: 'public',
    allowPaid: false,
    allowUnknown: false,
  };
}

/** The parts of the pane the webview updates in place. */
export interface SettingsSnapshot {
  settingsOpen: boolean;
  settings: string;
  /** Delivered separately so a status change does not rewrite the form. */
  settingsStatus: string;
}

/** One `<option>` per provider preset, in the engine's order. */
function providerOptions(state: SettingsState): string {
  return state.providers
    .map(
      (choice) =>
        `<option value="${escapeHtml(choice.value)}"${choice.value === state.preset ? ' selected' : ''}>${escapeHtml(choice.tag ? `${choice.label} · ${choice.tag}` : choice.label)}</option>`,
    )
    .join('');
}

/** The selected preset, if it is known. */
function selectedChoice(state: SettingsState): SettingsProviderChoice | undefined {
  return state.providers.find((choice) => choice.value === state.preset);
}

/**
 * One `<option>` per model, labelled with its cost tier.
 *
 * The list arrives free-first so the cheapest option is the one at the top, and
 * the tier stays visible so the free-first rule and the paid/unknown opt-in
 * remain observable rather than hidden.
 */
function modelOptions(state: SettingsState): string {
  return tabModels(state)
    .map((model) => {
      const name = model.id === 'auto'
        ? state.preset === 'moderado-cloud' ? 'AUTO · Gateway routing' : 'AUTO · Free-first'
        : model.id;
      const tier = model.isFree && model.id.toLowerCase().endsWith(':free')
        ? ''
        : ` — ${model.accessTier}`;
      return `<option value="${escapeHtml(model.id)}"${model.id === state.defaultModel ? ' selected' : ''}>${escapeHtml(`${model.isFree ? '★ ' : ''}${name}${tier}`)}</option>`;
    })
    .join('');
}

function eligibleModels(state: SettingsState): SettingsModel[] {
  return state.models.filter(model => model.id === 'auto' || model.isFree || model.accessTier === 'local'
    || (model.accessTier === 'paid' && state.allowPaid) || (model.accessTier === 'unknown' && state.allowUnknown));
}

/** True when the Paid tab is selected; Free is the default. */
function paidTab(state: SettingsState): boolean {
  return state.modelTab === 'paid';
}

/** Models shown in the drop-down: Free shows free + AUTO, Paid shows paid. */
function tabModels(state: SettingsState): SettingsModel[] {
  const eligible = eligibleModels(state);
  if (paidTab(state)) return eligible.filter((m) => !m.isFree && m.id !== 'auto' && m.accessTier !== 'local');
  return eligible.filter((m) => m.isFree || m.id === 'auto' || m.accessTier === 'local');
}

/** The left-hand settings navigation, matching the reference layout. */
const SETTINGS_PAGES = [
  { id: 'api', label: 'API Config' },
  { id: 'features', label: 'Features' },
  { id: 'general', label: 'General' },
  { id: 'about', label: 'About' },
] as const;

function settingsNav(page: string): string {
  return SETTINGS_PAGES.map(
    (entry) => `<button type="button" data-page="${entry.id}" class="${page === entry.id ? 'on' : ''}">${escapeHtml(entry.label)}</button>`,
  ).join('');
}

/** A short empty state or metadata for the selected model, never the whole catalog. */
function selectedModelDetails(state: SettingsState): string {
  const shown = tabModels(state);
  if (!shown.length) {
    return `<p class="note">${state.models.length ? (paidTab(state) ? 'No paid models listed. Enable paid models or load models first.' : 'No free models on this provider.') : 'No models loaded yet.'}</p>`;
  }
  const model = shown.find(entry => entry.id === state.defaultModel);
  if (!model) return '';
  return `<div class="selected-model-details">
    ${model.id === 'auto' ? `<p class="note">${state.preset === 'moderado-cloud' ? 'Gateway selects a free route.' : 'Ranks eligible models and permits fallback.'}</p>` : ''}
    ${model.provider ? `<p class="note">Provider: ${escapeHtml(model.provider)}</p>` : ''}
    ${model.ownedBy ? `<p class="note">Owner: ${escapeHtml(model.ownedBy)}</p>` : ''}
    ${model.capabilities?.length ? `<p class="note">Capabilities: ${escapeHtml(model.capabilities.join(', '))}</p>` : ''}
    ${model.dataNote ? `<p class="note">${escapeHtml(model.dataNote)}</p>` : ''}
  </div>`;
}

/**
 * The connection form.
 *
 * The preset supplies the endpoint, the connection kind, and (for OrcaRouter) a
 * default model, so a known provider needs only a key. The base URL, name, and
 * model fields appear only for the generic "other endpoint" entry, which is what
 * the CLI does: asking for a base URL the preset already knows would invite a
 * user to break a working provider.
 */
export function settingsPaneHtml(state: SettingsState): string {
  // A corrupt profile must stop the user here. Rendering an empty form would
  // invite saving defaults over data that was never successfully read.
  if (state.page === 'about' || state.page === 'features' || state.page === 'general') {
    const preferences = state.preferences ?? { ...defaultSettingsPreferences };
    const content = state.page === 'about' ? settingsAboutHtml(state.ideVersion ?? 'Development', state.editorVersion)
      : state.page === 'features' ? settingsFeaturesHtml(preferences) : settingsGeneralHtml(preferences);
    return `<section id="settings-pane" class="settings" aria-label="Moderado settings">
      <div class="set-head"><h2>Settings</h2><button id="close-settings" type="button" class="done">Done</button></div>
      <div class="set-body"><nav class="set-nav" aria-label="Settings sections">${settingsNav(state.page)}</nav>
      <div class="set-content">${content}<p id="settings-status" class="status" role="status">${escapeHtml(state.status ?? '')}</p></div></div>
    </section>`;
  }
  const blocked = Boolean(state.profileError);
  const disabled = blocked ? ' disabled' : '';

  const choice = selectedChoice(state);
  const generic = choice?.custom === true;
  const gateway = state.preset === 'moderado-cloud';
  const loginMethod = state.loginMethod ?? 'public';
  const needsKey = gateway ? loginMethod !== 'public' : choice?.requiresApiKey ?? true;
  // Per-provider credential state: picking a provider shows whether that one
  // already has a key, rather than the previous provider's.
  const keyStored = choice?.hasCredential ?? state.apiKeyStored;

  const problem = blocked
    ? `<p class="problem" role="alert">${escapeHtml(state.profileError as string)} Fix or move that file before changing settings; Desktop did not read it and will not overwrite it.</p>`
    : '';

  // The shared profile is the source of truth for both applications, so the
  // active connection is surfaced compactly. An earlier version rendered every
  // connection as a card under a full path heading, which dominated the pane;
  // the details stay available via the command palette and the profile itself.
  const active = state.savedConnections.find((c) => c.id === state.activeConnectionId);
  const compactActive = state.activeConnectionId
    ? `<p class="active-line" title="Shared profile: ${escapeHtml(state.profilePath || '~/.moderado/config.json')}">Using <strong>${escapeHtml(active?.displayName ?? state.activeConnectionId)}</strong>${active?.hasCredential ? ' · key stored' : ''}</p>`
    : '';

  const loginField = gateway ? `<label for="settings-login-method">Gateway access</label>
    <select id="settings-login-method"${disabled}>
      ${(['public', 'browser', 'manual'] as const).map(method => `<option value="${method}"${method === loginMethod ? ' selected' : ''}>${{ public: 'Public access · no key', browser: 'Browser sign-in', manual: 'Manual Gateway key' }[method]}</option>`).join('')}
    </select>` : '';
  const keyField = `<label for="settings-api-key">API Key${needsKey ? '' : ' (optional)'}</label>
    <input id="settings-api-key" type="password" autocomplete="off" spellcheck="false" maxlength="8192"
           placeholder="${keyStored ? 'Key stored · paste to replace' : 'Paste API key'}" value=""${disabled} />
    <p class="note">${keyStored ? 'Credential stored. A key is already stored for this provider; this field stays blank. Paste only to replace it.' : 'No credential stored. Keys are stored securely when you save.'}</p>
    ${!needsKey ? `<p class="note">${gateway ? 'Public access uses the Gateway without a key.' : 'This local runtime needs no API key.'}</p>` : ''}
    ${gateway && loginMethod === 'browser' ? `<button id="settings-browser-login" type="button"${disabled}>Sign in with browser</button>` : ''}`;

  const extra = `${generic ? `<label for="settings-display-name">Provider name</label>
    <input id="settings-display-name" type="text" spellcheck="false"
           placeholder="My provider" value="${escapeHtml(state.displayName)}"${disabled} />` : ''}
    <label for="settings-base-url">Base URL</label>
    <input id="settings-base-url" type="text" spellcheck="false"
           placeholder="https://api.example.com/v1" value="${escapeHtml(state.baseUrl || choice?.storedBaseUrl || choice?.baseUrl || '')}"${disabled} />
    <p class="note">${state.baseUrl || choice?.storedBaseUrl || choice?.baseUrl ? 'HTTPS only. HTTP is accepted for localhost endpoints.' : 'No Base URL is known for this provider. Enter a Base URL to continue.'}</p>`;

  const modelField = `<h3>Model</h3>
    <div class="tab-row">
      <button type="button" data-tab="free" class="${paidTab(state) ? '' : 'on'}">Free</button>
      <button type="button" data-tab="paid" class="${paidTab(state) ? 'on' : ''}">Paid</button>
    </div>
    <label for="settings-model-select">Model</label>
    <select id="settings-model-select"${disabled}>${modelOptions(state)}</select>
    <label class="sr-only" for="settings-model">Default model</label>
    <select id="settings-model" class="sr-only"${disabled}>${modelOptions(state)}</select>
    <p class="note">Selected model: <strong>${escapeHtml(state.defaultModel || 'No model selected')}</strong></p>
    ${selectedModelDetails(state)}
    <p class="summary">
      <span>${state.models.filter((m) => m.isFree).length} free</span>
      <span>${eligibleModels(state).length} listed</span>
    </p>`;

  const presetNote = choice ? `<p class="note">${escapeHtml(choice.description)}</p>` : '';

  return `<section id="settings-pane" class="settings" aria-label="Moderado settings">
    <div class="set-head">
      <h2>Settings</h2>
      <button id="close-settings" type="button" class="done">Done</button>
    </div>
    <div class="set-body">
      <nav class="set-nav" aria-label="Settings sections">${settingsNav(state.page ?? 'api')}</nav>
      <div class="set-content">
        ${problem}
        ${compactActive}
        <label for="settings-provider">API Provider</label>
        <select id="settings-provider"${disabled}>${providerOptions(state)}</select>
        ${presetNote}
        ${extra}
        ${loginField}
        ${keyField}
        ${modelField}
        <div class="row">
          <button id="settings-save" type="button"${disabled}>Save settings</button>
          <button id="settings-refresh" type="button"${disabled}>Reload models</button>
        </div>
        <p class="note">Save settings to keep the provider and model after restart.</p>
        <p id="settings-status" class="status" role="status">${escapeHtml(state.status ?? '')}</p>
      </div>
    </div>
  </section>`;
}

export function settingsSnapshot(state: SettingsState): SettingsSnapshot {
  return {
    settingsOpen: state.open,
    settings: state.open ? settingsPaneHtml(state) : '',
    settingsStatus: state.status ?? '',
  };
}

export interface SettingsFormValues {
  /** The picker value: a preset id, `openai-compatible`, or `custom:<id>`. */
  preset: string;
  displayName: string;
  baseUrl: string;
  modelId?: string;
  loginMethod: GatewayLoginMethod;
}

export type ParsedSettings =
  | { ok: true; value: SettingsFormValues }
  | { ok: false; error: string };

/**
 * Validates a submitted form at the boundary.
 *
 * This deliberately checks only shape. The connection's endpoint, kind, id, and
 * default model come from the preset and are resolved by `buildProviderConnection`
 * (provider-setup.ts), which is where the CLI's rules live, so there is one
 * implementation of them rather than two that can disagree.
 */
export function parseSettingsForm(message: unknown): ParsedSettings {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return { ok: false, error: 'Malformed settings message.' };
  const raw = message as Record<string, unknown>;
  if (['apiKey', 'token', 'authorizationCode', 'credentialReference'].some(field => field in raw)) {
    return { ok: false, error: 'Provider credentials must be entered in the secure editor prompt.' };
  }
  const loginMethod = raw.loginMethod ?? 'public';
  if (loginMethod !== 'public' && loginMethod !== 'manual' && loginMethod !== 'browser') {
    return { ok: false, error: 'Choose a valid Gateway login method.' };
  }

  const preset = typeof raw.preset === 'string' ? raw.preset.trim() : '';
  if (!preset) return { ok: false, error: 'Choose a provider.' };
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(preset)) {
    return { ok: false, error: 'That provider value is not recognised.' };
  }

  const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : '';
  if (raw.displayName !== undefined && raw.displayName !== null && typeof raw.displayName !== 'string') {
    return { ok: false, error: 'Malformed provider name.' };
  }
  // The name becomes the connection id via a slug, and that slug is the
  // Credential Manager target name, so it must stay in the CLI's safe charset.
  if (displayName && !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(displayName)) {
    return { ok: false, error: 'That provider name contains characters that cannot be stored safely.' };
  }

  let baseUrl = '';
  if (typeof raw.baseUrl === 'string') {
    baseUrl = raw.baseUrl.trim();
  } else if (raw.baseUrl !== undefined && raw.baseUrl !== null) {
    return { ok: false, error: 'Malformed base URL.' };
  }

  if (baseUrl) {
    try { baseUrl = validateProviderBaseUrl(baseUrl); }
    catch { return { ok: false, error: 'Use HTTPS, or HTTP for a loopback endpoint, without credentials, query, or fragment.' }; }
  }

  let modelId: string | undefined;
  if (typeof raw.modelId === 'string') {
    const trimmed = raw.modelId.trim();
    if (trimmed) modelId = trimmed;
  } else if (raw.modelId !== undefined && raw.modelId !== null) {
    return { ok: false, error: 'Malformed model id.' };
  }

  if (modelId && /[\u0000-\u001f\u007f]/.test(modelId)) return { ok: false, error: 'Malformed model id.' };
  return { ok: true, value: { preset, displayName, baseUrl, loginMethod, modelId } };
}


/** User-entered keys are accepted only by the explicit discovery/save boundary. */
export function parseSettingsSubmission(message: unknown):
  | { ok: true; value: SettingsFormValues & { apiKey?: string } }
  | { ok: false; error: string } {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return { ok: false, error: 'Malformed settings message.' };
  const { apiKey, ...nonsecret } = message as Record<string, unknown>;
  const parsed = parseSettingsForm(nonsecret);
  if (!parsed.ok) return parsed;
  if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > 8192 || /[\x00-\x1f\x7f]/.test(apiKey))) {
    return { ok: false, error: 'Enter a valid API key (at most 8192 characters, without control characters).' };
  }
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  return { ok: true, value: { ...parsed.value, ...(key ? { apiKey: key } : {}) } };
}

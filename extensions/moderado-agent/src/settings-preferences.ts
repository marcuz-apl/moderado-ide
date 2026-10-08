import { escapeHtml } from './html.js';

export const PREFERRED_LANGUAGES = ['English', 'French', 'Spanish', 'German', 'Chinese', 'Japanese', 'Portuguese'] as const;
export type PreferredLanguage = typeof PREFERRED_LANGUAGES[number];

export interface SettingsPreferences {
  allowPaidModels: boolean;
  allowUnknownModels: boolean;
  webSearchEnabled: boolean;
  showHistoryOnStartup: boolean;
  preferredLanguage: PreferredLanguage;
  approvalTimeoutSeconds: number;
}

export const defaultSettingsPreferences: Readonly<SettingsPreferences> = Object.freeze({
    allowPaidModels: false,
    allowUnknownModels: false,
    webSearchEnabled: true,
    showHistoryOnStartup: false,
    preferredLanguage: 'English',
    approvalTimeoutSeconds: 120,
});

export type PreferenceChange = {
  [Key in keyof SettingsPreferences]: { key: Key; value: SettingsPreferences[Key] }
}[keyof SettingsPreferences];

export type PreferenceChangeResult = { ok: true; value: PreferenceChange } | { ok: false; error: string };

/** Validate editor/webview input without coercing strings into permissions. */
export function parsePreferenceChange(key: unknown, value: unknown): PreferenceChangeResult {
  switch (key) {
    case 'allowPaidModels':
    case 'allowUnknownModels':
    case 'webSearchEnabled':
    case 'showHistoryOnStartup':
      return typeof value === 'boolean'
        ? { ok: true, value: { key, value } }
        : { ok: false, error: 'This setting requires a boolean value.' };
    case 'preferredLanguage':
      return typeof value === 'string' && PREFERRED_LANGUAGES.some(language => language === value)
        ? { ok: true, value: { key, value: value as PreferredLanguage } }
        : { ok: false, error: 'Choose a supported preferred language.' };
    case 'approvalTimeoutSeconds':
      return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1 && value <= 600
        ? { ok: true, value: { key, value } }
        : { ok: false, error: 'Approval timeout must be a whole number from 1 to 600 seconds.' };
    default:
      return { ok: false, error: 'Unknown setting.' };
  }
}

type ToggleKey = 'allowPaidModels' | 'allowUnknownModels' | 'webSearchEnabled' | 'showHistoryOnStartup';

function toggle(preferences: SettingsPreferences, key: ToggleKey, label: string, description: string): string {
  return `<label class="settings-toggle" for="preference-${key}">
    <span><strong>${escapeHtml(label)}</strong><span class="note">${escapeHtml(description)}</span></span>
    <input id="preference-${key}" type="checkbox" data-preference="${key}"${preferences[key] ? ' checked' : ''} />
  </label>`;
}

export function settingsFeaturesHtml(preferences: SettingsPreferences): string {
  return `<h2>Features</h2>
  <section class="settings-card"><h3>Agent</h3>
    ${toggle(preferences, 'allowPaidModels', 'Allow paid models', 'Include models that may incur provider charges.')}
    ${toggle(preferences, 'allowUnknownModels', 'Allow models with unknown cost', 'Include models whose cost cannot be verified.')}
    ${toggle(preferences, 'webSearchEnabled', 'Web search', 'Allow the agent to search the web.')}
  </section>
  <section class="settings-card"><h3>Editor</h3>
    ${toggle(preferences, 'showHistoryOnStartup', 'Show chat history on startup', 'Open the history list when Moderado starts.')}
    <label for="preference-preferredLanguage">Preferred reply language</label>
    <select id="preference-preferredLanguage" data-preference="preferredLanguage">
      ${PREFERRED_LANGUAGES.map(language => `<option value="${escapeHtml(language)}"${language === preferences.preferredLanguage ? ' selected' : ''}>${escapeHtml(language)}</option>`).join('')}
    </select>
    <p class="note">The agent uses this language for replies.</p>
  </section>
  <section class="settings-card"><h3>Advanced</h3>
    <label for="preference-approvalTimeoutSeconds">Approval timeout (seconds)</label>
    <input id="preference-approvalTimeoutSeconds" type="number" data-preference="approvalTimeoutSeconds" min="1" max="600" step="1" value="${escapeHtml(preferences.approvalTimeoutSeconds)}" />
    <p class="note">Unanswered approval requests are denied when this time expires. Applies to new tasks.</p>
  </section>`;
}

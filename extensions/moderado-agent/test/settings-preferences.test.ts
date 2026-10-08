import { describe, expect, it } from 'vitest';
import { defaultSettingsPreferences, parsePreferenceChange, settingsFeaturesHtml, settingsGeneralHtml } from '../src/settings-preferences.js';

describe('Settings preferences', () => {
  it('defaults to free models, web search, English, and a bounded approval wait', () => {
    expect(defaultSettingsPreferences).toEqual({ allowPaidModels: false, allowUnknownModels: false, webSearchEnabled: true, showHistoryOnStartup: false, preferredLanguage: 'English', approvalTimeoutSeconds: 120 });
  });

  it('validates every supported preference with a typed value', () => {
    for (const key of ['allowPaidModels', 'allowUnknownModels', 'webSearchEnabled', 'showHistoryOnStartup']) {
      expect(parsePreferenceChange(key, true)).toEqual({ ok: true, value: { key, value: true } });
      expect(parsePreferenceChange(key, 'true').ok).toBe(false);
      expect(parsePreferenceChange(key, 1).ok).toBe(false);
    }
    for (const value of ['English', 'French', 'Spanish', 'German', 'Chinese', 'Japanese', 'Portuguese'])
      expect(parsePreferenceChange('preferredLanguage', value)).toEqual({ ok: true, value: { key: 'preferredLanguage', value } });
    for (const value of [1, 120, 600])
      expect(parsePreferenceChange('approvalTimeoutSeconds', value)).toEqual({ ok: true, value: { key: 'approvalTimeoutSeconds', value } });
  });

  it('rejects unknown keys, invalid language values, and malformed timeout values', () => {
    for (const key of ['__proto__', 'constructor', 'apiKey', '', null, {}])
      expect(parsePreferenceChange(key, true).ok).toBe(false);
    for (const value of ['english', '', '<script>', null, {}])
      expect(parsePreferenceChange('preferredLanguage', value).ok).toBe(false);
    for (const value of [0, 601, -1, 1.5, NaN, Infinity, '120', null, undefined])
      expect(parsePreferenceChange('approvalTimeoutSeconds', value).ok).toBe(false);
  });

  it('renders only real features controls and reflects preference values', () => {
    const html = settingsFeaturesHtml({ ...defaultSettingsPreferences, allowPaidModels: true, approvalTimeoutSeconds: 60 });
    for (const title of ['Agent', 'Editor', 'Advanced']) expect(html).toContain(`>${title}</h3>`);
    for (const key of ['allowPaidModels', 'allowUnknownModels', 'webSearchEnabled', 'showHistoryOnStartup', 'approvalTimeoutSeconds'])
      expect(html).toContain(`data-preference="${key}"`);
    expect(html).toMatch(/data-preference="allowPaidModels"[^>]*checked/);
    expect(html).toMatch(/data-preference="allowUnknownModels"(?![^>]*checked)/);
    expect(html).toContain('type="number"');
    expect(html).toContain('min="1" max="600" step="1" value="60"');
  });

  it('renders language selection and explicit reporting status', () => {
    const html = settingsGeneralHtml({ ...defaultSettingsPreferences, preferredLanguage: 'French' });
    expect(html).toContain('data-preference="preferredLanguage"');
    expect(html).toContain('<option value="French" selected>French</option>');
    expect(html).toContain('Moderado Agent does not send usage or error reports.');
    expect(html).not.toContain('type="checkbox"');
  });
});

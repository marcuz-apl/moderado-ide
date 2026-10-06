import { describe, expect, it } from 'vitest';
import { emptySettings, parseSettingsForm, settingsPaneHtml, settingsSnapshot } from '../src/settings-view.js';
import { buildProviderChoices } from '../src/provider-setup.js';

const gateway = () => ({ ...emptySettings(), open: true, preset: 'moderado-cloud',
  providers: buildProviderChoices(), baseUrl: 'http://127.0.0.1:4788/v1' });

describe('Gateway and provider Settings boundary', () => {
  it('offers the Gateway login choices and an editable loopback/HTTPS endpoint', () => {
    const html = settingsPaneHtml(gateway());
    expect(html).toContain('id="settings-login-method"');
    for (const method of ['public', 'browser', 'manual']) expect(html).toContain(`value="${method}"`);
    expect(html).toContain('id="settings-base-url"');
    expect(html).toContain('http://127.0.0.1:4788/v1');
    expect(html).not.toContain('local runtime needs no API key');
    expect(html).toContain('Public access');
  });

  it('collects keys in a native host prompt and never renders a password field', () => {
    const state = { ...gateway(), loginMethod: 'manual' as const, apiKeyStored: true };
    const html = settingsPaneHtml(state);
    expect(html).toContain('id="settings-set-key"');
    expect(html).toContain('Set or update key');
    expect(html).toContain('Credential stored');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('settings-api-key');
    expect(JSON.stringify(settingsSnapshot(state))).not.toContain('moderado/provider/');
  });

  it('offers browser sign-in without accepting a token in the pane', () => {
    expect(settingsPaneHtml({ ...gateway(), loginMethod: 'browser' })).toContain('id="settings-browser-login"');
  });

  it('preserves route IDs and escapes every Gateway metadata field', () => {
    const html = settingsPaneHtml({ ...gateway(), modelTab: 'free', defaultModel: 'owner/Exact:Route', models: [
      { id: 'auto', accessTier: 'free_trial', isFree: true },
      { id: 'owner/Exact:Route', accessTier: 'free_trial', isFree: true, provider: '<provider>',
        ownedBy: '<owner>', capabilities: ['<tools>'], dataNote: '<script>bad</script>' },
    ] });
    expect(html).toContain('data-model="owner/Exact:Route"');
    expect(html).toContain('data-model="auto"');
    expect(html).toContain('FREE');
    for (const value of ['&lt;provider&gt;', '&lt;owner&gt;', '&lt;tools&gt;', '&lt;script&gt;bad&lt;/script&gt;']) expect(html).toContain(value);
    expect(html).not.toContain('<script>bad</script>');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('id="settings-model-search"');
  });

  it('keeps direct AUTO visible on the Free tab while paid/unknown models require opt-ins', () => {
    const state = { ...gateway(), preset: 'openrouter', modelTab: 'free', models: [
      { id: 'auto', accessTier: 'unknown', isFree: false },
      { id: 'paid', accessTier: 'paid', isFree: false },
      { id: 'unknown', accessTier: 'unknown', isFree: false },
      { id: 'free', accessTier: 'free_trial', isFree: true },
    ] };
    const html = settingsPaneHtml(state);
    expect(html).toContain('data-model="auto"');
    expect(html).toContain('AUTO · Free-first');
    expect(html).not.toContain('value="paid"');
    expect(html).not.toContain('value="unknown"');
    const allowed = settingsPaneHtml({ ...state, modelTab: 'all', allowPaid: true, allowUnknown: true });
    expect(allowed).toContain('data-model="paid"');
    expect(allowed).toContain('data-model="unknown"');
  });

  it.each(['apiKey', 'token', 'authorizationCode', 'credentialReference'])('rejects %s in webview forms, even when empty', (field) => {
    expect(parseSettingsForm({ preset: 'moderado-cloud', [field]: '' }).ok).toBe(false);
  });

  it('validates the login method and Gateway URL at the form boundary', () => {
    expect(parseSettingsForm({ preset: 'moderado-cloud', loginMethod: 'invalid' }).ok).toBe(false);
    expect(parseSettingsForm({ preset: 'moderado-cloud', loginMethod: 4 }).ok).toBe(false);
    expect(parseSettingsForm({ preset: 'moderado-cloud', baseUrl: 'http://remote.example/v1' }).ok).toBe(false);
    expect(parseSettingsForm({ preset: 'moderado-cloud', baseUrl: 'https://user:key@example.com/v1' }).ok).toBe(false);
    const parsed = parseSettingsForm({ preset: 'moderado-cloud', loginMethod: 'public', baseUrl: 'http://127.0.0.1:4788/v1', modelId: 'owner/Exact:Route' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toMatchObject({ loginMethod: 'public', modelId: 'owner/Exact:Route' });
  });
});

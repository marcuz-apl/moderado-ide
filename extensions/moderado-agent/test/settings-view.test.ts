import { describe, expect, it } from 'vitest';
import { emptySettings, parseSettingsForm, settingsPaneHtml, settingsSnapshot } from '../src/settings-view.js';
import { buildProviderChoices } from '../src/provider-setup.js';

const gateway = () => ({ ...emptySettings(), open: true, preset: 'moderado-cloud',
  providers: buildProviderChoices(), baseUrl: 'http://127.0.0.1:4788/v1' });

describe('Gateway and provider Settings boundary', () => {
  it('keeps a large model inventory inside selects with only selected metadata outside', () => {
    const models = Array.from({ length: 200 }, (_, index) => ({
      id: `model-${index}`, accessTier: 'free_trial', isFree: true,
      dataNote: `Unique detail ${index}`,
    }));
    const html = settingsPaneHtml({ ...gateway(), models, defaultModel: 'model-17' });
    expect(html).toContain('id="settings-model-select"');
    expect(html).toContain('id="settings-model" class="sr-only"');
    expect(html.match(/<option value="model-/g)).toHaveLength(400);
    expect(html).toContain('Unique detail 17');
    expect(html).not.toContain('Unique detail 18');
    expect(html).not.toContain('data-model=');
    expect(html).not.toContain('settings-model-search');
  });

  it('offers the Gateway login choices and an editable loopback/HTTPS endpoint', () => {
    const html = settingsPaneHtml(gateway());
    expect(html).toContain('id="settings-login-method"');
    for (const method of ['public', 'browser', 'manual']) expect(html).toContain(`value="${method}"`);
    expect(html).toContain('id="settings-base-url"');
    expect(html).toContain('http://127.0.0.1:4788/v1');
    expect(html).not.toContain('local runtime needs no API key');
    expect(html).toContain('Public access');
  });

  it('offers a masked write-only key field without returning stored credentials', () => {
    const state = { ...gateway(), loginMethod: 'manual' as const, apiKeyStored: true };
    const html = settingsPaneHtml(state);
    expect(html).toContain('id="settings-api-key"');
    expect(html).toContain('Key stored · paste to replace');
    expect(html).toContain('Credential stored');
    expect(html).toContain('type="password"');
    expect(html).toContain('value=""');
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
    expect(html).toContain('<option value="owner/Exact:Route" selected>');
    expect(html).toContain('<option value="auto"');
    expect(html).toContain('★ owner/Exact:Route</option>');
    expect(html).not.toContain('free_trial');
    for (const value of ['&lt;provider&gt;', '&lt;owner&gt;', '&lt;tools&gt;', '&lt;script&gt;bad&lt;/script&gt;']) expect(html).toContain(value);
    expect(html).not.toContain('<script>bad</script>');
    expect(html).toContain('id="settings-model-select"');
    expect(html).not.toContain('settings-model-search');
    expect(html).not.toContain('class="model-card');
  });

  it('preserves model IDs ending in :free without adding a free trial suffix', () => {
    const html = settingsPaneHtml({ ...gateway(), models: [
      { id: 'company/model-ver-flash:free', accessTier: 'free_trial', isFree: true },
      { id: 'company/other-model', accessTier: 'free_trial', isFree: true },
    ] });
    expect(html).toContain('★ company/model-ver-flash:free</option>');
    expect(html).not.toContain('free_trial');
    expect(html).toContain('★ company/other-model</option>');
  });

  it('keeps the free_trial classification out of the model name', () => {
    const html = settingsPaneHtml({ ...gateway(), models: [
      { id: 'deepseek-ai/deepseek-v4.1-flash', accessTier: 'free_trial', isFree: true },
    ] });
    expect(html).toContain('★ deepseek-ai/deepseek-v4.1-flash</option>');
    expect(html).not.toContain('free_trial');
  });

  it('keeps direct AUTO visible on the Free tab while paid models move to the Paid tab', () => {
    const state = { ...gateway(), preset: 'openrouter', modelTab: 'free', models: [
      { id: 'auto', accessTier: 'unknown', isFree: false },
      { id: 'paid', accessTier: 'paid', isFree: false },
      { id: 'unknown', accessTier: 'unknown', isFree: false },
      { id: 'free', accessTier: 'free_trial', isFree: true },
    ] };
    const html = settingsPaneHtml(state);
    expect(html).toContain('<option value="auto"');
    expect(html).toContain('AUTO · Free-first');
    expect(html).not.toContain('value="paid"');
    expect(html).not.toContain('value="unknown"');
    const paid = settingsPaneHtml({ ...state, modelTab: 'paid', allowPaid: true, allowUnknown: true });
    expect(paid).toContain('<option value="paid"');
    expect(paid).toContain('<option value="unknown"');
    expect(paid).not.toContain('<option value="free"');
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

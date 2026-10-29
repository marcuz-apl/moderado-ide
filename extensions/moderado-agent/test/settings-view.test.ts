import { describe, expect, it } from 'vitest';
import { emptySettings, parseSettingsForm, settingsPaneHtml, settingsSnapshot } from '../src/settings-view.js';
import { buildProviderChoices } from '../src/provider-setup.js';

const gateway = () => ({ ...emptySettings(), open: true, preset: 'moderado-cloud',
  providers: buildProviderChoices(), baseUrl: 'http://127.0.0.1:4788/v1' });

describe('Gateway and provider Settings boundary', () => {
  it('presents Gateway access in the unified provider connection flow', () => {
    const choices = buildProviderChoices();
    const gatewayChoice = choices.find((choice) => choice.value === 'moderado-cloud');
    expect(gatewayChoice?.label).toBe('Moderado');
    expect(gatewayChoice?.tag).toBeUndefined();
    expect(gatewayChoice?.description).toContain('free default models');

    const html = settingsPaneHtml(gateway());
    expect(html).toContain('id="settings-provider"');
    expect(html).toContain('value="moderado-cloud"');
    expect(html).toContain('>Moderado</option>');
    // One editable key box replaces the access dropdown, so a stored key can
    // never be dropped by a stale "public" choice.
    expect(html).toContain('id="settings-api-key"');
    expect(html).not.toContain('id="settings-login-method"');
    expect(html).toContain('Sign in with browser');
  });

  it('hides the duplicate Moderado custom connection while keeping the built-in Moderado choice', () => {
    const html = settingsPaneHtml({ ...gateway(), providers: buildProviderChoices({ custom: [
      { id: 'moderado-custom', name: 'Moderado', baseUrl: 'https://custom.example/v1', defaultModel: 'auto' },
    ] } as any) });
    expect(html).toContain('>Moderado</option>');
    expect(html).not.toContain('Moderado - Custom');
  });

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

  it('offers the Gateway key box and an editable loopback/HTTPS endpoint', () => {
    const html = settingsPaneHtml(gateway());
    expect(html).toContain('id="settings-api-key"');
    expect(html).toContain('id="settings-base-url"');
    expect(html).toContain('http://127.0.0.1:4788/v1');
    expect(html).not.toContain('local runtime needs no API key');
    expect(html).toContain('The free default models need no key or sign-in');
  });

  it('labels a keyed Gateway AUTO without describing its routing internals', () => {
    // A keyed session keeps the plain label: the Gateway may route it anywhere.
    const html = settingsPaneHtml({ ...gateway(), apiKeyStored: true, defaultModel: 'auto', models: [{ id: 'auto', accessTier: 'unknown', isFree: false }] });
    expect(html).toContain('>AUTO</option>');
    expect(html).not.toContain('AUTO · Gateway routing');
    expect(html).toContain('may select a free or paid route');
  });

  it('describes a keyless Gateway AUTO as the free defaults', () => {
    // Without a key, `auto` is not full routing: the request omits the model
    // and the Gateway answers with its pinned free defaults.
    const html = settingsPaneHtml({ ...gateway(), apiKeyStored: false, defaultModel: 'auto', models: [{ id: 'auto', accessTier: 'unknown', isFree: false }] });
    expect(html).toContain('AUTO · Gateway free defaults');
    expect(html).toContain('The Gateway routes to its free default models.');
    expect(html).not.toContain('may select a free or paid route');
  });

  it('lists the Gateway pinned defaults by their stealth name without a key', () => {
    // The Gateway advertises a stealth route as paid and still serves it for
    // nothing; section:'default' is what makes it selectable without a key.
    const html = settingsPaneHtml({ ...gateway(), apiKeyStored: false, allowPaid: false, defaultModel: 'stealth one', models: [
      { id: 'auto', accessTier: 'unknown', isFree: false },
      { id: 'stealth one', name: 'Stealth One', accessTier: 'paid', isFree: false, section: 'default', capabilities: ['tools'] },
      { id: 'stealth two', accessTier: 'paid', isFree: false, section: 'default' },
      { id: 'owner/free-route', accessTier: 'free_trial', isFree: true },
      { id: 'owner/paid-route', accessTier: 'paid', isFree: false },
    ] });
    expect(html).toContain('<option value="stealth one" selected>★ Stealth One</option>');
    // No display name falls back to the id.
    expect(html).toContain('<option value="stealth two">★ stealth two</option>');
    // A free route still needs an account, and a paid route is not offered.
    expect(html).not.toContain('value="owner/paid-route"');
    expect(html).toContain('A Gateway default model. No key or sign-in is required.');
    // The selected line uses the same name as the option, not the raw route id.
    expect(html).toContain('Selected model: <strong>Stealth One</strong>');
    // Two pinned defaults plus the free route count as free for this provider.
    expect(html).toContain('<span>3 free</span>');
  });

  it('offers a masked write-only key field without returning stored credentials', () => {
    const state = { ...gateway(), loginMethod: 'manual' as const, apiKeyStored: true };
    const html = settingsPaneHtml(state);
    expect(html).toContain('id="settings-api-key"');
    expect(html).toContain('Key stored · paste to replace');
    expect(html).toContain('A key is stored for this provider');
    expect(html).toContain('type="password"');
    expect(html).toContain('value=""');
    expect(JSON.stringify(settingsSnapshot(state))).not.toContain('moderado/provider/');
  });

  it('offers one editable API key box that saves and masks a pasted key', () => {
    const html = settingsPaneHtml({ ...gateway(), loginMethod: 'manual' as const, apiKeyStored: false });
    // A single editable box, masked, that the user types or pastes into.
    expect(html).toContain('id="settings-api-key"');
    expect(html).toContain('type="password"');
    expect(html).toContain('value=""');
    expect(html).toContain('Paste API key');
    // The box is the way to supply a key, so it must stay enabled.
    expect(html).not.toMatch(/id="settings-api-key"[^>]*disabled/);
  });

  it('keeps the API key box editable and masked while a key is stored', () => {
    const html = settingsPaneHtml({ ...gateway(), loginMethod: 'manual' as const, apiKeyStored: true });
    expect(html).toContain('id="settings-api-key"');
    expect(html).toContain('type="password"');
    expect(html).not.toMatch(/id="settings-api-key"[^>]*disabled/);
    // The stored key is never rendered back into the pane.
    expect(html).not.toMatch(/id="settings-api-key"[^>]*value="[^"]+"/);
  });

  it('offers the pinned defaults to a keyless session and keeps the key box optional', () => {
    const html = settingsPaneHtml({ ...gateway(), apiKeyStored: false,
      models: [{ id: 'owner/free-route', accessTier: 'free_trial', isFree: true }] });
    expect(html).toContain('The free default models need no key or sign-in');
    // The box stays available for the account routes.
    expect(html).toContain('Paste API key');
  });

  it('offers browser sign-in without accepting a token in the pane', () => {
    expect(settingsPaneHtml({ ...gateway(), loginMethod: 'browser' })).toContain('id="settings-browser-login"');
  });

  it('offers an explicit account-free action for the Gateway', () => {
    // The key box cannot express "no key": an empty box on an ordinary save
    // keeps whatever the profile records. Choosing the free defaults has to be
    // a deliberate action, the way the CLI's sign-in menu offers it.
    const html = settingsPaneHtml({ ...gateway(), apiKeyStored: false });
    expect(html).toContain('id="settings-use-free"');
    expect(html).toContain('Use free models without an account');
    // The action is Gateway-only: a BYOK provider has no account-free tier.
    expect(settingsPaneHtml({ ...emptySettings(), open: true, preset: 'nvidia-nim', providers: buildProviderChoices() }))
      .not.toContain('id="settings-use-free"');
    // A stored key is not silently dropped: the action is not offered, matching
    // the CLI, which skips the sign-in menu when a reusable key exists.
    expect(settingsPaneHtml({ ...gateway(), apiKeyStored: true })).not.toContain('id="settings-use-free"');
  });

  it('offers no Paid tab for the Gateway, which handles free routes only', () => {
    const html = settingsPaneHtml({ ...gateway(), allowPaid: true, models: [
      { id: 'owner/free-route', accessTier: 'free_trial', isFree: true },
      { id: 'owner/paid-route', accessTier: 'paid', isFree: false },
    ] });
    expect(html).not.toContain('data-tab="paid"');
    expect(html).not.toContain('>Paid</button>');
    expect(html).toContain('data-tab="free"');
    // A paid route is not offered and cannot be counted as listed.
    expect(html).not.toContain('owner/paid-route');
    expect(html).toContain('owner/free-route');
  });

  it('points the Gateway key note at browser sign-in for the account routes', () => {
    const html = settingsPaneHtml({ ...gateway(), apiKeyStored: false });
    expect(html).toContain('The free default models need no key or sign-in. Sign in with browser to use the account routes.');
  });

  it('omits the provider and owner rows under the selected model', () => {
    const html = settingsPaneHtml({ ...gateway(), defaultModel: 'owner/Exact:Route', models: [
      { id: 'owner/Exact:Route', accessTier: 'free_trial', isFree: true, provider: 'owner',
        ownedBy: 'someone', capabilities: ['tools'] },
    ] });
    expect(html).not.toContain('Provider:');
    expect(html).not.toContain('Owner:');
    // The remaining route metadata is still shown.
    expect(html).toContain('Capabilities: tools');
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
    // The provider and owner rows are gone, so their values are not rendered.
    expect(html).not.toContain('&lt;provider&gt;');
    expect(html).not.toContain('&lt;owner&gt;');
    for (const value of ['&lt;tools&gt;', '&lt;script&gt;bad&lt;/script&gt;']) expect(html).toContain(value);
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

  it('hides a literal Free_trial tail in the label but preserves the provider model ID', () => {
    const html = settingsPaneHtml({ ...gateway(), defaultModel: 'router/model -- Free_trial', models: [
      { id: 'router/model -- Free_trial', accessTier: 'free_trial', isFree: true },
    ] });
    expect(html).toContain('<option value="router/model -- Free_trial" selected>★ router/model</option>');
    expect(html).toContain('Selected model: <strong>router/model</strong>');
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

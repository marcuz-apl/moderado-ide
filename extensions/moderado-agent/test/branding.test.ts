import { describe, expect, it } from 'vitest';
import { emptySettings, settingsPaneHtml } from '../src/settings-view.js';
import { buildProviderChoices } from '../src/provider-setup.js';
import { DESKTOP_PROVIDER_PRESETS, MODERADO_BASE_URLS } from '../src/provider-catalog.js';
import { DesktopOpenAIAdapter } from '../src/provider-transport.js';
import { chatHtml } from '../src/chat-view.js';
import { credentialReference } from '../src/credentials.js';

// The product is called Moderado. The retired names were "Moderado Cloud" and
// "Moderado Gateway"; they must not come back in a surface the user reads.
const RETIRED_NAMES = ['Moderado Cloud', 'Moderado Gateway'];

const gatewayPane = () => settingsPaneHtml({
  ...emptySettings(), open: true, preset: 'moderado-cloud',
  providers: buildProviderChoices(), baseUrl: MODERADO_BASE_URLS.production,
});

const chatSurface = () => chatHtml({
  transcript: [], running: false, pendingApproval: null, planMode: false,
  activeProviderName: 'Moderado', activeModelId: 'auto',
}, 'preview');

describe('Moderado product naming', () => {
  it('lists the built-in provider as Moderado', () => {
    const choice = buildProviderChoices().find((item) => item.value === 'moderado-cloud');
    expect(choice?.label).toBe('Moderado');
    expect(choice?.tag).toBeUndefined();
    for (const preset of DESKTOP_PROVIDER_PRESETS) {
      expect(`${preset.label} ${preset.description}`).not.toMatch(/Moderado (Cloud|Gateway)/);
    }
  });

  it('keeps the retired names out of the Settings pane', () => {
    const html = gatewayPane();
    for (const name of RETIRED_NAMES) expect(html).not.toContain(name);
    expect(html).toContain('Moderado');
  });

  it('keeps the retired names out of the chat surface', () => {
    for (const name of RETIRED_NAMES) expect(chatSurface()).not.toContain(name);
  });

  it('keeps the retired names out of the Gateway rejection messages', async () => {
    for (const apiKey of [undefined, 'mrd_rejected']) {
      const adapter = new DesktopOpenAIAdapter({
        id: 'moderado-cloud', name: 'Moderado', baseUrl: 'https://example.test/v1', apiKey,
        fetchImpl: async () => new Response('private-body', { status: 401 }),
      });
      const message = await adapter.streamChat({ modelId: 'owner/route', messages: [{ role: 'user', content: 'hi' }] })
        .next().then(() => '', (error: Error) => error.message);
      for (const name of RETIRED_NAMES) expect(message).not.toContain(name);
      expect(message).toContain('Moderado');
    }
  });

  it('keeps the shared profile identifiers the CLI reads', () => {
    // These are contract, not branding: the CLI resolves this connection id
    // and this Credential Manager target from ~/.moderado/config.json.
    expect(credentialReference('moderado-cloud')).toBe('moderado/provider/moderado-cloud');
    expect(DESKTOP_PROVIDER_PRESETS.some((preset) => preset.id === 'moderado-cloud')).toBe(true);
  });
});

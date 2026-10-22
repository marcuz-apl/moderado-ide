import { describe, expect, it } from 'vitest';
import { emptySettings, settingsPaneHtml } from '../src/settings-view.js';
import { buildProviderChoices } from '../src/provider-setup.js';
import { DESKTOP_PROVIDER_PRESETS, MODERADO_BASE_URLS } from '../src/provider-catalog.js';
import { DesktopOpenAIAdapter } from '../src/provider-transport.js';
import { chatHtml } from '../src/chat-view.js';
import { credentialReference } from '../src/credentials.js';

// "Moderado Cloud" was the old product name. It must not come back in a
// surface the user reads. "Moderado Gateway" is the gateway service name and
// is deliberately left alone.
const RETIRED_NAME = 'Moderado Cloud';

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
  });

  it('keeps the retired product name out of the Settings pane', () => {
    const html = gatewayPane();
    expect(html).not.toContain(RETIRED_NAME);
    expect(html).toContain('Moderado');
  });

  it('keeps the retired product name out of the chat surface', () => {
    expect(chatSurface()).not.toContain(RETIRED_NAME);
  });

  it('keeps the retired product name out of the Gateway rejection messages', async () => {
    for (const apiKey of [undefined, 'mrd_rejected']) {
      const adapter = new DesktopOpenAIAdapter({
        id: 'moderado-cloud', name: 'Moderado', baseUrl: 'https://example.test/v1', apiKey,
        fetchImpl: async () => new Response('private-body', { status: 401 }),
      });
      const message = await adapter.streamChat({ modelId: 'owner/route', messages: [{ role: 'user', content: 'hi' }] })
        .next().then(() => '', (error: Error) => error.message);
      expect(message).not.toContain(RETIRED_NAME);
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

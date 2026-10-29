/** Desktop-owned metadata adapted from the CLI provider connection flow. */
export interface DesktopProviderPreset {
  id: string;
  label: string;
  description: string;
  kind: 'nvidia-nim' | 'openai-compatible';
  baseUrl: string;
  requiresApiKey: boolean;
  defaultModel?: string;
  freeCatalog?: boolean;
  freeIdSuffixes?: readonly string[];
  local?: boolean;
}

export const MODERADO_BASE_URLS = {
  development: 'http://127.0.0.1:4788/v1',
  production: 'https://modr.alfazen.org/v1',
} as const;

/**
 * The built-in deployment a Gateway URL belongs to, if any.
 *
 * The CLI records this choice as `gatewayEnvironment` on the shared profile and
 * lets it override its automatic probe. Writing the marker when the IDE's
 * Dev/Prod toggle picks a built-in URL keeps both applications pointed at the
 * same Gateway; a custom URL returns undefined, and the CLI honours that URL
 * directly.
 */
export function moderadoGatewayEnvironmentFor(url: string | undefined): 'production' | 'development' | undefined {
  const normalized = url?.trim().replace(/\/+$/, '');
  if (!normalized) return undefined;
  if (normalized === MODERADO_BASE_URLS.development) return 'development';
  if (normalized === MODERADO_BASE_URLS.production) return 'production';
  return undefined;
}

export const DESKTOP_PROVIDER_PRESETS: readonly DesktopProviderPreset[] = [
  { id: 'moderado-cloud', label: 'Moderado', description: 'Use the free default models without a key, or sign in for the account routes.', kind: 'openai-compatible', baseUrl: MODERADO_BASE_URLS.production, requiresApiKey: false, defaultModel: 'auto' },
  { id: 'nvidia-nim', label: 'NVIDIA NIM', description: 'Free-first routing across NVIDIA hosted models.', kind: 'nvidia-nim', baseUrl: 'https://integrate.api.nvidia.com/v1', requiresApiKey: true, freeCatalog: true },
  { id: 'openrouter', label: 'OpenRouter', description: 'One key for hosted models and free-tier models.', kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', requiresApiKey: true },
  { id: 'ollama', label: 'Ollama', description: 'Models served locally by Ollama.', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1', requiresApiKey: false, local: true },
  { id: 'lm-studio', label: 'LM Studio', description: 'Models served by the LM Studio local server.', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:1234/v1', requiresApiKey: false, local: true },
  { id: 'openai-compatible', label: 'Other OpenAI-compatible provider', description: 'Connect any compatible endpoint with its base URL, key, and model ID.', kind: 'openai-compatible', baseUrl: '', requiresApiKey: true },
];

/** Explicit metered or malformed prices override all provider declarations. */
export function isDesktopFreeModel(entry: { id: string; pricing?: unknown }, providerId: string): boolean {
  if (entry.pricing !== undefined) {
    if (!entry.pricing || typeof entry.pricing !== 'object' || Array.isArray(entry.pricing)) return false;
    const prices = entry.pricing as Record<string, unknown>;
    if (Object.values(prices).some((price) => typeof price !== 'string' || price.trim() === '' || !Number.isFinite(Number(price)) || Number(price) !== 0)) return false;
    if (prices.prompt !== undefined && prices.completion !== undefined) return true;
  }
  const preset = DESKTOP_PROVIDER_PRESETS.find((item) => item.id === providerId);
  if (preset?.freeCatalog || preset?.local) return true;
  const modelId = entry.id.toLowerCase();
  return (preset?.freeIdSuffixes ?? []).some((suffix) =>
    new RegExp(`(?:^|[/:_-])${escapeRegExp(suffix.toLowerCase())}$`).test(modelId),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

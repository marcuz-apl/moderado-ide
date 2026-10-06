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

export const DESKTOP_PROVIDER_PRESETS: readonly DesktopProviderPreset[] = [
  { id: 'moderado-cloud', label: 'Moderado Gateway', description: 'Free models with Gateway AUTO or a selected route.', kind: 'openai-compatible', baseUrl: 'https://mod.alfazen.org/v1', requiresApiKey: false, defaultModel: 'auto', freeCatalog: true },
  { id: 'nvidia-nim', label: 'NVIDIA NIM', description: 'Free-first routing across NVIDIA hosted models.', kind: 'nvidia-nim', baseUrl: 'https://integrate.api.nvidia.com/v1', requiresApiKey: true, freeCatalog: true },
  { id: 'openrouter', label: 'OpenRouter', description: 'One key for hosted models and free-tier models.', kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', requiresApiKey: true },
  { id: 'agnes-ai', label: 'Agnes AI', description: 'Agnes Flash and Code endpoints.', kind: 'openai-compatible', baseUrl: 'https://apihub.agnes-ai.com/v1', requiresApiKey: true, freeCatalog: true },
  { id: 'orcarouter', label: 'OrcaRouter', description: 'Adaptive model routing.', kind: 'openai-compatible', baseUrl: 'https://api.orcarouter.ai/v1', requiresApiKey: true, defaultModel: 'orcarouter/free', freeIdSuffixes: ['free'] },
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
  const segment = entry.id.split(/[/:]/).at(-1);
  return (preset?.freeIdSuffixes ?? []).includes(segment ?? '');
}

import type { ConnectProvidersConfig as PinnedConnectProvidersConfig, ProviderConnectionKind } from '@moderado/providers';
import { DESKTOP_PROVIDER_PRESETS } from './provider-catalog.js';

/** Existing profile shape with Desktop's additional Gateway preset id. */
export interface ConnectProvidersConfig extends Omit<PinnedConnectProvidersConfig, 'enabled'> {
  enabled?: string[];
}

/**
 * Desktop provider setup retains CLI-readable connection kinds, required base
 * URLs, and stable provider ids used by credentials and provider cost policy.
 */

export type ProviderChoiceValue = string;

export interface ProviderChoice {
  value: ProviderChoiceValue;
  label: string;
  description: string;
  tag?: string;
  displayName?: string;
  baseUrl?: string;
  defaultModel?: string;
  kind: ProviderConnectionKind;
  /** False for local runtimes and public Gateway access. */
  requiresApiKey: boolean;
}

export interface ProviderConnectionRecord {
  id: string;
  displayName: string;
  kind: ProviderConnectionKind;
  baseUrl: string;
  credentialReference?: string;
  apiKey?: string;
  defaultModel?: string;
}

export interface ConnectionInput {
  preset: ProviderChoiceValue;
  apiKey?: string;
  baseUrl?: string;
  displayName?: string;
  defaultModel?: string;
}

/** Mirrors the CLI's slug rule in provider_connect.ts `connectionId`. */
export function connectionIdFor(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'provider';
}

/**
 * The provider picker, in Desktop's preset order.
 *
 * `connectProviders` from the shared profile is honoured: `enabled` filters the
 * built-ins and `custom` appends user endpoints, so a CLI user sees the same
 * list in Desktop.
 */
export function buildProviderChoices(config?: ConnectProvidersConfig): ProviderChoice[] {
  const enabled = config?.enabled;
  const builtIns: ProviderChoice[] = DESKTOP_PROVIDER_PRESETS
    .filter((preset) => enabled === undefined || enabled.includes(preset.id))
    .map((preset) => ({
      value: preset.id,
      label: preset.label,
      description: preset.description,
      kind: preset.kind,
      baseUrl: preset.baseUrl,
      defaultModel: preset.defaultModel,
      requiresApiKey: preset.requiresApiKey,
      tag: preset.freeCatalog ? 'Free Models' : preset.local ? 'Local' : undefined,
    }));

  const custom: ProviderChoice[] = (config?.custom ?? []).map((provider) => ({
    value: `custom:${provider.id}`,
    label: provider.name,
    description: 'Connect this custom OpenAI-compatible endpoint.',
    tag: 'Custom',
    displayName: provider.name,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    kind: 'openai-compatible',
    requiresApiKey: true,
  }));

  return [...builtIns, ...custom];
}

/** The preset behind a picker value, or undefined for a removed custom entry. */
function findChoice(value: string, config?: ConnectProvidersConfig): ProviderChoice | undefined {
  if (value.startsWith('custom:')) {
    const id = value.slice('custom:'.length);
    const provider = config?.custom?.find((item) => item.id === id);
    if (!provider) return undefined;
    return {
      value,
      label: provider.name,
      description: 'Connect this custom OpenAI-compatible endpoint.',
      displayName: provider.name,
      baseUrl: provider.baseUrl,
      defaultModel: provider.defaultModel,
      kind: 'openai-compatible',
      requiresApiKey: true,
    };
  }
  return buildProviderChoices(config).find((choice) => choice.value === value);
}

function isLoopback(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
}

/** Validate endpoints for both discovery and inference before attaching a key. */
export function validateProviderBaseUrl(rawBaseUrl: string): string {
  let url: URL;
  try { url = new URL(rawBaseUrl); }
  catch { throw new Error('Enter a valid provider base URL.'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new Error('Provider base URLs must use HTTPS (HTTP is allowed only for localhost).');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Provider base URLs cannot contain credentials, a query, or a fragment.');
  }
  return url.toString().replace(/\/+$/, '');
}

// --- Listing models before a connection is saved -------------------------------

/**
 * The connection id a picker value maps to.
 *
 * It is the Credential Manager target and the key `freeModelPolicyFor` resolves
 * against, so it must match what `buildProviderConnection` would produce.
 */
export function presetConnectionId(preset: string): string {
  if (preset.startsWith('custom:')) return preset.slice('custom:'.length);
  if (preset === 'openai-compatible') return connectionIdFor('Other OpenAI-compatible provider');
  return preset;
}

export interface DiscoveryInput {
  preset: string;
  apiKey?: string;
  /** The endpoint already recorded in the profile, if any. */
  storedBaseUrl?: string;
  displayName?: string;
  defaultModel?: string;
}

/**
 * A connection good enough to *list* models, with no key requirement.
 *
 * Deliberately more lenient than `buildProviderConnection`: OpenRouter and other
 * providers serve their catalog without authentication, and the CLI lists the
 * free models as its first step of the connect flow. Requiring a key here would
 * show an empty list until the user had already saved a connection they cannot
 * yet verify.
 */
export function buildDiscoveryConnection(
  input: DiscoveryInput,
  config?: ConnectProvidersConfig,
): ProviderConnectionRecord {
  const choice = findChoice(input.preset, config);
  if (!choice) throw new Error('That provider is no longer available in the shared profile.');

  const apiKey = input.apiKey?.trim() || undefined;
  const rawBaseUrl = input.storedBaseUrl?.trim() || choice.baseUrl;
  if (!rawBaseUrl) throw new Error('A base URL is required before models can be listed.');
  const baseUrl = validateProviderBaseUrl(rawBaseUrl);

  if (choice.kind === 'nvidia-nim') {
    return {
      id: 'nvidia-nim',
      displayName: choice.label,
      kind: 'nvidia-nim',
      baseUrl,
      ...(apiKey ? { apiKey } : {}),
    };
  }

  const displayName = input.displayName?.trim() || choice.displayName || choice.label;
  return {
    id: choice.value === 'openai-compatible' ? connectionIdFor(displayName) : presetConnectionId(choice.value),
    displayName,
    kind: 'openai-compatible',
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    ...(input.defaultModel?.trim() || choice.defaultModel
      ? { defaultModel: (input.defaultModel?.trim() || choice.defaultModel) as string }
      : {}),
  };
}

/**
 * Free models first, stable within each group.
 *
 * The engine's rule is free-first, so the list the user picks from is ordered the
 * same way; otherwise the cheapest option sits below a wall of paid entries.
 */
export function sortFreeFirst<T extends { isFree: boolean }>(models: T[]): T[] {
  return [...models].sort((a, b) => Number(b.isFree) - Number(a.isFree));
}

/**
 * The model to preselect: an explicit choice if it survived, otherwise the first
 * free one, otherwise the first listed.
 */
export function pickDefaultModel<T extends { id: string }>(models: T[], current: string): string {
  if (current && models.some((model) => model.id === current)) return current;
  return models[0]?.id ?? '';
}

/**
 * Validates and normalizes a connection using the shared CLI-readable shape.
 */
export function buildProviderConnection(
  input: ConnectionInput,
  config?: ConnectProvidersConfig,
): ProviderConnectionRecord {
  const choice = findChoice(input.preset, config);
  if (!choice) throw new Error('That provider is no longer available in the shared profile.');

  const apiKey = input.apiKey?.trim();

  if (choice.requiresApiKey && !apiKey) {
    if (choice.kind === 'nvidia-nim') throw new Error('An NVIDIA API key is required.');
    throw new Error('An API key is required.');
  }

  if (choice.kind === 'nvidia-nim') {
    // Keep the fixed id/kind so the free-tier policy still resolves after edits.
    return {
      id: 'nvidia-nim',
      displayName: choice.label,
      kind: 'nvidia-nim',
      baseUrl: validateProviderBaseUrl(input.baseUrl?.trim() || choice.baseUrl || ''),
      ...(apiKey ? { apiKey } : {}),
    };
  }

  const displayName = input.displayName?.trim() || choice.displayName || choice.label;
  const id = choice.value.startsWith('custom:')
    ? choice.value.slice('custom:'.length)
    : choice.value === 'openai-compatible' ? connectionIdFor(displayName) : choice.value;
  const defaultModel = input.defaultModel?.trim() || choice.defaultModel;
  const rawBaseUrl = input.baseUrl?.trim() || choice.baseUrl;

  if (!rawBaseUrl) throw new Error('A base URL is required.');
  // The CLI requires a default model for a plain OpenAI-compatible endpoint;
  // a preset may supply its own.
  if (!defaultModel) throw new Error('A default model is required for an OpenAI-compatible provider.');

  return {
    id,
    displayName,
    kind: 'openai-compatible',
    baseUrl: validateProviderBaseUrl(rawBaseUrl),
    ...(apiKey ? { apiKey } : {}),
    defaultModel,
  };
}

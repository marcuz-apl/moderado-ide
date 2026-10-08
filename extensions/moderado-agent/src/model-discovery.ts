import type { SettingsModel } from './settings-view.js';

/** A model as the engine reports it, before it is narrowed for the pane. */
export interface DiscoveredModelLike {
  id: string;
  accessTier: string;
  toolSupport: string;
  isFree: boolean;
  provider?: string;
  ownedBy?: string;
  capabilities?: string[];
  dataNote?: string;
}

export interface DiscoveryResult {
  models: SettingsModel[];
  /** Always a settled outcome; never an in-flight placeholder. */
  status: string;
}

/**
 * Model discovery for the settings pane.
 *
 * WHY THIS EXISTS. The pane used to set its own "Loading models…" placeholder and
 * then re-assign that same placeholder on success, so the UI stayed on
 * "Loading models…" forever even when the list had arrived. It also had no
 * bound: a provider that accepted the connection and never answered left the
 * panel spinning indefinitely.
 *
 * This returns the discovered inventory and any failure reason, so the pane
 * always leaves the loading state without a redundant success count.
 */
export async function discoverModelOptions(
  discover: () => Promise<DiscoveredModelLike[]>,
  timeoutMs: number,
  sensitiveValues: readonly string[] = [],
): Promise<DiscoveryResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  try {
    const outcome = await Promise.race([
      discover().then((models) => ({ models })).catch((error: unknown) => ({ error })),
      timeout,
    ]);

    if (outcome === 'timeout') {
      return {
        models: [],
        status: `The provider did not answer; model discovery timed out after ${Math.round(timeoutMs / 1000)}s.`,
      };
    }
    if ('error' in outcome) {
      return { models: [], status: `Could not list models: ${safeMessage(outcome.error, sensitiveValues)}` };
    }
    const models = outcome.models.map((model) => ({
      id: model.id,
      accessTier: model.accessTier,
      isFree: model.isFree,
      ...(model.provider !== undefined ? { provider: model.provider } : {}),
      ...(model.ownedBy !== undefined ? { ownedBy: model.ownedBy } : {}),
      ...(model.capabilities !== undefined ? { capabilities: [...model.capabilities] } : {}),
      ...(model.dataNote !== undefined ? { dataNote: model.dataNote } : {}),
    }));
    if (models.some(model => Object.values(model).flat().some(value => typeof value === 'string'
      && sensitiveValues.some(secret => secret && value.includes(secret))))) {
      return { models: [], status: 'The provider catalog contained credential data and was rejected.' };
    }
    return {
      models,
      status: models.length
        ? ''
        : 'The provider returned no models.',
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * A provider error can echo the request, and a request carries the key.
 *
 * Anything that looks like a credential is replaced before the message reaches
 * the UI or the output channel.
 */
export function safeMessage(error: unknown, sensitiveValues: readonly string[] = []): string {
  let text = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  for (const secret of sensitiveValues) if (secret) text = text.replaceAll(secret, '[redacted]');
  return text
    .replace(/\b(?:sk-|mrd_)[A-Za-z0-9_-]{4,}/g, '[redacted]')
    .replace(/\b(Bearer\s+|api[-_ ]?key[=: ]+)\S+/gi, '$1[redacted]');
}

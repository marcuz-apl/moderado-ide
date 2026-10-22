/**
 * A short-lived cache of the model catalog each provider endpoint returned.
 *
 * Switching provider in the settings pane used to fetch the whole catalog
 * again every time, so the list took as long as the provider took to answer.
 * The cache keeps the last catalog per endpoint for the session: the pane shows
 * it straight away and refreshes it in the background once it has gone stale.
 *
 * The cache lives in the extension host only. It holds public model metadata,
 * never a credential, and it is never written to the shared profile.
 */

/** How long a catalog is served without asking the provider again. */
export const CATALOG_TTL_MS = 5 * 60_000;

/** The most endpoints kept at once, so many custom providers cannot grow it. */
const MAX_ENTRIES = 32;

export interface CatalogEntry<T> {
  /** The catalog as the provider returned it. */
  models: T[];
  /** When it was fetched, in epoch milliseconds. */
  fetchedAt: number;
}

/**
 * The cache key for one endpoint.
 *
 * The base URL is part of it, so another endpoint is another catalog, and the
 * trailing slash and case are ignored, so the same endpoint is one entry.
 */
export function catalogKey(connectionId: string, baseUrl: string): string {
  return `${connectionId}|${baseUrl.replace(/\/+$/, '').toLowerCase()}`;
}

export class CatalogCache<T> {
  readonly #entries = new Map<string, CatalogEntry<T>>();
  readonly #ttlMs: number;

  constructor(ttlMs: number = CATALOG_TTL_MS) {
    this.#ttlMs = ttlMs;
  }

  /** The cached catalog for a key, whatever its age. */
  get(key: string): CatalogEntry<T> | undefined {
    return this.#entries.get(key);
  }

  /** True when the entry is still within its time to live. */
  isFresh(key: string, now: number = Date.now()): boolean {
    const entry = this.#entries.get(key);
    return entry !== undefined && now - entry.fetchedAt < this.#ttlMs;
  }

  /** Remember a catalog, dropping the oldest entry when the cache is full. */
  set(key: string, models: T[], now: number = Date.now()): void {
    this.#entries.delete(key);
    this.#entries.set(key, { models, fetchedAt: now });
    while (this.#entries.size > MAX_ENTRIES) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      this.#entries.delete(oldest.value);
    }
  }

  /** Forget one endpoint, for instance because its credential changed. */
  delete(key: string): void {
    this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }

  get size(): number {
    return this.#entries.size;
  }
}

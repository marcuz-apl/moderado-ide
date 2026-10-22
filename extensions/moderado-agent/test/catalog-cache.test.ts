import { describe, expect, it } from 'vitest';
import { CATALOG_TTL_MS, CatalogCache, catalogKey } from '../src/catalog-cache.js';

describe('catalog cache', () => {
  it('remembers a catalog per endpoint', () => {
    const cache = new CatalogCache<string[]>();
    cache.set('ollama|local', ['a', 'b']);
    expect(cache.get('ollama|local')?.models).toEqual(['a', 'b']);
    expect(cache.get('other|local')).toBeUndefined();
  });

  it('treats the same endpoint as one entry', () => {
    expect(catalogKey('ollama', 'http://127.0.0.1:11434/v1')).toBe(catalogKey('ollama', 'http://127.0.0.1:11434/v1/'));
    expect(catalogKey('ollama', 'http://127.0.0.1:11434/v1')).not.toBe(catalogKey('lm-studio', 'http://127.0.0.1:11434/v1'));
    // Another endpoint is another catalog, even for the same provider.
    expect(catalogKey('ollama', 'http://127.0.0.1:11434/v1')).not.toBe(catalogKey('ollama', 'http://127.0.0.1:9999/v1'));
  });

  it('goes stale after its time to live', () => {
    const cache = new CatalogCache<string[]>(1000);
    cache.set('k', ['a'], 10_000);
    expect(cache.isFresh('k', 10_500)).toBe(true);
    expect(cache.isFresh('k', 11_000)).toBe(false);
    expect(cache.isFresh('missing')).toBe(false);
    // A stale entry is still there to show while it refreshes.
    expect(cache.get('k')?.models).toEqual(['a']);
  });

  it('keeps the catalog for five minutes by default', () => {
    const cache = new CatalogCache<string[]>();
    cache.set('k', ['a'], 0);
    expect(cache.isFresh('k', CATALOG_TTL_MS - 1)).toBe(true);
    expect(cache.isFresh('k', CATALOG_TTL_MS)).toBe(false);
  });

  it('forgets one endpoint and the whole cache', () => {
    const cache = new CatalogCache<string[]>();
    cache.set('a', ['1']);
    cache.set('b', ['2']);
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('does not grow without bound', () => {
    const cache = new CatalogCache<string[]>();
    for (let i = 0; i < 100; i += 1) cache.set(`k${i}`, [`${i}`]);
    expect(cache.size).toBeLessThanOrEqual(32);
    // The most recent entry survives.
    expect(cache.get('k99')?.models).toEqual(['99']);
  });
});

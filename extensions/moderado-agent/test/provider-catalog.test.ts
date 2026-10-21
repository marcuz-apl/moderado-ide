import { describe, expect, it } from 'vitest';
import { isDesktopFreeModel } from '../src/provider-catalog.js';

describe('Desktop model cost policy', () => {
  it.each(['nvidia-nim', 'ollama', 'lm-studio'])('recognizes the declared free catalog for %s', (providerId) => {
    expect(isDesktopFreeModel({ id: 'model-a' }, providerId)).toBe(true);
  });

  it('does not infer free Gateway access from a missing route classification', () => {
    expect(isDesktopFreeModel({ id: 'model-a' }, 'moderado-cloud')).toBe(false);
  });

  it('requires pricing evidence for an undeclared provider', () => {
    expect(isDesktopFreeModel({ id: 'model/free' }, 'openrouter')).toBe(false);
    expect(isDesktopFreeModel({ id: 'model-a', pricing: { prompt: '0', completion: '0' } }, 'custom')).toBe(true);
    expect(isDesktopFreeModel({ id: 'model-a', pricing: {} }, 'custom')).toBe(false);
  });

  it.each(['0.1', '-1', '', 'NaN', 'Infinity'])('rejects nonzero or invalid pricing %j even for a declared free catalog', (price) => {
    expect(isDesktopFreeModel({ id: 'model-a', pricing: { prompt: price, completion: '0' } }, 'nvidia-nim')).toBe(false);
  });

  it('no longer treats the removed presets as free catalogs', () => {
    expect(isDesktopFreeModel({ id: 'model-a' }, 'agnes-ai')).toBe(false);
    expect(isDesktopFreeModel({ id: 'orcarouter/free' }, 'orcarouter')).toBe(false);
  });
});

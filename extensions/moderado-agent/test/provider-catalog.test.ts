import { describe, expect, it } from 'vitest';
import { isDesktopFreeModel } from '../src/provider-catalog.js';

describe('Desktop model cost policy', () => {
  it.each(['agnes-ai', 'nvidia-nim', 'moderado-cloud', 'ollama', 'lm-studio'])('recognizes the declared free catalog for %s', (providerId) => {
    expect(isDesktopFreeModel({ id: 'model-a' }, providerId)).toBe(true);
  });

  it('requires pricing evidence for an undeclared provider', () => {
    expect(isDesktopFreeModel({ id: 'model/free' }, 'openrouter')).toBe(false);
    expect(isDesktopFreeModel({ id: 'model-a', pricing: { prompt: '0', completion: '0' } }, 'custom')).toBe(true);
    expect(isDesktopFreeModel({ id: 'model-a', pricing: {} }, 'custom')).toBe(false);
  });

  it.each(['0.1', '-1', '', 'NaN', 'Infinity'])('rejects nonzero or invalid pricing %j even for a declared free catalog', (price) => {
    expect(isDesktopFreeModel({ id: 'model-a', pricing: { prompt: price, completion: '0' } }, 'agnes-ai')).toBe(false);
  });

  it('scopes exact trailing free segments to OrcaRouter', () => {
    expect(isDesktopFreeModel({ id: 'orcarouter/free' }, 'orcarouter')).toBe(true);
    for (const id of ['orcarouter/notfree', 'orcarouter/free-router', 'orcarouter/free/model']) {
      expect(isDesktopFreeModel({ id }, 'orcarouter')).toBe(false);
    }
    expect(isDesktopFreeModel({ id: 'orcarouter/free' }, 'openrouter')).toBe(false);
  });
});

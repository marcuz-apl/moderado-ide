import { describe, expect, it } from 'vitest';
import { NoEligibleModelError, Router } from '@moderado/core';
import type { ModelInventoryEntry } from '@moderado/contracts';
import { DesktopModelRouter } from '../src/model-router.js';

const model = (id: string, extra: Partial<ModelInventoryEntry> = {}): ModelInventoryEntry => ({ id, object: 'model', owned_by: 'provider', ...extra });
const zero = { prompt: '0', completion: '0' };
const makeRouter = (inventory: ModelInventoryEntry[], providerId = 'openrouter', allowPaid = false, allowUnknown = false) =>
  new DesktopModelRouter({ providerId, inventory, allowPaid, allowUnknown, requireTools: true });

describe('Desktop model routing', () => {
  it('extends the injected engine router contract', () => {
    expect(makeRouter([])).toBeInstanceOf(Router);
  });

  it('ranks confirmed free models before opted-in paid and unknown models', () => {
    const inventory = [model('unknown'), model('paid', { pricing: { prompt: '1', completion: '1' } }), model('free', { pricing: zero })];
    expect(makeRouter(inventory, 'openrouter', true, true).selectModel(inventory).rankedCandidates.map((m) => m.id)).toEqual(['free', 'paid', 'unknown']);
  });

  it('keeps inventory order within a tier', () => {
    const inventory = [model('z', { pricing: zero }), model('a', { pricing: zero })];
    expect(makeRouter(inventory).selectModel(inventory).rankedCandidates.map((m) => m.id)).toEqual(['z', 'a']);
  });

  it.each(['ollama', 'lm-studio'])('classifies unpriced %s models as local', (providerId) => {
    const inventory = [model('local-model')];
    expect(makeRouter(inventory, providerId).selectModel(inventory).selectedModel.classification.accessTier).toBe('local');
  });

  it('excludes unsupported tools but permits unknown capabilities', () => {
    const inventory = [model('text', { pricing: zero, supported_parameters: ['temperature'] }), model('unknown-tools', { pricing: zero })];
    expect(makeRouter(inventory).selectModel(inventory).selectedModel.id).toBe('unknown-tools');
    expect(makeRouter(inventory).selectModel(inventory, { requireTools: false }).selectedModel.id).toBe('text');
  });

  it('uses exact known tool capabilities without inheriting name heuristics', () => {
    const inventory = [model('meta/llama-3.3-70b-instruct'), model('some/llama-instruct')];
    const router = makeRouter(inventory);
    expect(router.classifyModel(inventory[0].id)).toMatchObject({ accessTier: 'unknown', toolSupport: 'supported' });
    expect(router.classifyModel(inventory[1].id)).toMatchObject({ accessTier: 'unknown', toolSupport: 'unknown' });
  });

  it('prefers advertised capability over the known table', () => {
    const inventory = [model('meta/llama-3.3-70b-instruct', { supported_parameters: [] })];
    expect(makeRouter(inventory).classifyModel(inventory[0].id).toolSupport).toBe('unsupported');
  });

  it.each(['1', '', 'NaN'])('classifies nonzero or invalid pricing %j as paid before preset evidence', (prompt) => {
    const inventory = [model('model', { pricing: { prompt, completion: '0' } })];
    expect(makeRouter(inventory, 'agnes-ai').classifyModel('model').accessTier).toBe('paid');
    expect(() => makeRouter(inventory, 'agnes-ai').selectModel(inventory)).toThrow(NoEligibleModelError);
  });

  it('requires separate paid and unknown opt-ins with desktop recovery guidance', () => {
    const inventory = [model('paid', { pricing: { prompt: '1', completion: '0' } }), model('unknown')];
    const router = makeRouter(inventory);
    expect(() => router.selectModel(inventory)).toThrow(/Settings/);
    expect(router.selectModel(inventory, { allowPaid: true }).selectedModel.id).toBe('paid');
    expect(router.selectModel(inventory, { allowUnknown: true }).selectedModel.id).toBe('unknown');
  });

  it('uses exact provider policies instead of provider-name substring evidence', () => {
    const inventory = [model('model')];
    expect(makeRouter(inventory, 'nvidia-nim').classifyModel('model').accessTier).toBe('free_trial');
    expect(makeRouter(inventory, 'custom-nvidia-nim').classifyModel('model').accessTier).toBe('unknown');
  });

  it('pins a manual model exactly without automatic switching', () => {
    const inventory = [model('free', { pricing: zero })];
    const router = makeRouter(inventory);
    const result = router.selectModel(inventory, { pinnedModelId: 'custom/paid-model' });
    expect(result.selectedModel.id).toBe('custom/paid-model');
    expect(result.rankedCandidates.map((m) => m.id)).toEqual(['custom/paid-model']);
    expect(router.getNextFallback(result.rankedCandidates, 'custom/paid-model')).toBeUndefined();
  });

  it('moves to the next eligible direct candidate on fallback', () => {
    const inventory = [model('first', { pricing: zero }), model('second', { pricing: zero }), model('paid', { pricing: { prompt: '1', completion: '1' } })];
    const router = makeRouter(inventory);
    const result = router.selectModel(inventory);
    expect(router.getNextFallback(result.rankedCandidates, 'first')?.id).toBe('second');
    expect(router.getNextFallback(result.rankedCandidates, 'second')).toBeUndefined();
    expect(router.getNextFallback(result.rankedCandidates, 'missing')).toBeUndefined();
  });

  it('uses Gateway AUTO even without an auto inventory entry and leaves fallback to the server', () => {
    const inventory = [model('moonshotai/kimi-k3')];
    const router = makeRouter(inventory, 'moderado-cloud');
    const result = router.selectModel(inventory);
    expect(result.selectedModel.id).toBe('auto');
    expect(result.rankedCandidates).toEqual([]);
    expect(router.getNextFallback([result.selectedModel, { ...result.selectedModel, id: 'other' }], 'auto')).toBeUndefined();
    expect(router.selectModel([], { pinnedModelId: 'auto' }).selectedModel.id).toBe('auto');
  });

  it('pins an exact Gateway route and classifies the owner-confirmed catalog as Free', () => {
    const inventory = [model('moonshotai/kimi-k3')];
    const router = makeRouter(inventory, 'moderado-cloud');
    expect(router.classifyModel(inventory[0].id).accessTier).toBe('free_trial');
    expect(router.selectModel(inventory, { pinnedModelId: inventory[0].id }).selectedModel.id).toBe(inventory[0].id);
  });

  it('classifies entries from the inventory supplied at selection time', () => {
    const router = makeRouter([]);
    const inventory = [model('later', { pricing: zero, supported_parameters: ['tools'] })];
    expect(router.selectModel(inventory).selectedModel.classification).toMatchObject({ accessTier: 'free_trial', toolSupport: 'supported' });
  });
});

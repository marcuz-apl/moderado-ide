import type { DiscoveredModel, ModelClassification, ModelInventoryEntry } from '@moderado/contracts';
import { NoEligibleModelError, Router, type RouteSelectionOptions, type SelectedModelResult } from '@moderado/core';
import { DESKTOP_PROVIDER_PRESETS, isDesktopFreeModel } from './provider-catalog.js';

export interface DesktopModelRouterOptions {
  providerId: string;
  inventory: ModelInventoryEntry[];
  allowPaid: boolean;
  allowUnknown: boolean;
  requireTools: boolean;
}

/** Desktop cost policy composed with the provider-neutral engine router API. */
export class DesktopModelRouter extends Router {
  private inventory: ModelInventoryEntry[];

  constructor(private readonly defaults: DesktopModelRouterOptions) {
    super();
    this.inventory = defaults.inventory;
  }

  override classifyModel(modelId: string, isLocalProfile = false, supportedParameters?: string[]): ModelClassification {
    const entry = this.inventory.find((candidate) => candidate.id === modelId) ?? { id: modelId };
    const parameters = supportedParameters ?? ('supported_parameters' in entry ? entry.supported_parameters : undefined);
    // Only exact official entries supply tool evidence from the engine table.
    // Its broad model-name heuristics grant neither free access nor tool support.
    const known = super.classifyModel(modelId);
    const toolSupport = parameters !== undefined
      ? parameters.some((parameter) => parameter === 'tools' || parameter === 'tool_choice') ? 'supported' : 'unsupported'
      : known.source === 'official_metadata' ? known.toolSupport : 'unknown';
    const pricing = 'pricing' in entry ? entry.pricing : undefined;
    const invalidOrMetered = pricing !== undefined && (
      !pricing || typeof pricing !== 'object' || Array.isArray(pricing)
      || Object.values(pricing).some((price) => typeof price !== 'string' || price.trim() === '' || !Number.isFinite(Number(price)) || Number(price) !== 0)
    );
    const local = isLocalProfile || DESKTOP_PROVIDER_PRESETS.find((preset) => preset.id === this.defaults.providerId)?.local;
    const accessTier = invalidOrMetered ? 'paid'
      : local ? 'local'
        : isDesktopFreeModel(entry, this.defaults.providerId) ? 'free_trial' : 'unknown';
    return { modelId, accessTier, toolSupport, source: 'official_metadata' };
  }

  override selectModel(inventory: ModelInventoryEntry[], options: RouteSelectionOptions = {}): SelectedModelResult {
    this.inventory = inventory;
    const discover = (entry: ModelInventoryEntry): DiscoveredModel => ({
      id: entry.id,
      created: entry.created,
      ownedBy: entry.owned_by,
      classification: this.classifyModel(entry.id, options.isLocalProfile, entry.supported_parameters),
    });
    if (this.defaults.providerId === 'moderado-cloud' && (!options.pinnedModelId || options.pinnedModelId === 'auto')) {
      return {
        selectedModel: {
          id: 'auto', ownedBy: 'moderado-cloud',
          classification: { modelId: 'auto', accessTier: 'free_trial', toolSupport: 'supported', source: 'official_metadata', notes: 'Gateway selects and falls back between routes.' },
        },
        rankedCandidates: [],
      };
    }
    if (options.pinnedModelId) {
      const entry = inventory.find((candidate) => candidate.id === options.pinnedModelId)
        ?? { id: options.pinnedModelId, object: 'model' as const, owned_by: this.defaults.providerId };
      const selectedModel = discover(entry);
      return { selectedModel, rankedCandidates: [selectedModel] };
    }
    const allowPaid = options.allowPaid ?? this.defaults.allowPaid;
    const allowUnknown = options.allowUnknown ?? this.defaults.allowUnknown;
    const requireTools = options.requireTools ?? this.defaults.requireTools;
    const priority = { free_trial: 0, local: 1, paid: 2, unknown: 3 };
    const rankedCandidates = inventory.map(discover).filter(({ classification }) => {
      if (requireTools && classification.toolSupport === 'unsupported') return false;
      return classification.accessTier === 'paid' ? allowPaid
        : classification.accessTier === 'unknown' ? allowUnknown : true;
    }).sort((a, b) => priority[a.classification.accessTier] - priority[b.classification.accessTier]);
    if (!rankedCandidates.length) {
      throw new NoEligibleModelError('No eligible models. Open Moderado Settings to refresh models or review the cost and tool capability requirements.', [
        'Refresh the provider model catalog in Settings.',
        'Select a specific model to pin its route.',
        'Enable paid or unknown-cost models only if you accept their cost.',
      ]);
    }
    return { selectedModel: rankedCandidates[0], rankedCandidates };
  }

  override getNextFallback(rankedCandidates: DiscoveredModel[], currentModelId: string): DiscoveredModel | undefined {
    return this.defaults.providerId === 'moderado-cloud' ? undefined : super.getNextFallback(rankedCandidates, currentModelId);
  }
}

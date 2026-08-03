import type { Tier } from './tiers';

export interface RestoredModelPreparation {
	tier: Tier | null;
	prepared: boolean;
	resume: boolean;
}

export type ModelPreparationStatus = 'downloading' | 'loading';

/** WebLLM reports one monotonic 0..1 pass while fetching shards, then resets
 * progress for its Cache API → GPU pass. Detect that numeric phase boundary;
 * callback prose is display text, not a stable API contract. */
export function modelPreparationStatus(
	wasPrepared: boolean,
	previousProgress: number,
	progress: number
): ModelPreparationStatus {
	return wasPrepared || (previousProgress >= 0.99 && progress < previousProgress)
		? 'loading'
		: 'downloading';
}

/** Restore the exact model whose preparation already started or completed.
 * Device detection remains the fallback for a first visit. A persisted model
 * wins because a partial Cache API download and an automatic step-down both
 * belong to that model, not to a newly detected rung. Unknown old ids are
 * ignored, so removing a tier from the catalog cannot strand startup. */
export function restoreModelPreparation(
	detected: Tier | null,
	tiers: readonly Tier[],
	preparedModel: string | null,
	consentedModel: string | null,
	forced: Tier | null
): RestoredModelPreparation {
	// Consent names the operation currently in flight. It must beat an older
	// prepared marker when a downgrade starts and the page reloads mid-download.
	const persistedModel = consentedModel ?? preparedModel;
	const persisted = persistedModel
		? (tiers.find((tier) => tier.model === persistedModel) ?? null)
		: null;
	const tier = forced ?? persisted ?? detected;
	const prepared = !!tier && preparedModel === tier.model;
	return {
		tier,
		prepared,
		resume: !!tier && (prepared || consentedModel === tier.model || forced !== null)
	};
}

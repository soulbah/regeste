import { describe, expect, it } from 'vitest';
import { modelPreparationStatus, restoreModelPreparation } from './model-resume';
import type { Tier } from './tiers';

const large: Tier = {
	id: 'large',
	engine: 'webllm',
	model: 'large-model',
	downloadLabel: '~4.5 GB',
	downloadBytes: 4_500_000_000,
	vramMB: 5000,
	largestTensorMB: 251,
	requiresF16: true
};
const mid: Tier = {
	...large,
	id: 'mid',
	model: 'mid-model',
	downloadLabel: '~1.1 GB',
	downloadBytes: 1_100_000_000,
	vramMB: 2200,
	largestTensorMB: 243
};
const tiers = [large, mid];

describe('private model preparation restoration', () => {
	it('resumes an interrupted consented download after a page reload', () => {
		expect(restoreModelPreparation(large, tiers, null, large.model, null)).toEqual({
			tier: large,
			prepared: false,
			resume: true
		});
	});

	it('reuses the model that already loaded after an automatic step-down', () => {
		expect(restoreModelPreparation(large, tiers, mid.model, mid.model, null)).toEqual({
			tier: mid,
			prepared: true,
			resume: true
		});
	});

	it('resumes the newer consented downgrade instead of an older prepared model', () => {
		expect(restoreModelPreparation(large, tiers, large.model, mid.model, null)).toEqual({
			tier: mid,
			prepared: false,
			resume: true
		});
	});

	it('ignores a removed model id and waits for first-visit consent', () => {
		expect(restoreModelPreparation(large, tiers, null, 'removed-model', null)).toEqual({
			tier: large,
			prepared: false,
			resume: false
		});
	});

	it('lets the benchmark force its requested tier', () => {
		expect(restoreModelPreparation(large, tiers, mid.model, mid.model, large)).toEqual({
			tier: large,
			prepared: false,
			resume: true
		});
	});
});

describe('WebLLM preparation phases', () => {
	it('changes to memory loading when WebLLM resets completed progress', () => {
		expect(modelPreparationStatus(false, 1, 0)).toBe('loading');
		expect(modelPreparationStatus(false, 1, 0.54)).toBe('loading');
	});

	it('keeps network fetches numeric and cached sessions in loading', () => {
		expect(modelPreparationStatus(false, 0.53, 0.54)).toBe('downloading');
		expect(modelPreparationStatus(true, 0, 0.1)).toBe('loading');
	});
});

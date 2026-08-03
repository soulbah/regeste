import { afterEach, describe, expect, it, vi } from 'vitest';
import { llmStore, type PrivateStatus } from '$lib/private-ai/llm.svelte';
import { TIERS } from '$lib/private-ai/tiers';
import { modeReadiness } from './mode-readiness.svelte';

vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_ASSISTED_ENABLED: 'true' } }));

const initial = {
	status: llmStore.status,
	progress: llmStore.progress,
	errorMessage: llmStore.errorMessage,
	smallerTier: llmStore.smallerTier
};

afterEach(() => {
	llmStore.status = initial.status as PrivateStatus;
	llmStore.progress = initial.progress;
	llmStore.errorMessage = initial.errorMessage;
	llmStore.smallerTier = initial.smallerTier;
});

describe('private mode readiness', () => {
	it('exposes positive sub-percent download progress honestly', () => {
		llmStore.status = 'downloading';
		llmStore.progress = 0.004;

		expect(modeReadiness('private')).toMatchObject({
			state: 'progress',
			pct: 1,
			pctLabel: '<1%'
		});
	});

	it('turns an interrupted load into a working retry action', () => {
		llmStore.status = 'error';
		llmStore.errorMessage = 'Download interrupted';
		llmStore.smallerTier = null;

		expect(modeReadiness('private')).toMatchObject({
			state: 'setup',
			blockedLine: 'Download interrupted',
			setupKey: 'notice.retry'
		});
	});

	it('offers a smaller model only after a capacity failure selected one', () => {
		llmStore.status = 'error';
		llmStore.smallerTier = TIERS.at(-1) ?? null;

		expect(modeReadiness('private')).toMatchObject({
			state: 'setup',
			setupKey: 'llm.error.tooLarge.cta'
		});
	});
});

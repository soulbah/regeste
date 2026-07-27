// What the home should ask for next, derived rather than stored.
//
// The two facts a first run needs are an engine that can answer and a document
// to answer from, and they are not interchangeable: without an engine a
// document leads nowhere. The home used to show both at once, with the drop
// zone large and dashed and the engine a small pill under it, so the only real
// blocker was the quietest thing on screen.
//
// Four steps, because "the user picked a mode" and "that mode can answer" are
// different claims. Someone can choose Private and never download the weights;
// telling them to add a document then is a dead end.

import { documentsStore } from '$lib/state/documents.svelte';
import { settingsStore } from '$lib/state/settings.svelte';
import { modeReadiness } from '$lib/state/mode-readiness.svelte';
import type { ChatMode } from '$lib/types';

export type OnboardingStep = 'choose-mode' | 'finish-setup' | 'add-document' | 'ready';

export interface OnboardingState {
	step: OnboardingStep;
	/** The mode the setup step is waiting on; null outside 'finish-setup'. */
	pendingMode: ChatMode | null;
	/** 0–100 while weights are downloading, null otherwise. */
	downloadPct: number | null;
	hasDocument: boolean;
}

/**
 * Reactive when read from a template or an effect.
 *
 * A document can be added while an engine is still downloading, and the home
 * says so: indexing runs on a separate, much smaller model that is already
 * present, so the two never have to be waited on in sequence.
 */
export function onboardingState(): OnboardingState {
	const hasDocument = documentsStore.library.length > 0;
	if (!settingsStore.modeChosen)
		return { step: 'choose-mode', pendingMode: null, downloadPct: null, hasDocument };

	const mode = settingsStore.defaultMode;
	const readiness = modeReadiness(mode);
	const downloadPct = readiness.state === 'progress' ? readiness.pct : null;
	if (readiness.state !== 'ready')
		return { step: 'finish-setup', pendingMode: mode, downloadPct, hasDocument };

	return {
		step: hasDocument ? 'ready' : 'add-document',
		pendingMode: null,
		downloadPct,
		hasDocument
	};
}

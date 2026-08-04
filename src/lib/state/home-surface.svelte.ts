// Which of three surfaces the new-chat route should be, derived rather than
// stored.
//
// They were one screen with branches, and that conflated two different jobs.
// A first run has to get someone from nothing to a first answer, so it explains
// and it sequences. Opening a new chat with a ready engine and a full library
// is not that: it happens every day, it teaches nothing, and its only job is
// the shortest path to a question. Treating the recurring empty state as a
// first run is the documented way to end up lecturing returning users.
//
// The engine choice is not a phase of either. It is a precondition, so it is
// modelled as a gate that appears whenever it is unmet, whatever else is true:
// documents can be indexed without one, since indexing never calls the model.

import { documentsStore } from '$lib/state/documents.svelte';
import { settingsStore } from '$lib/state/settings.svelte';
import { modeReadiness } from '$lib/state/mode-readiness.svelte';
import type { ChatMode } from '$lib/types';

type HomeSurface =
	/** No mode has ever been chosen: nothing can answer, so nothing else matters. */
	| 'choose-engine'
	/** Nothing in the library yet. Explain, offer the sample, one way in. */
	| 'first-run'
	/** Engine chosen, documents on hand. A launcher, not a lesson. */
	| 'launcher';

export interface HomeState {
	surface: HomeSurface;
	/**
	 * Set whenever the chosen mode cannot answer yet, on every surface. Setup
	 * and adding a document are independent: indexing runs on a separate, much
	 * smaller model that is already here, so neither waits on the other.
	 */
	pendingMode: ChatMode | null;
	/** 0–100 while weights are downloading, null otherwise. */
	downloadPct: number | null;
	libraryEmpty: boolean;
}

/**
 * Reactive when read from a template or an effect.
 *
 * `activeMode` is the mode the composer is actually on, which is not always the
 * stored default: switching mode in the picker changes the former and leaves
 * the latter alone. Reading the default here made the setup line ask for a
 * server endpoint while the composer sat on Cloud, signed in and ready.
 */
export function homeState(activeMode: ChatMode | null = null): HomeState {
	const libraryEmpty = documentsStore.library.length === 0;

	if (!settingsStore.modeChosen)
		return { surface: 'choose-engine', pendingMode: null, downloadPct: null, libraryEmpty };

	const mode = activeMode ?? settingsStore.defaultMode;
	const readiness = modeReadiness(mode);

	return {
		surface: libraryEmpty ? 'first-run' : 'launcher',
		pendingMode: readiness.state === 'ready' ? null : mode,
		downloadPct: readiness.state === 'progress' ? readiness.pct : null,
		libraryEmpty
	};
}

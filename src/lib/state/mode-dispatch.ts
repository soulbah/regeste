// Where choosing a mode sends you, decided once.
//
// The composer's picker and the onboarding cards both had their own copy of
// this, and they disagreed: the picker sent Cloud to the sign-in page while the
// cards opened the Settings modal on a card whose only action is a sign-in
// button. Same class of bug as two number grammars — a rule written twice is a
// rule that drifts. One function now, both callers.

import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { llmStore } from '$lib/private-ai/llm.svelte';
import { modeReadiness } from '$lib/state/mode-readiness.svelte';
import { uiStore } from '$lib/state/ui.svelte';
import type { ChatMode } from '$lib/types';

export interface DispatchResult {
	/** True when the mode can answer now and was selected. */
	activated: boolean;
}

/**
 * Select the mode, or send the user to the one place that can make it work.
 *
 * Not every mode needs the Settings modal. Cloud needs an account and nothing
 * else, so it goes straight to the sign-in page; opening a modal to reveal a
 * button that navigates away is a step that exists only because the code was
 * written that way. The other two do have configuration — a download, an
 * endpoint — and that lives in their Settings card.
 *
 * A mode that cannot answer yet is never selected. It is recorded as pending,
 * and the picker's watcher activates it the moment setup completes, so nobody
 * ends up with "Cloud" showing as the active mode while signed out.
 */
export function dispatchMode(mode: ChatMode, onReady: (mode: ChatMode) => void): DispatchResult {
	const readiness = modeReadiness(mode);
	if (readiness.state === 'ready') {
		onReady(mode);
		return { activated: true };
	}
	if (readiness.state !== 'setup') return { activated: false };

	uiStore.pendingActivation = mode;

	// Each mode is missing exactly one thing, and each goes straight to it.
	//
	// This device is missing a file, and asking for a file is not a
	// conversation: the download starts here, in place, and the progress rides
	// the persistent line on the home while the user gets on with adding a
	// document. Opening a modal to reveal a Download button was a step that
	// existed only because the button happened to live there.
	if (mode === 'private') {
		void llmStore.prepare();
		return { activated: false };
	}
	// Cloud is missing an account, which has its own page.
	if (mode === 'assisted') {
		void goto(resolve('/auth'));
		return { activated: false };
	}
	// Your server is missing an address and a model choice: a real form, and
	// the Settings card is where it lives.
	uiStore.openSettings('ai', mode);
	return { activated: false };
}

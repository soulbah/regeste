// Spec 022 — one readiness verdict per AI mode, derived from the existing
// stores. The picker and the Settings AI cards both read this, so the two
// surfaces can never disagree.

import { llmStore } from '$lib/private-ai/llm.svelte';
import { myaiStore } from '$lib/state/myai.svelte';
import { sessionStore } from '$lib/state/session.svelte';
import { settingsStore } from '$lib/state/settings.svelte';
import { t, type MessageKey } from '$lib/i18n/index.svelte';
import type { ChatMode } from '$lib/types';

export type ReadinessState = 'ready' | 'setup' | 'progress' | 'blocked';

export interface ModeReadiness {
	state: ReadinessState;
	/** 0–100, only meaningful when state is 'progress'. */
	pct: number;
	/** Reason line when blocked (already translated); null otherwise. */
	blockedLine: string | null;
	/** i18n key for the setup call to action ("Set up" / "Sign in"). */
	setupKey: MessageKey;
}

/**
 * Reactive when called from a template or effect: every branch reads rune
 * state from the underlying stores.
 */
export function modeReadiness(mode: ChatMode, opts: { privateOnly?: boolean } = {}): ModeReadiness {
	const base: ModeReadiness = {
		state: 'ready',
		pct: 0,
		blockedLine: null,
		setupKey: 'modes.state.setup'
	};
	if (mode === 'private') {
		switch (llmStore.status) {
			case 'ready':
			case 'generating':
				return base;
			case 'detecting':
				return { ...base, state: 'progress' };
			case 'downloading':
			case 'loading':
				return { ...base, state: 'progress', pct: Math.round(llmStore.progress * 100) };
			case 'needs-download':
				return { ...base, state: 'setup' };
			case 'unavailable':
				return { ...base, state: 'blocked', blockedLine: t('modes.private.unavailable') };
			case 'error':
				return {
					...base,
					state: 'blocked',
					blockedLine: llmStore.errorMessage ?? t('modes.error')
				};
		}
	}
	// Cloud modes share the chat lock and the offline switch.
	if (opts.privateOnly) return { ...base, state: 'blocked', blockedLine: t('modes.locked') };
	if (settingsStore.forceOffline)
		return { ...base, state: 'blocked', blockedLine: t('modes.offlineOn') };
	if (mode === 'assisted') {
		return sessionStore.user ? base : { ...base, state: 'setup', setupKey: 'modes.state.signIn' };
	}
	return myaiStore.baseUrl && myaiStore.defaultModel ? base : { ...base, state: 'setup' };
}

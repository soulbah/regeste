// T2 force-offline guard (spec 009): the single gate in front of every
// outgoing request made by app code. When the switch is on, nothing leaves —
// the living proof of the local-first promise.

import { t } from '$lib/i18n/index.svelte';
import { settingsStore } from '$lib/state/settings.svelte';

export class OfflineError extends Error {
	constructor() {
		super(t('error.offline'));
		this.name = 'OfflineError';
	}
}

export function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	if (settingsStore.forceOffline) return Promise.reject(new OfflineError());
	return fetch(input, init);
}

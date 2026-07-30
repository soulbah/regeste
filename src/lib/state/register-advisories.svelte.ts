// The conditions worth telling someone about, registered in one place.
//
// Kept out of advisories.svelte.ts on purpose: that file must know nothing about
// this app's domain, or every future condition ends up editing the primitive.
// Each source here is a pure read — no side effects, no fetching — so the bar can
// evaluate all of them on every change without cost.

import { t } from '$lib/i18n/index.svelte';
import { advisories } from './advisories.svelte';
import { pwaStore } from './pwa.svelte';
import { documentsStore } from './documents.svelte';

let installed = false;

export function registerAdvisories(): void {
	if (installed) return;
	installed = true;

	// A waiting update. The friendly case, and the reason this slot exists at all:
	// it used to be a banner floating over the chat's own header.
	advisories.register(() =>
		pwaStore.updateReady
			? {
					id: 'update',
					level: 'notice',
					text: t('update.ready'),
					action: { label: t('update.cta'), run: () => pwaStore.applyUpdate() }
				}
			: null
	);

	// Storage the browser has not committed to keeping, with work already in it.
	//
	// Guarded twice, because this is the condition most likely to become wallpaper:
	// it is read only AFTER the layout's delayed ensurePersisted() has had its go,
	// and only once there is something to lose. On an empty workspace it says
	// nothing — there is no point warning about losing nothing, and a bar that
	// greets every first visit is one people learn to close without reading.
	// `persisted` is null until the check has run, so `=== false` is precisely
	// "asked and refused" and never "not asked yet".
	advisories.register(() =>
		pwaStore.persisted === false && documentsStore.documents.length > 0
			? {
					id: 'eviction',
					level: 'degraded',
					text: t('advisory.eviction'),
					topic: 'private-window'
				}
			: null
	);
}

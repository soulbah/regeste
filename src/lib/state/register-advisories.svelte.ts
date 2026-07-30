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

const VISITS_KEY = 'regeste:visits';

/**
 * Whether this workspace has already survived a visit.
 *
 * The eviction advisory is true from the first second, and saying it then is
 * what made it read as a failure: it appeared the instant a document finished
 * being added, next to the document, and the reader's reasonable conclusion was
 * that the add had not worked. Nothing had gone wrong, and nothing was at stake
 * yet either — a workspace built five seconds ago has nothing to lose.
 *
 * Counting page loads is the cheapest honest version of "come back and this
 * matters". Read once at registration, so the number cannot move under a
 * source that is meant to be a pure read.
 */
function returning(): boolean {
	try {
		const seen = Number(localStorage.getItem(VISITS_KEY) ?? '0');
		localStorage.setItem(VISITS_KEY, String(seen + 1));
		return seen >= 1;
	} catch {
		// A browser that will not store this will not remember the dismissal
		// either; staying quiet is the kinder failure.
		return false;
	}
}

export function registerAdvisories(): void {
	if (installed) return;
	installed = true;
	const returningVisitor = returning();

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
	// Guarded three times, because this is the condition most likely to become
	// wallpaper: it is read only AFTER the layout's delayed ensurePersisted() has
	// had its go, only once there is something to lose, and only from the second
	// visit on. `persisted` is null until the check has run, so `=== false` is
	// precisely "asked and refused" and never "not asked yet" — though on Chromium
	// that refusal is the ordinary answer for a site you have not visited much,
	// which is exactly why it needs the other two guards to mean anything.
	advisories.register(() =>
		returningVisitor && pwaStore.persisted === false && documentsStore.documents.length > 0
			? {
					id: 'eviction',
					level: 'degraded',
					text: t('advisory.eviction'),
					topic: 'private-window'
				}
			: null
	);
}

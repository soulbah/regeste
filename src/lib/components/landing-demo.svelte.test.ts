import { describe, expect, it, vi } from 'vitest';

// Watch the database lock from the moment this file loads, before anything is
// mounted. The handle in $lib/local-db/client.ts is a module-level singleton, so
// the lock is requested at most once per file: a spy installed inside a test
// that runs after the first mount observes nothing and passes for the wrong
// reason.
const lockNames: string[] = [];
const requestLock = navigator.locks.request.bind(navigator.locks);
navigator.locks.request = ((name: string, ...rest: unknown[]) => {
	lockNames.push(name);
	return (requestLock as (...args: unknown[]) => Promise<unknown>)(name, ...rest);
}) as typeof navigator.locks.request;

// The composer's mode selector reads the Assisted flag, which SvelteKit only
// materialises at runtime; the browser test env has no such module.
vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_ASSISTED_ENABLED: 'true' } }));

import { mount, unmount, flushSync } from 'svelte';
import LandingDemo from './landing-demo.svelte';
import LandingDossier from './landing-dossier.svelte';
import { chatsStore } from '$lib/state/chats.svelte';
import { i18n } from '$lib/i18n/index.svelte';
import { LANDING_FIXTURE } from '$lib/landing-fixture';
import { assistedPayloadBytes, buildAssistedExcerpts } from '$lib/assisted-payload';

// The hero is the product running live, so it breaks in ways a screenshot never
// could: a component stops exposing the textarea the demo types into, or a panel
// starts reading the database on mount. Those are silent and permanent, so they
// are caught here. Geometry is not: the app's stylesheet is absent from this
// environment, so the fixed frame is checked against the real page instead
// (.benchmark-corpus/scripts/hero-demo-check.mjs).

function renderIn(component: typeof LandingDemo) {
	const host = document.createElement('div');
	// The frame is fixed-height, so give the page a viewport-sized box.
	host.style.cssText = 'width:1200px;height:900px';
	document.body.appendChild(host);
	const app = mount(component, { target: host });
	flushSync();
	return {
		host,
		stop: () => {
			unmount(app);
			host.remove();
		}
	};
}

const render = () => renderIn(LandingDemo);

describe('landing hero demo', () => {
	it('offers the app’s real composer field to type into', () => {
		const { host, stop } = render();
		// The typing animation reaches for this exact element. If the composer
		// ever swaps its textarea for something else, the demo would silently
		// freeze on an empty input — the animation has no other failure mode.
		expect(host.querySelector('textarea')).not.toBeNull();
		stop();
	});

	it('never opens the local database', () => {
		// The landing shares an origin with the app, and the database is
		// single-owner: taking the `regeste-db-owner` lock here would lock the real
		// app out in another tab. Mounting must stay purely in-memory.
		//
		// The lock is what to watch. An earlier version of this test spied
		// navigator.storage.getDirectory, which only ever runs inside the database
		// worker's own global scope — so it could not observe anything this side of
		// the worker, and it sat green while the composer's mode selector opened the
		// database through myaiStore.init().
		const { stop } = render();
		expect(lockNames).not.toContain('regeste-db-owner');
		stop();
	});

	it('follows the visitor’s language', () => {
		const previous = i18n.locale;
		i18n.locale = 'fr';
		const { stop } = render();
		// The chat is named after the question that opened the thread.
		expect(chatsStore.activeChat?.title).toContain('sous-location');
		// The page applies ?lang= after mount, so a later switch must re-seed the
		// stores the header and the panel read.
		i18n.locale = 'en';
		flushSync();
		expect(chatsStore.activeChat?.title).toContain('subletting');
		stop();
		i18n.locale = previous;
	});
});

describe('landing dossier', () => {
	it('never opens the local database', () => {
		const { stop } = renderIn(LandingDossier as typeof LandingDemo);
		expect(lockNames).not.toContain('regeste-db-owner');
		stop();
	});

	it('sends strictly less than it offers, in both locales', () => {
		// The section prints the same two payloads in four places: the ledger, the
		// rail readout, the pre-send footer and the record's destination line. They
		// all come from this one computation, so this is what protects them. A
		// hand-written figure in a dictionary would drift the moment the fixture's
		// wording changed by one character, and the two leaves sit forty pixels
		// apart where anyone would see it.
		const bytesOf = (locale: 'en' | 'fr', rows: number[]) => {
			const fix = LANDING_FIXTURE[locale];
			return assistedPayloadBytes(
				fix.presendQ,
				buildAssistedExcerpts(
					rows.map((i) => ({
						text: fix.presendHits[i].text,
						documentId: 'landing-doc',
						page: fix.presendHits[i].page,
						headingPath: fix.presendHits[i].heading
					}))
				),
				null
			);
		};
		for (const locale of ['en', 'fr'] as const) {
			const offered = bytesOf(locale, [0, 1, 2]);
			const sent = bytesOf(locale, [0, 1]);
			expect(sent).toBeLessThan(offered);
			// Both must round to a figure a reader can tell apart, or unticking a
			// passage changes nothing on screen and the section argues for nothing.
			expect((offered / 1024).toFixed(1)).not.toBe((sent / 1024).toFixed(1));
		}
	});
});

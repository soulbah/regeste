import { describe, expect, it, vi } from 'vitest';

// The composer's mode selector reads the Assisted flag, which SvelteKit only
// materialises at runtime; the browser test env has no such module.
vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_ASSISTED_ENABLED: 'true' } }));

import { mount, unmount, flushSync } from 'svelte';
import LandingDemo from './landing-demo.svelte';
import { chatsStore } from '$lib/state/chats.svelte';
import { i18n } from '$lib/i18n/index.svelte';

// The hero is the product running live, so it breaks in ways a screenshot never
// could: a component stops exposing the textarea the demo types into, or a panel
// starts reading the database on mount. Those are silent and permanent, so they
// are caught here. Geometry is not: the app's stylesheet is absent from this
// environment, so the fixed frame is checked against the real page instead
// (.benchmark-corpus/scripts/hero-demo-check.mjs).

function render() {
	const host = document.createElement('div');
	// The frame is fixed-height, so give the page a viewport-sized box.
	host.style.cssText = 'width:1200px;height:900px';
	document.body.appendChild(host);
	const app = mount(LandingDemo, { target: host });
	flushSync();
	return {
		host,
		stop: () => {
			unmount(app);
			host.remove();
		}
	};
}

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
		// single-owner: taking the OPFS lock here would lock the real app out in
		// another tab. Mounting must stay purely in-memory.
		const getDirectory = vi.spyOn(navigator.storage, 'getDirectory');
		const { stop } = render();
		expect(getDirectory).not.toHaveBeenCalled();
		getDirectory.mockRestore();
		stop();
	});

	it('follows the visitor’s language', () => {
		const previous = i18n.locale;
		i18n.locale = 'fr';
		const { stop } = render();
		expect(chatsStore.activeChat?.title).toContain('dépôt de garantie');
		// The page applies ?lang= after mount, so a later switch must re-seed the
		// stores the header and the panel read.
		i18n.locale = 'en';
		flushSync();
		expect(chatsStore.activeChat?.title).toContain('security deposit');
		stop();
		i18n.locale = previous;
	});
});

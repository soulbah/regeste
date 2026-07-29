import { describe, expect, it } from 'vitest';
import { isAppNavigation, isMarketingAsset, isMarketingPage } from './sw-routing';

describe('service worker scope', () => {
	it('claims the chat and its subroutes', () => {
		expect(isAppNavigation('/chat')).toBe(true);
		expect(isAppNavigation('/chat/abc123')).toBe(true);
		expect(isAppNavigation('/chat/documents')).toBe(true);
	});

	it('leaves every marketing route to the network', () => {
		// The regression this protects: a catch-all navigate handler answered
		// these from the cached chat shell, so a returning visitor who typed the
		// domain got the app instead of the landing — and the landing became
		// unreachable until the worker updated.
		for (const path of ['/', '/how-it-works', '/help', '/help/two-tabs', '/auth']) {
			expect(isAppNavigation(path)).toBe(false);
		}
	});

	it('does not mistake a lookalike prefix for the app', () => {
		expect(isAppNavigation('/chatter')).toBe(false);
	});

	it('keeps landing media and dev fixtures out of the app cache', () => {
		expect(isMarketingAsset('/landing/film-fr-light.mp4')).toBe(true);
		expect(isMarketingAsset('/landing/hero-fr-light.webp')).toBe(true);
		expect(isMarketingAsset('/dev/landing/bail-location-meublee.pdf')).toBe(true);
		expect(isMarketingAsset('/vendor/sqlite/sqlite3.wasm')).toBe(false);
		expect(isMarketingAsset('/icons/icon-192.png')).toBe(false);
	});
});

describe('isMarketingPage', () => {
	it('covers every page under (marketing)', () => {
		for (const path of ['/', '/how-it-works', '/help', '/help/two-tabs', '/help/storage-blocked']) {
			expect(isMarketingPage(path)).toBe(true);
		}
	});

	it('leaves the app and sign-in to boot the database', () => {
		// /auth reads the session, so it is not a marketing page even though it
		// sits outside the app shell. Getting this wrong would sign nobody in.
		for (const path of ['/chat', '/chat/documents', '/chat/abc', '/auth']) {
			expect(isMarketingPage(path)).toBe(false);
		}
	});
});

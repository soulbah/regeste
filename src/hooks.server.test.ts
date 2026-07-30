import { describe, expect, it } from 'vitest';
import { canonicalRedirect } from './hooks.server';

/** The canonical redirect is the only thing standing between a visitor and the app
 * served in cleartext, and better-auth mints a session cookie without `Secure`
 * when it is handed an http origin. Both directions are worth a test: that it
 * fires, and that it cannot fire against itself. */
describe('canonicalRedirect', () => {
	const at = (href: string, proto: string | null = null) => canonicalRedirect(new URL(href), proto);

	it('sends cleartext to https, keeping the path and query', () => {
		const res = at('http://regeste.com/help/eviction?lang=fr');
		expect(res?.status).toBe(301);
		expect(res?.headers.get('location')).toBe('https://regeste.com/help/eviction?lang=fr');
	});

	it('corrects host and scheme in a single hop', () => {
		expect(at('http://www.regeste.com/how-it-works')?.headers.get('location')).toBe(
			'https://regeste.com/how-it-works'
		);
	});

	it('reads the visitor scheme from the proxy when the url does not carry it', () => {
		// A front that rewrites the url to https but reports the real scheme in a
		// header: the host still has to be corrected, and in one hop.
		expect(at('https://www.regeste.com/', 'http')?.headers.get('location')).toBe(
			'https://regeste.com/'
		);
	});

	it('upgrades on the url even when the proxy reports its own leg as https', () => {
		// Cloudflare's actual behaviour, and the reason the first deploy of this
		// redirect did nothing: it sends `x-forwarded-proto: https` for a visitor who
		// arrived on http, because that header describes the hop to the Worker.
		expect(at('http://regeste.com/', 'https')?.headers.get('location')).toBe(
			'https://regeste.com/'
		);
		expect(at('http://www.regeste.com/', 'https')?.headers.get('location')).toBe(
			'https://regeste.com/'
		);
	});

	it('leaves the canonical origin alone', () => {
		expect(at('https://regeste.com/privacy', 'https')).toBeNull();
	});

	it('serves rather than loops when the only fix available is the current address', () => {
		// A proxy mislabelling an https request as http. Redirecting here would send
		// the visitor to the address they are already on, forever, and take the whole
		// site down. Nothing better is reachable from here, so serve: HSTS and the
		// edge's own https rule are what cover this case.
		expect(at('https://regeste.com/', 'http')).toBeNull();
	});

	it('leaves local development on http', () => {
		expect(at('http://localhost:5173/chat')).toBeNull();
		expect(at('http://127.0.0.1:8787/')).toBeNull();
	});
});

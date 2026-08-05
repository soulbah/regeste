// The content policy, declared once.
//
// It has to be applied twice, by two different mechanisms, because the site is two
// different things. The marketing pages are static files, so SvelteKit stamps a
// policy into each one at build time with the hash of its own inline script. The app
// is client-rendered — `ssr = false` — and SvelteKit emits no policy at all for such
// a route, in any mode: measured in production, /chat and /auth had neither a meta tag
// nor a header. That left the half holding every document unprotected while the half
// holding nothing was covered.
//
// SvelteKit applies it twice from this one list, and the two forms differ: a hash per
// page stamped into a meta tag for the prerendered pages, and a header carrying a
// per-response nonce for everything the worker renders. Worth knowing before reading
// /chat and concluding it has no policy, because the meta tag genuinely is absent
// there — the header is not.
// SvelteKit declares CspDirectives but does not export it, so the shape is taken
// from the option it is passed to. Extracting it that way means an upgrade that
// changes the contract is a type error here rather than a surprise at runtime.
import type { Config } from '@sveltejs/kit';

type CspDirectives = NonNullable<NonNullable<NonNullable<Config['kit']>['csp']>['directives']>;

/** mode-watcher's inline script, which applies the stored theme before the first
 * paint. SvelteKit hashes what it generates and this is not one of those, and the
 * prerendered pages cannot carry a nonce because their HTML is a static file shared
 * by every reader. `scripts/check-csp.mjs` fails the build if this stops matching. */
const THEME_SCRIPT_HASH = 'sha256-Cr3r+iKjDTUxJaxM3r/Iq0ow6clOB9AqoT6j0wMFMIM=';

/** The analytics beacon's origin, allow-listed only when this build actually
 * ships a beacon.
 *
 * SvelteKit applies one policy to the whole app — `kit.csp` has no per-route
 * form — so the origin cannot be granted to the marketing pages alone while
 * /chat, which holds every document, is denied it. What can be avoided is
 * granting it to builds that never load the beacon at all: a self-hosted build,
 * or any build made without a site token, gets a policy with no third-party
 * script origin in it. The hosted build still carries the permission app-wide,
 * which is the residual SvelteKit forces on us; 'self' and the script hashes
 * remain the actual defence. */
const ANALYTICS_ORIGINS: NonNullable<CspDirectives['script-src']> = process.env
	.PUBLIC_CF_WEB_ANALYTICS_TOKEN
	? ['https://static.cloudflareinsights.com']
	: [];

export const CSP_DIRECTIVES: CspDirectives = {
	'default-src': ['self'],
	// wasm-unsafe-eval compiles the WebAssembly this app is built on: the SQLite
	// build, the embedding runtime, OCR and the local model. Without it nothing runs.
	// The analytics origin is present only in a build that ships the beacon
	// (see ANALYTICS_ORIGINS above); the app shell never loads it either way.
	'script-src': ['self', 'wasm-unsafe-eval', THEME_SCRIPT_HASH, ...ANALYTICS_ORIGINS],
	// Two of the runtimes we depend on instantiate their workers from blob URLs.
	'worker-src': ['self', 'blob:'],
	// Inline style attributes carry computed geometry in a few places: the flow
	// connector's delay, the selected mode card's grid column.
	'style-src': ['self', 'unsafe-inline'],
	'img-src': ['self', 'data:', 'blob:'],
	'font-src': ['self'],
	// Open by necessity, and the one directive that cannot be tightened: the Your
	// server mode dials an address the reader types in, usually their own machine on a
	// port only they know, so no origin list can be right. http: is there for exactly
	// that, since a local server rarely has TLS. Model weights and cloud answers both
	// go through this origin.
	'connect-src': ['self', 'https:', 'http:', 'ws:', 'wss:'],
	'object-src': ['none'],
	'base-uri': ['self'],
	'form-action': ['self'],
	// Only meaningful in the header form, which is what SvelteKit sends for the pages
	// the worker renders; it is dropped from the meta tag on the prerendered ones.
	// Nothing embeds this app, and saying so is the cheapest clickjacking defence.
	'frame-ancestors': ['none']
};

// Namespace import, not `{ PUBLIC_CF_WEB_ANALYTICS_TOKEN }`: a named import of
// a variable that is not set is a build error, which would break every
// self-hosted build that has no analytics token. Reading it off the namespace
// yields undefined instead, and the beacon simply never renders.
import * as publicEnv from '$env/static/public';

/**
 * Cloudflare Web Analytics site token (not a secret: it ships in the page, in
 * the beacon's data attribute). The beacon counts anonymous, cookieless page
 * views and only the public marketing pages load it, and only when a token is
 * configured. The app shell never includes it, so document content, chats,
 * answers and filenames never reach any analytics service.
 *
 * The hosted deployment sets PUBLIC_CF_WEB_ANALYTICS_TOKEN; a self-hosted
 * build without it ships no beacon at all.
 *
 * Static, not `$env/dynamic/public`, and the distinction is the whole point.
 * The marketing pages are prerendered: a dynamic read is baked into the static
 * HTML at build time, but the browser re-reads it at hydration from the
 * worker's own environment (`/_app/env.js`), where this variable does not
 * exist. Svelte then saw a falsy token and REMOVED the beacon it had just
 * shipped — measured 3/3 loads: tag gone from the DOM, `__cfBeacon` undefined,
 * zero page views recorded. A static read is inlined into both the HTML and
 * the client bundle, so the two agree and the tag stays (verified 3/3).
 */
export const WEB_ANALYTICS_TOKEN =
	(publicEnv as Record<string, string | undefined>).PUBLIC_CF_WEB_ANALYTICS_TOKEN ?? '';

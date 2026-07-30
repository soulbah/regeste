// What the installed app owns, decided in one place.
//
// The manifest scopes the PWA to /chat; this module makes the service worker
// agree. It lives outside service-worker.ts because that file imports
// `$service-worker` (build-time only) and so cannot be unit-tested, while these
// two predicates are exactly the logic worth protecting: a catch-all navigation
// handler once answered every route from the chat shell, which replaced the
// landing page with the app for every returning visitor.

/** The app shell's route, matching `start_url` and `scope` in the manifest. */
export const APP_SCOPE = '/chat';

/**
 * True when a navigation belongs to the installed app. Everything else — the
 * landing, how-it-works, the guides, sign-in — is a web page and goes to the
 * network, so it is never shadowed by a cached shell.
 */
export function isAppNavigation(pathname: string): boolean {
	return pathname === APP_SCOPE || pathname.startsWith(`${APP_SCOPE}/`);
}

/**
 * True for files only the marketing pages and the capture stage request. The
 * installed app is the chat; caching megabytes of hero video and fixture PDFs
 * it will never play would make the install heavier than the product.
 */
export function isMarketingAsset(pathname: string): boolean {
	return pathname.startsWith('/landing/') || pathname.startsWith('/dev/');
}

/**
 * True for the pages under `src/routes/(marketing)` — the landing, how-it-works
 * and the guides. None of them may open the local database: it is single-owner,
 * so a visitor reading a guide would take the lock and trip the two-tabs guard
 * on the app running in their other tab. Sign-in is deliberately absent: it
 * reads the session, so it boots like an app route.
 */
export function isMarketingPage(pathname: string): boolean {
	return (
		pathname === '/' ||
		pathname === '/how-it-works' ||
		pathname === '/privacy' ||
		pathname.startsWith('/help')
	);
}

// Marketing pages reached from inside the app open in a new tab.
//
// The reason is not politeness, it is state. The app is one long-lived page: a
// chat in progress, an in-memory index, a composer half typed, and the
// single-owner database lock. Navigating away tears all of that down and pays
// for the boot again on the way back. And the service worker deliberately does
// not claim these routes (see $lib/pwa/sw-routing.ts): inside an installed PWA an
// in-place navigation to /how-it-works walks out of the app shell altogether.
//
// One helper and one prop bag so all five entry points behave the same and
// cannot drift apart.

/** For anything that navigates imperatively (a menu item, a toast action). */
export function openInNewTab(url: string): void {
	window.open(url, '_blank', 'noopener');
}

/** For anything that is already a link. */
export const NEW_TAB = { target: '_blank', rel: 'noopener' } as const;

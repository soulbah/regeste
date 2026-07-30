import type { Locale } from '$lib/i18n/index.svelte';

// Static HTML per URL and per language. Prerendering also settles the one
// question a request-time render leaves open: the dictionary is a single module
// instance, and here it is written once per page in a build that renders them one
// after another, so no two languages can ever share a render.
export const prerender = true;

/** The locale is in the path, so it is known before anything renders.
 *
 * It used to be a query parameter applied by a browser-only $effect, which meant
 * the server rendered English for every request whatever the URL said. Google
 * indexed one language and folded the French alternates into it, so half the
 * content did not exist as far as search was concerned.
 *
 * English keeps the bare path and French sits under /fr. Returning it from a
 * universal load is what lets the layout set the dictionary synchronously at the
 * top of the render, which is the only place it is safe to do on a server that
 * shares one module instance between requests. */
export function load({ params }): { locale: Locale } {
	return { locale: params.lang === 'fr' ? 'fr' : 'en' };
}

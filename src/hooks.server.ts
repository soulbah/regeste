import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth } from '$lib/server/auth';
import { pickLocale } from '$lib/server/otp-email';
import { CANONICAL_ORIGIN } from '$lib/links';

/** One host, so there is one cookie jar.
 *
 * better-auth takes its baseURL from the request origin, which means a session
 * created on www.regeste.com is not sent to regeste.com: someone signs in, types
 * the address without the prefix later, and appears signed out with no
 * explanation. The apex is canonical, www redirects to it, and the redirect
 * happens before auth so no session is ever minted on the wrong host.
 *
 * 301 rather than 302: this is permanent, and it keeps search engines from
 * indexing both. */
const CANONICAL_HOST = new URL(CANONICAL_ORIGIN).hostname;

/** Local development is the one place cleartext is the real address.
 *
 * The host list is not enough on its own. `wrangler dev` serves the built worker over
 * http and rewrites the Location of a redirect back to http so local flows stay
 * local, so upgrading the scheme there points at the address we are already on: every
 * worker-served route looped, and `bun run preview` was unusable for anything but the
 * prerendered pages. An explicit port is the honest signal, since the deployed origin
 * never carries one. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const isLocal = (url: URL) => LOCAL_HOSTS.has(url.hostname) || url.port !== '';

/** One canonical origin: https, no www.
 *
 * The host half was there first. The scheme half was missing, and it mattered
 * more: http://regeste.com served the whole app with a 200, and better-auth
 * derives `useSecureCookies` from the protocol of the baseURL it is handed,
 * which is the request origin. So a sign-in over cleartext minted a session
 * cookie with no `Secure` flag, and that cookie then rode every later plain-http
 * request in the clear. Redirecting is the fix, not a nicety.
 *
 * Both corrections happen in one 301 so http://www never walks a redirect chain,
 * and both happen before auth so no session is ever minted on a wrong origin. */
export function canonicalRedirect(url: URL, forwardedProto: string | null): Response | null {
	if (isLocal(url)) return null;
	// Either signal saying http is enough, and neither is authoritative alone.
	// Cloudflare keeps the visitor's scheme on the request url but sends
	// `x-forwarded-proto: https`, describing its own leg to the Worker rather than
	// the visitor's: trusting the header first let cleartext through with a 200, and
	// http://www redirected to http://apex, cleartext the whole way. Other fronts
	// rewrite the url and put the truth in the header. Taking the union covers both,
	// and the self-redirect guard below is what makes a wrong signal harmless.
	const insecure = url.protocol === 'http:' || forwardedProto === 'http';
	const wrongHost = url.hostname === `www.${CANONICAL_HOST}`;
	if (!insecure && !wrongHost) return null;
	const target = new URL(url);
	if (insecure) target.protocol = 'https:';
	if (wrongHost) target.hostname = CANONICAL_HOST;
	// A redirect to the current address is an infinite loop, and this one would take
	// the whole site down rather than degrade it: a proxy that mislabels an https
	// request as http is all it takes. Comparing the target to the address we are on
	// costs nothing and makes that failure mode unreachable.
	if (target.href === url.href) return null;
	return new Response(null, { status: 301, headers: { location: target.href } });
}

/** The document language, which app.html templates as English for every page.
 *
 * A French page announcing lang="en" is read aloud with English phonetics by a
 * screen reader and counted as English by a crawler. Svelte 5.56 has no
 * <svelte:html>, and this is the only place that sees the finished document.
 *
 * Rewriting only French leaves a missed case as English, which is where it already
 * was, rather than shipping a literal placeholder. */
function localizeHtmlLang(pathname: string) {
	if (pathname !== '/fr' && !pathname.startsWith('/fr/')) return undefined;
	return ({ html }: { html: string }) => html.replace('<html lang="en"', '<html lang="fr"');
}

export const handle: Handle = async ({ event, resolve }) => {
	// The marketing pages are prerendered, so this branch is the only one that ever
	// renders them: the language has to be corrected here or nowhere.
	if (building) {
		const transformPageChunk = localizeHtmlLang(event.url.pathname);
		return resolve(event, transformPageChunk ? { transformPageChunk } : undefined);
	}
	const redirect = canonicalRedirect(
		event.url,
		event.request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? null
	);
	if (redirect) return redirect;
	// A prerendered page is a file. In production the asset store answers for it and
	// this Worker never sees the request, so nothing below has ever applied to the
	// marketing site. `vite dev` does route those requests through here, and the
	// binding lookup on the next line is what the adapter refuses inside a
	// prerenderable route — rightly, since a page rendered once at build time cannot
	// depend on anything per-request. The result was a 500 on every marketing URL
	// locally while production served them fine. Leaving early makes dev tell the
	// truth about what runs.
	if (event.route.id?.startsWith('/(marketing)')) return resolve(event);
	// The locale rides along so a sign-in code reaches someone in the language
	// they are reading the app in.
	const auth = createAuth(
		event.platform!.env,
		event.url.origin,
		pickLocale(event.request.headers.get('accept-language'))
	);
	event.locals.auth = auth;
	const response = await svelteKitHandler({ event, resolve, auth, building });
	// Cross-origin isolation (spec 018): unlocks SharedArrayBuffer, which the
	// wllama CPU fallback needs for multithreading. `credentialless` keeps
	// cross-origin model downloads (CORS-served CDNs) working. Auth is
	// fetch/redirect based, so COOP costs nothing — popup flows are the only
	// casualty and we don't use any.
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
	// Two one-line defaults a header scanner flags by their absence. nosniff stops a
	// browser guessing a content type we did not send; the referrer policy is the
	// browser's own default in Chrome and Firefox, written down so it does not
	// depend on which browser someone reads this in — an outbound request from a
	// help page should not carry the path of the page it left.
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	// The redirect above closes the door; this one keeps a browser from knocking on
	// it again. Without it, every first visit of the day is one cleartext request
	// before the 301, and that request is where a session cookie would be readable.
	// A year is the usual figure. No `preload`: that is a submission to a list
	// browsers ship in their binaries, and it is not ours to make on the owner's
	// behalf.
	if (!isLocal(event.url)) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	return response;
};

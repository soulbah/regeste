import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth } from '$lib/server/auth';
import { pickLocale } from '$lib/server/otp-email';

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
const CANONICAL_HOST = 'regeste.com';

export const handle: Handle = async ({ event, resolve }) => {
	if (building) {
		return resolve(event);
	}
	if (event.url.hostname === `www.${CANONICAL_HOST}`) {
		const url = new URL(event.url);
		url.hostname = CANONICAL_HOST;
		return new Response(null, { status: 301, headers: { location: url.toString() } });
	}
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
	return response;
};

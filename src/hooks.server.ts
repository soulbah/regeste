import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	if (building) {
		return resolve(event);
	}
	const auth = createAuth(event.platform!.env, event.url.origin);
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

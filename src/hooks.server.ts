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
	return svelteKitHandler({ event, resolve, auth, building });
};

// Settings moved into a modal (spec 021); the old URL redirects home.
import { redirect } from '@sveltejs/kit';

export function load(): never {
	redirect(302, '/chat');
}

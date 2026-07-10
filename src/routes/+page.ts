// Root is reserved for the landing/marketing site (owner decision, spec 020).
// Until it exists, the app lives at /chat.
import { redirect } from '@sveltejs/kit';

export function load(): never {
	redirect(302, '/chat');
}

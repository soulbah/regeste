import { socialProvidersAvailable } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

// Which social buttons this deployment can honour, decided on the server because
// the credentials are secrets and the page must not guess. A build without them
// shows the button disabled with the reason, rather than sending someone into a
// redirect that ends on the provider's error page.
export const load: PageServerLoad = ({ platform }) =>
	platform ? socialProvidersAvailable(platform.env) : { google: false, github: false };

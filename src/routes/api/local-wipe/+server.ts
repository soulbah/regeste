import { error, json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';

const BodySchema = v.object({
	confirm: v.literal('erase-local-data')
});

/**
 * Browser-native panic wipe.
 *
 * Clear-Site-Data clears every browser-managed store for this origin. Cookies
 * are deliberately omitted: documents and local settings disappear, while the
 * account session survives exactly as the confirmation promises. The app
 * isolates this request in its wipe-only boot, stops inference first, then
 * performs a full navigation. We therefore avoid the experimental
 * executionContexts directive, whose forced reload can re-enter the wipe URL.
 *
 * JSON plus a same-origin fetch check prevents a cross-site form from turning
 * this endpoint into a drive-by local-data wipe. No user content reaches it.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const fetchSite = request.headers.get('sec-fetch-site');
	const origin = request.headers.get('origin');
	if ((fetchSite && fetchSite !== 'same-origin') || (origin && origin !== url.origin)) {
		throw error(403, 'Same-origin request required');
	}

	const parsed = v.safeParse(BodySchema, await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid request');

	return json(
		{ ok: true },
		{
			headers: {
				'cache-control': 'no-store',
				'clear-site-data': '"cache", "storage"'
			}
		}
	);
};

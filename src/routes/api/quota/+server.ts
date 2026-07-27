// Read-only view of today's Cloud budget, for the settings gauge and the
// model picker. Session required; a neuron total and a count, never content
// (constitution §1).

import { error, json } from '@sveltejs/kit';
import { drizzle } from 'drizzle-orm/d1';
import { readQuota } from '$lib/server/quota';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals, platform }) => {
	const session = await locals.auth.api.getSession({ headers: request.headers });
	if (!session) throw error(401, 'Sign in required');

	const quota = await readQuota(drizzle(platform!.env.DB), session.user.id);
	// The client turns what is left into a number of answers, per model, using
	// the shared catalogue. The platform's own unit never reaches a screen.
	return json(quota);
};

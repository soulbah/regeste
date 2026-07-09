// R5 (spec 015): read-only Assisted quota for the settings gauge.
// Session required; counts only — never content (constitution §1).

import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { quotaUsage } from '$lib/server/db/schema';
import { MONTHLY_LIMIT } from '$lib/server/quota';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals, platform }) => {
	const session = await locals.auth.api.getSession({ headers: request.headers });
	if (!session) throw error(401, 'Sign in required');

	const db = drizzle(platform!.env.DB);
	const month = new Date().toISOString().slice(0, 7);
	const rows = await db
		.select()
		.from(quotaUsage)
		.where(and(eq(quotaUsage.userId, session.user.id), eq(quotaUsage.month, month)));

	return json({ used: rows[0]?.requests ?? 0, limit: MONTHLY_LIMIT });
};

import { and, eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { quotaUsage } from './db/schema';

/**
 * What one signed-in person may spend on the maintainer's account per day.
 *
 * Cloudflare's free allocation is 10,000 neurons a day for the whole account,
 * so this figure is what decides how many people that allocation covers before
 * the account starts paying $0.011 per 1,000 neurons. At 3,000 it buys roughly
 * a hundred answers on the default model, which is a generous day of document
 * questions, and three such users fit inside the free tier.
 *
 * Content never touches this table: it holds a neuron total and a count.
 */
export const DAILY_NEURONS = 3000;

/** UTC day, matching the platform's own 00:00 UTC reset. */
export function currentDay(): string {
	return new Date().toISOString().slice(0, 10);
}

export interface QuotaState {
	used: number;
	limit: number;
	remaining: number;
}

/**
 * What is left today, without spending anything.
 *
 * The check has to happen before the model runs, and the charge after, because
 * the true cost is only known once Workers AI reports the tokens it used.
 * A request is admitted whenever any budget remains: refusing on an estimate
 * would deny answers a user has in fact paid for, and one answer of overshoot
 * is cheaper than that unfairness.
 */
export async function readQuota(
	db: DrizzleD1Database<Record<string, unknown>>,
	userId: string
): Promise<QuotaState> {
	const rows = await db
		.select()
		.from(quotaUsage)
		.where(and(eq(quotaUsage.userId, userId), eq(quotaUsage.day, currentDay())));
	const used = rows[0]?.neurons ?? 0;
	return { used, limit: DAILY_NEURONS, remaining: Math.max(0, DAILY_NEURONS - used) };
}

/** Charge what the answer actually cost. */
export async function chargeQuota(
	db: DrizzleD1Database<Record<string, unknown>>,
	userId: string,
	neurons: number
): Promise<QuotaState> {
	const day = currentDay();
	// One statement, so two answers finishing together cannot both read the old
	// total and write the same new one.
	await db
		.insert(quotaUsage)
		.values({
			id: crypto.randomUUID(),
			userId,
			day,
			neurons,
			requests: 1,
			// Still NOT NULL from the monthly scheme this replaces; written so the
			// migration could add columns without dropping any.
			month: day.slice(0, 7),
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: [quotaUsage.userId, quotaUsage.day],
			set: {
				neurons: sql`${quotaUsage.neurons} + ${neurons}`,
				requests: sql`${quotaUsage.requests} + 1`,
				updatedAt: new Date()
			}
		});
	return readQuota(db, userId);
}

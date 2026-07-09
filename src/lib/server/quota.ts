import { and, eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { quotaUsage } from './db/schema';

// Flat monthly limit while the product has no plans. Content never touches
// this table — it counts requests only (constitution §1).
export const MONTHLY_LIMIT = 200;

export async function checkAndIncrementQuota(
	db: DrizzleD1Database<Record<string, unknown>>,
	userId: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
	const month = new Date().toISOString().slice(0, 7); // YYYY-MM
	const rows = await db
		.select()
		.from(quotaUsage)
		.where(and(eq(quotaUsage.userId, userId), eq(quotaUsage.month, month)));
	const used = rows[0]?.requests ?? 0;
	if (used >= MONTHLY_LIMIT) {
		return { allowed: false, used, limit: MONTHLY_LIMIT };
	}
	if (rows.length === 0) {
		await db.insert(quotaUsage).values({
			id: crypto.randomUUID(),
			userId,
			month,
			requests: 1,
			updatedAt: new Date()
		});
	} else {
		await db
			.update(quotaUsage)
			.set({ requests: sql`${quotaUsage.requests} + 1`, updatedAt: new Date() })
			.where(and(eq(quotaUsage.userId, userId), eq(quotaUsage.month, month)));
	}
	return { allowed: true, used: used + 1, limit: MONTHLY_LIMIT };
}

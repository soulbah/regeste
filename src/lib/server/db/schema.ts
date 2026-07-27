import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ── better-auth core tables (shape required by better-auth v1.6) ────────────
// The remote database only ever stores identity, plan and quota data.
// Documents, chats, messages, chunks and embeddings live in the browser. Never add them here.

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	token: text('token').notNull().unique(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

export const account = sqliteTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
	refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
	scope: text('scope'),
	password: text('password'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
});

// ── Quotas (Cloud mode) ──────────────────────────────────────────────────────
// One row per user per day, written in the same request that serves the call.
//
// Neurons, not requests. Cloudflare bills and rate-limits Workers AI in
// neurons, and the models on offer differ by a factor of four per answer, so a
// request count would charge the same for a cheap answer and an expensive one
// and make the model picker meaningless. Counting the unit the platform counts
// keeps the budget honest in both directions.
//
// Daily, not monthly, because the free allocation resets daily at 00:00 UTC: a
// monthly window lets one afternoon exhaust an allowance that had already come
// back. Still no content: a neuron total says nothing about a document.

export const quotaUsage = sqliteTable(
	'quota_usage',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		day: text('day').notNull().default(''), // 'YYYY-MM-DD' UTC, the platform's own reset
		/** Cloudflare's billing unit for Workers AI. Never shown to a user: the
		 * interface speaks in answers, which is the only unit that needs no
		 * explaining and that changes visibly when a cheaper model is picked. */
		neurons: integer('neurons').notNull().default(0),
		requests: integer('requests').notNull().default(0),
		/** Kept from the monthly scheme so this migration adds and never drops.
		 * Written but no longer read. */
		month: text('month').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [uniqueIndex('quota_usage_user_day').on(t.userId, t.day)]
);

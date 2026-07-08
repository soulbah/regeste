import { defineConfig } from 'drizzle-kit';

// Migrations are applied with `wrangler d1 migrations apply`, never `drizzle-kit push`.
// The d1-http driver block (accountId/databaseId/token) is only needed for
// `drizzle-kit studio` against the remote database — add it locally via env vars.
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	out: './migrations'
});

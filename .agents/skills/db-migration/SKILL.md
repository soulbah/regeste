---
name: db-migration
description: Create and apply a D1 database migration with Drizzle. Use whenever src/lib/server/db/schema.ts changes.
---

# D1 migration procedure

Remember: the remote DB stores identity/plan/quota data only — never document or chat data (constitution §1).

1. Edit `src/lib/server/db/schema.ts`.
2. `bun run db:generate` — drizzle-kit writes a new SQL file into `migrations/`.
3. Review the generated SQL. D1 is SQLite: no `ALTER COLUMN`; destructive changes need a create-copy-drop dance — verify drizzle generated something sane.
4. `bun run db:migrate:local` — apply to the local miniflare DB.
5. Exercise one real query through the changed table (see the `verify` skill).
6. Commit schema + migration together.

Hard rules:

- **Never edit a committed migration** (hook-enforced) — write a new corrective migration instead.
- Never `drizzle-kit push` against remote. Remote applies happen in CI/deploy via `wrangler d1 migrations apply folio-db --remote`.
- better-auth tables (`user`, `session`, `account`, `verification`) must keep the shape better-auth expects — check better-auth docs before touching them.

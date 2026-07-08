---
paths:
  - 'src/routes/api/**'
  - 'src/lib/server/**'
  - 'src/hooks.server.ts'
  - 'wrangler.jsonc'
  - 'migrations/**'
---

# Server rules (Cloudflare Worker)

- Bindings only exist per request: access them via `event.platform.env`, never at module top level. Rebuild per-request objects (auth, drizzle) in `hooks.server.ts` or the endpoint.
- After changing `wrangler.jsonc`, run `bun run cf:types` and commit the regenerated `worker-configuration.d.ts`.
- **Privacy invariants (the product's core promise):**
  - The D1 database stores identity, plan and quota data ONLY. Adding any table/column for documents, chats, messages, chunks, embeddings or filenames is an automatic task failure — no exceptions without an owner-approved change to `docs/constitution.md`.
  - Never `console.log` request bodies, excerpts, questions or any user content in the Assisted path. Log counts and durations, not content.
  - Workers AI calls go through AI Gateway with logging disabled (`collectLog: false`) or metadata-only.
- Every endpoint validates its input with valibot (`v.safeParse`) before touching it; return 400 on failure. No `any` at boundaries.
- D1: prepared statements via drizzle only — no string interpolation into SQL, ever.
- Migrations: `bun run db:generate` then `bun run db:migrate:local`; applied migrations are append-only (hook-enforced). Never `drizzle-kit push` against remote.
- Cloudflare-first: need infra (email, rate limit, captcha, analytics, storage)? Check Cloudflare's offering before any third-party dependency. Check https://developers.cloudflare.com/llms.txt — training data about CF is stale.
- Secrets via `wrangler secret put` + `.dev.vars` locally (never committed, never written by agents).

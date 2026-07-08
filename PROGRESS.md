# Progress

Canonical project state. Read this first; update it (status table + one log line) in the same change as each completed task.

## Roadmap

| Spec | Name                                                                   | Status      |
| ---- | ---------------------------------------------------------------------- | ----------- |
| 001  | Foundation (this scaffold)                                             | done        |
| 002  | Local DB + document pipeline (milestone 0: validate browser perf bets) | done        |
| 003  | Chat UI shell                                                          | not started |
| 004  | Private mode (WebLLM/wllama tiers)                                     | not started |
| 005  | Auth + Assisted endpoint                                               | not started |
| —    | Open-source launch prep (checklist: docs/internal/OSS-LAUNCH.md)       | later       |

## Log

- 2026-07-08 — Repo scaffolded: SvelteKit + Tailwind v4 + shadcn-svelte (sera preset), Cloudflare adapter + wrangler, drizzle + better-auth + valibot, agent harness (AGENTS.md, hooks, skills, specs).
- 2026-07-08 — Switched to bun; fixed better-auth 404 (baseURL now derived from request origin) and zod v3/v4 hoisting conflict (direct zod@^4 dep); auth signup/session verified against local D1 through wrangler dev; `bun run verify` + knip green.
- 2026-07-08 — Spec 002 done: SQLite WASM (vec0 + FTS5, opfs-sahpool) in a dedicated worker with versioned local schema; parse (pdf.js/mammoth/md) → structure-aware chunking → transformers.js embeddings (multilingual-e5-small q8) → hybrid RRF search. Verified end-to-end in Chromium: FR semantic queries 112–173 ms, OPFS persistence across reloads, hash dedup, scanned-PDF honest error. **Milestone-0 bets validated.** Gotcha: sqlite-vec-wasm-demo ≥0.1.9 builds are broken — pinned 0.1.7-alpha.2, loaded verbatim from static/vendor (never bundled).

# Progress

Canonical project state. Read this first; update it (status table + one log line) in the same change as each completed task.

## Roadmap

| Spec | Name                                                                   | Status      |
| ---- | ---------------------------------------------------------------------- | ----------- |
| 001  | Foundation (this scaffold)                                             | in progress |
| 002  | Local DB + document pipeline (milestone 0: validate browser perf bets) | not started |
| 003  | Chat UI shell                                                          | not started |
| 004  | Private mode (WebLLM/wllama tiers)                                     | not started |
| 005  | Auth + Assisted endpoint                                               | not started |
| —    | Open-source launch prep (checklist: docs/internal/OSS-LAUNCH.md)       | later       |

## Log

- 2026-07-08 — Repo scaffolded: SvelteKit + Tailwind v4 + shadcn-svelte (sera preset), Cloudflare adapter + wrangler, drizzle + better-auth + valibot, agent harness (AGENTS.md, hooks, skills, specs).
- 2026-07-08 — Switched to bun; fixed better-auth 404 (baseURL now derived from request origin) and zod v3/v4 hoisting conflict (direct zod@^4 dep); auth signup/session verified against local D1 through wrangler dev; `bun run verify` + knip green.

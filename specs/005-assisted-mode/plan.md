# Plan 005 — Accounts and Assisted mode

## Architecture

```
server (the Worker)
  src/routes/api/assisted/+server.ts — POST: valibot → session → quota (D1) → Workers AI stream (SSE)
  src/lib/server/quota.ts            — get/increment monthly counter (drizzle)
client
  src/lib/state/session.svelte.ts    — better-auth client session state
  src/routes/account/+page.svelte    — sign in / sign up (superforms not needed: two fields)
  src/lib/state/chats.svelte.ts      — assisted branch: preview gate → fetch SSE → persist + events
  src/lib/components/presend-panel.svelte — right-panel view: excerpts w/ checkboxes, size, destination
  assisted turn rendering            — reuse private-turn + a "what AI saw" meta line
```

## Key decisions

- **Model**: `@cf/zai-org/glm-4.7-flash` (131k ctx, cheapest good tier). AI Gateway not wired yet
  (needs a gateway id in the dashboard) — direct `env.AI.run` with `returnRawResponse` SSE; gateway
  - collectLog:false is an OSS-launch/prod task tracked in OSS-LAUNCH.md.
- **Quota**: `quota_usage` row per (user, YYYY-MM); flat limit const (200/month) checked+incremented
  in the request. D1 row-level; no DO (per research: D1 is the right consistency tool here).
- **SSE relay**: Workers AI returns an SSE ReadableStream when `stream: true`; the endpoint pipes it
  through untouched; the client parses `data:` lines incrementally.
- **Session state**: better-auth svelte client (`useSession` store) wrapped in a runes module.
- **Preview**: right contextual panel swaps to review mode on every assisted send (owner rule: no dialogs there); bytes
  computed as UTF-8 length of the selected excerpt texts + question.
- **Trust**: the endpoint never logs bodies; only counts/duration go to console.
- Citations: same [n] mechanism as Private, resolved against the excerpts actually sent.

## Tradeoffs

- Flat quota constant instead of plans/entitlements — enough to prove the loop; billing comes with product launch.
- SSE parsing by hand (no eventsource lib) — the format is a stable one-liner.

# Spec 005 — Accounts and Assisted mode

## Why

Assisted is the monetizable trust boundary: local retrieval, only the relevant excerpts leave the device, our Worker + Workers AI answer. It requires identity (quotas). This is also where the signature transparency features become real: pre-send preview with excerpt exclusion (FEATURES P5/P6) and per-answer "what left the device" data (privacy_events with actual bytes).

## What

- WHEN a guest opens the account area THEN they SHALL be able to sign up / sign in (email+password, better-auth) without any local data leaving the device; the sidebar footer reflects the session.
- WHEN a signed-in user selects Assisted THEN the mode SHALL be selectable; guests keep the locked "Sign in required" state with a working sign-in path.
- WHEN a question is sent in Assisted mode THEN the app SHALL show a pre-send preview — the exact excerpts about to leave (unchecking one excludes it), their total size, and the destination — and only send after confirmation. A "don't ask again" option persists per device.
- WHEN confirmed THEN the client SHALL POST question + selected excerpts to `/api/assisted`; the Worker SHALL validate input (valibot), require a session, enforce a monthly quota (D1), call Workers AI (glm-4.7-flash) and stream the answer back (SSE) — never persisting or logging content.
- WHEN the answer streams THEN it SHALL render like Private answers (citations [n] validated against the sent excerpts) and write a privacy_event: mode assisted, destination cloud, real excerpt count and bytes sent.
- WHEN an assisted answer exists THEN the message SHALL show a "What AI saw" line (N excerpts · X KB · Cloud AI) — the full panel arrives with the Privacy Report feature.
- WHEN the quota is exhausted THEN the endpoint SHALL return 429 and the UI SHALL say so plainly.
- The server SHALL CONTINUE TO store zero document/chat content (constitution §1) — the assisted request is transient.

## Out of scope

- My AI mode (own spec), OAuth providers, email verification (Email Service beta wiring later), password reset, pricing/credits UI (quota = flat monthly number for now), full What-AI-saw panel + Privacy Report page, Turnstile.

## Open questions

None.

## Verification

1. `bun run verify` green (incl. endpoint validation unit tests if feasible).
2. Browser + `wrangler dev`: sign up → session visible in footer; Assisted unlocked in selector.
3. Assisted question → preview lists real excerpts with sizes; uncheck one → sent payload excludes it (verified via privacy_event byte count); answer streams with citations.
4. privacy_events row: assisted · cloud · correct excerpt count · bytes > 0.
5. Guest (signed out) → Assisted locked again; /api/assisted without session → 401; malformed body → 400.

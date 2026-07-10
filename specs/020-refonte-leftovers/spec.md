# Spec 020 — Refonte leftovers: /chat/* namespace, related questions, quote-reply

## Why

Three items the owner validated during the spec 019 design review but parked until the visual refonte landed: the route reorganization (app under `/chat/*`, root reserved for the future landing), related questions after answers (market pattern, guardrails arbitrated), and quote-to-reply from a text selection (Claude's "Reply"). Owner asked for completion before his review pass (2026-07-10).

## What

Routes:

- WHEN the user opens `/` THEN the app SHALL redirect to `/chat` (root stays free for the landing/marketing site).
- The app screens SHALL live under `/chat/*`: `/chat` (new chat), `/chat/[id]`, `/chat/documents`, `/chat/settings`, `/chat/privacy`, `/chat/account`. `/how-it-works` stays at the root (public explainer). `/api/*` unchanged.
- The app SHALL CONTINUE TO open the off-thread viewer Sheet only outside `/chat/[id]`, and every internal link/shortcut SHALL point at the new paths.

Related questions (guardrails from the validated report):

- WHEN an AI answer completes in Private or My AI mode THEN the app SHALL generate up to 3 follow-up questions locally (Private: on-device model; My AI: the user's own endpoint, same trust boundary as the answer itself) without delaying or blocking the answer.
- WHEN generation is slow, fails, or the mode is Assisted THEN the section SHALL stay absent — no spinner, no error (Assisted never gets a second cloud call without pre-send review).
- The questions SHALL render under the LAST answer only, as a "Related" list; clicking one sends it as a new message.

Answer versions (owner arbitration 2026-07-10: do it if the cost stays reasonable — it does, because Try again only ever targets the LAST answer, so no branch management):

- WHEN the user hits Try again THEN the previous answer SHALL be kept as an inactive version (local schema v8: version_group + active on messages) instead of being deleted; its citations, excerpts and privacy events stay attached.
- WHEN a turn has more than one version THEN its footer SHALL show ‹ n/N › navigation; switching displays that version (and the active version is what the conversation continues from).
- Search (FTS) SHALL only index the active version of a turn.

Quote-reply:

- WHEN the user selects text inside an AI answer THEN a small floating "Reply" affordance SHALL appear; activating it quotes the selection into the composer (markdown `>` quote) and focuses it.
- Touch/keyboard parity: the affordance is a real button; no hover-only path.

## Out of scope

- Brand/logo work (owner's call).
- Anything mobile (owner decision 2026-07-10: desktop focus for now).
- The landing page itself (root redirect only).

## Open questions

None blocking; version pagination escalated via the roadmap.

## Verification

- `bun run verify` green; `/` redirects to `/chat`; every sidebar/palette/settings link lands on the new paths; viewer Sheet still works from `/chat/documents` ⌘K hits.
- Against the My AI stub: answer completes, related questions appear under the last answer only, click sends; select answer text → Reply → composer holds the quote focused.

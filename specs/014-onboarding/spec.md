# Spec 014 — Onboarding (O1/O2, T3, R6)

## Why

FEATURES O1 (demo chat with fictional sample contracts FR/EN), O2 ("how it works" page with the pipeline schema), T3 (offline proof onboarding — the Secret Llama pattern), R6 (one-time consent the first time any data leaves the device via Assisted).

## What

- O1: the empty home state SHALL offer "Try with a sample contract": one click creates a chat with two bundled fictional documents (FR + EN rental contract), ingested like any upload; heading suggestions take over.
- O2: the how-it-works page SHALL show the pipeline schema (document → parsing → chunking → embeddings → local index; question → local search → passages → chosen mode → cited answer), built from plain markup.
- T3: how-it-works SHALL include the offline proof ("turn off Wi-Fi and ask again — Private keeps working"), and the home empty state SHALL carry the same one-liner.
- R6: WHEN a user sends their first Assisted request on this device THEN the pre-send review SHALL require a one-time explicit acknowledgment ("first time data leaves this device") before Send activates; acknowledged once, never asked again (device setting).
- The app SHALL CONTINUE TO pass `bun run verify`.

## Out of scope

- Guided multi-step tours, videos, sample PDFs (markdown samples say everything and keep the bundle light).

## Verification

1. Home → Try with a sample contract → chat with 2 docs ingesting → ready; suggestions appear; a question retrieves from the samples.
2. how-it-works shows the pipeline schema + offline proof; home shows the one-liner.
3. Fresh device (setting cleared): Assisted review shows the consent block, Send disabled until acknowledged; after acknowledging once it never reappears.
4. `bun run verify` exits 0.

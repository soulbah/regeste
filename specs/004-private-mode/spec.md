# Spec 004 — Private mode (on-device AI)

## Why

Private is the product's flagship trust boundary: answers generated on-device, nothing leaves the browser. Milestone-0 bet #2 (small-model citation quality) gets its real test here. Stack and tiers were decided in docs/internal/RESEARCH-2026-07-stack.md §2; zero-jargon UX in FEATURES §5bis.

## What

- WHEN the app starts THEN it SHALL detect device capability (WebGPU adapter, shader-f16, memory signals) and map it to a model tier — without ever showing tier/model jargon in the main flow.
- WHEN a user selects Private for the first time THEN the mode selector SHALL show a plain-language preparation card ("one-time download of ~X GB, then works offline") and require an explicit click before any download starts.
- WHEN the model downloads THEN progress SHALL be visible (percent) in the mode selector surface; the download is cached (Cache API/OPFS) — a later session shows "Private AI · ready" without re-downloading.
- WHEN a question is sent in Private mode with ready documents THEN the app SHALL retrieve passages locally, generate an answer on-device grounded on numbered excerpts, stream tokens into the thread, and render citation markers [n] resolved against the retrieved set — invalid citation numbers are dropped.
- WHEN the retrieved passages don't support an answer THEN the reply SHALL say it couldn't find enough information in the documents.
- WHEN generation runs THEN a Stop button SHALL abort it, keeping the partial text.
- WHEN the device cannot run any tier (no WebGPU and weak CPU) THEN Private SHALL show an honest "unavailable on this device" state instead of failing silently.
- The privacy_events table SHALL record one event per Private answer with destination 'device' and 0 bytes sent.
- The app SHALL CONTINUE TO pass `bun run verify`; retrieval-preview turns remain for chats without AI (mode selector still gates Assisted/My AI).

## Out of scope

- Assisted & My AI execution (005), What AI saw panel (005 — needs the cross-mode event data), tier 0 Chrome Prompt API, model manager settings screen (M1), device benchmark (M2), 8B opt-in tier.

## Open questions

None.

## Verification

1. `bun run verify` green.
2. Browser: select Private → preparation card with size → accept → progress → ready; reload → still ready (cache hit).
3. Ask a question on the sample contract → streamed answer with [n] citations resolving to real passages; irrelevant question → "not enough information" style reply.
4. Stop button aborts mid-generation.
5. privacy_events row per answer (mode private, destination device, 0 bytes).

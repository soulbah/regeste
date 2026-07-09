# Spec 013 — Model management (M1-M3)

## Why

FEATURES M1 (downloaded-models screen with sizes + delete — needed anyway for embedding-model changes), M2 ("test my device": short generation → tok/s + plain recommendation), M3 (compatibility badge — and the 5th UI decision: a dynamic "Best for this device" badge in the mode selector, justified by a technical fact, never a static "Recommended").

## What

- Settings SHALL gain an "AI models on this device" section (advanced): every cached model (WebLLM weights + embedding model caches) with its size and a delete action; deleting the prepared Private model resets Private to needs-download.
- M2: WHEN the Private engine is ready THEN "Test my device" SHALL run a short fixed generation, report tokens/second in plain language, and recommend Private or Assisted based on the result (justified by the number).
- M3: the mode selector SHALL show a "Best for this device" badge — on Private when the device can run it (WebGPU tier found), on Assisted otherwise — always with the technical reason.
- The app SHALL CONTINUE TO pass `bun run verify`; deleting caches never touches documents/chats.

## Out of scope

- Manual tier override (Advanced settings, later), wllama fallback, model re-downloads UI beyond re-prepare.

## Verification

1. Settings lists cached model storage with sizes after preparing Private (or the embedding cache from ingest); delete removes it and storage usage drops; Private returns to needs-download when its weights were deleted.
2. With the engine ready: Test my device shows tok/s and a recommendation. (If no WebGPU in the test browser: button honestly disabled — state visible.)
3. Mode selector shows Best-for-this-device on the right row with a reason.
4. `bun run verify` exits 0.

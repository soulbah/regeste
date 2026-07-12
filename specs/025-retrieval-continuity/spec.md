# Spec 025 — Retrieval continuity and responsive Private answers

## Why

Folio can retrieve isolated facts quickly, but follow-up questions lose their conversational referent,
long scanned documents can surface unrelated early-page passages, and simple Private answers remain
slower and less natural than expected. This weakens core grounded chat, citations, What AI saw, OCR,
and model-management behavior from PRD §§3, 6, 10 and FEATURES MVP, P8/P9, D3, M1-M3.

## What

- WHEN a question refers to an earlier turn with terms such as “son”, “lui”, or “ce destinataire” THEN
  the app SHALL use recent conversation context to retrieve and answer about the intended entity while
  continuing to ground every factual claim in current document passages.
- WHEN retrieval finds broad lexical and semantic candidates THEN the app SHALL refine them locally,
  include useful neighboring context, remove redundant results, and prefer passages covering the
  question's discriminating terms and entities.
- WHEN a long scanned document is ready THEN passages from every successfully recognized page SHALL
  remain eligible, with no preference for early pages caused by page order.
- WHEN no refined passage is sufficiently relevant THEN the app SHALL expose weak matches and refuse
  unsupported claims instead of manufacturing an answer.
- WHEN Private was already prepared and the browser keeps its background inference worker alive THEN
  a page refresh SHALL reuse that loaded engine; WHEN the browser has stopped it THEN the app SHALL
  reload from the local model cache without downloading the weights again.
- WHEN a question asks for one name, number, date, amount, or other short fact THEN the answer SHALL be
  direct and natural, without redundant aliases, reasoning preambles, or unnecessary explanation.
- WHEN Private generates a simple factual answer THEN it SHALL use a smaller output budget than a
  synthesis while preserving streaming, citations, Stop, and honest failure behavior.
- Assisted mode SHALL CONTINUE TO show every excerpt and any conversation context that will leave the
  device before the user confirms the send.
- The app SHALL CONTINUE TO keep documents, OCR text, retrieval processing, Private conversation
  context, and model inference on-device.

## Out of scope

- Downloading a dedicated cross-encoder reranker before browser benchmarks prove the lightweight
  refinement insufficient.
- Persisting raw model KV caches or hidden reasoning.
- Guaranteeing an in-memory engine after the browser or operating system terminates its worker.
- General coreference resolution across an unlimited conversation history.

## Open questions

None. Owner approved every perimeter and requested additional retrieval refinement on 2026-07-12.

## Verification

1. Unit tests cover contextual follow-ups, entity-preserving refinement, neighboring chunks,
   redundancy control, weak-match behavior, and adaptive generation budgets in French and English.
2. A synthetic 30-page scanned-document corpus places the answer after page 20 and competing
   sender/recipient facts near the beginning. Retrieval returns the late correct passage in its final
   set and does not select the sender for a recipient follow-up.
3. In a Private chat, ask who the recipient is, then ask for their number. The second answer identifies
   the same recipient, cites the supporting passage, and uses one direct sentence.
4. Prepare Private, refresh, and verify the background engine is reused when alive; terminate it and
   verify a cache reload succeeds without a model-weight network transfer.
5. `bun run verify` exits 0 and the affected flow is exercised in Chromium without console errors.

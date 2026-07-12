# Plan 025 — Retrieval continuity and responsive Private answers

## Contextual retrieval

- Build a bounded local retrieval context from the latest user/assistant exchange. Strip citation
  markers and cap length; current question remains distinct.
- Embed a standalone search representation containing prior question, prior grounded answer, and
  follow-up. Pass the same bounded context to generation as non-source context so pronouns resolve
  without letting prior answers become evidence.
- Assisted includes this context in the pre-send review and request only after explicit confirmation.

## Refinement

- Keep existing scoped 80+80 lexical/vector candidate search. Replace rank-only top-8 fusion with a
  lightweight rerank using normalized semantic similarity, lexical rank, query-token coverage, and
  extra weight for discriminating proper names/numbers from conversation context.
- Fetch immediate neighbors for leading candidates, score them with the same query, and retain them
  only when they add useful context. Remove near-duplicate text and cap repeated page/section results.
- Return calibrated final scores used by existing weak-match UI. Add a 30-page regression corpus with
  conflicting early-page roles and a late-page answer.

## Private engine and generation

- Use WebLLM's installed Service Worker engine/handler for WebGPU tiers, with heartbeat and recovery to
  the existing cached-load path in production. Development keeps the Dedicated Worker so Vite hot
  reload remains untouched. Keep wllama on its current worker because WebLLM's handler does not cover
  that runtime.
- Make generation options carry an output-token budget. Targeted factual questions use a short budget;
  synthesis keeps the larger budget. Tighten grounded prompt with direct-answer rules and examples.

## Tradeoffs

- No cross-encoder download yet: existing embeddings plus local scoring stay fast, private, and small.
- Recent bounded context beats full-history stuffing: less latency, less prompt confusion, and explicit
  egress remains understandable in Assisted.
- Service Workers improve warm refreshes but browser lifecycle remains authoritative; cache reload is
  mandatory fallback.
- This is not a PWA: no manifest, install flow, fetch interception, or app-shell cache. Full PWA work
  remains deferred until the development phase no longer prioritizes hot reload.

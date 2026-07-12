# Spec 028 — Semantic query understanding

## Why

Folio can retrieve noisy passages well, but query routing still depends on overlapping phrase regexes.
Equivalent requests may therefore select different execution paths and financial roles. This undermines
the PRD's cited-answer and honest-failure requirements, P8 relevance honesty, and R4 bilingual behavior.

## What

- WHEN a user asks a document question THEN the app SHALL parse one structured semantic frame containing
  intent, operation, requested measure/role, scope, temporal/identifier slots, confidence and ambiguity.
- WHEN dates, amounts, currencies, pages, record identifiers or explicit references appear THEN the app
  SHALL extract them deterministically without asking a model to rewrite source text.
- WHEN surface wording varies through paraphrase, synonym, morphology, casing, punctuation, common typo
  or French/English translation THEN equivalent questions SHALL produce invariant frames and execution.
- WHEN deterministic signals are insufficient THEN the app SHALL use the already-installed multilingual
  embedding engine against local versioned intent prototypes, without network or new model download.
- WHEN rule and semantic evidence agree confidently THEN the app SHALL execute the resolved targeted,
  synthesis or aggregate path.
- WHEN scope or requested financial measure remains materially ambiguous THEN the app SHALL ask one short
  clarification and SHALL apply the answer to the original question after reload as well as in-session.
- WHEN a request is outside specialized deterministic analytics THEN the app SHALL fall back to grounded
  targeted/synthesis retrieval rather than forcing the closest aggregate intent.
- WHEN a financial role is resolved THEN retrieval, deterministic calculation and generation SHALL keep
  sent, received, fee, tax, subtotal and debited/total values distinct.
- The app SHALL CONTINUE TO keep query text, prototypes, embeddings, frames and clarification state local.
- The app SHALL CONTINUE TO preserve exact identifiers, source text, citation offsets and specs 024–027
  retrieval/record metrics.
- The unused SQLite async OPFS VFS SHALL NOT request its proxy Worker when `opfs-sahpool` is selected.
- Generated related questions SHALL NOT crash rendering when repeated.

## Out of scope

- Training or fine-tuning a new intent model.
- Cloud classification, query telemetry or server persistence.
- Shipping Rasa, spaCy or Duckling runtimes; their architecture informs this browser-native implementation.
- Claiming calibrated probabilities outside the checked local corpus; confidence is bounded decision
  evidence with explicit thresholds and an honest clarification path.
- Replacing deterministic document-field extraction with generative structured extraction.

## Open questions

None. Owner explicitly authorized full research-led refactor and local quality cost on 2026-07-13.

## Verification

1. Run a behavior matrix with at least 300 FR/EN query cases covering minimum functionality,
   paraphrase/translation invariance, typos, punctuation/casing, negation, single-vs-collection scope,
   follow-ups, conflicts and out-of-scope hard negatives.
2. Report frame accuracy, route accuracy, slot F1/exact match, clarification precision/recall, invariance
   rate and semantic fallback latency. Route/role/scope critical cases SHALL reach 100%; overall frame
   exact match SHALL reach at least 95%.
3. Run every specs 024–027 unit/browser benchmark; clean retrieval, record execution, currency roles,
   complete evidence and citations SHALL remain 100%.
4. In a real chat, ask `Combien j'ai envoyé au total ?`; observe deterministic aggregate across every
   record. Ask a single transaction variant; observe targeted execution. Ask an ambiguous total, answer
   clarification after reload, and observe correct original-question execution.
5. Open a fresh browser session; confirm no console error, duplicate related-question crash or request for
   `sqlite3-opfs-async-proxy.js`.
6. Run `bun run verify`.

Never contains: implementation details (→ plan.md), task breakdown (→ tasks.md).

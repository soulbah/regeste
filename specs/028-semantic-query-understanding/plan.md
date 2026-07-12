# Plan 028 — Semantic query understanding

- Replace flat `QuestionAnalysis` logic with a typed `SemanticFrame`: intent, operation, financial role,
  structured scope, temporal/identifier slots, decision evidence, ambiguity and confidence band.
- Centralize normalized ontology features. Rules extract closed-form slots and high-precision anchors;
  they never enumerate whole user utterances.
- Add versioned bilingual prototypes. Use existing embedding worker only for low-confidence/conflicting
  frames; average normalized prototype vectors, cosine rank labels, require absolute score + margin.
- Keep synchronous parser for deterministic aggregation and tests; add async resolver at chat boundary.
- Persist clarification as a method kind. Forced follow-up context binds reply to original question across
  reload; no new database column or server state.
- Replace duplicated financial-role parsing in `money.ts` with shared ontology parser. Keep source-label
  classification separate because document labels and user intent are different domains.
- Generate deterministic CheckList-style behavior corpus and metrics under `src/lib/benchmark/`.
- Keep all new computation in browser workers. No dependency or model download added.
- Disable unused async OPFS VFS through build-supported worker URL flag; deduplicate related suggestions.

Never contains: product behavior (→ spec.md), progress tracking (→ tasks.md).

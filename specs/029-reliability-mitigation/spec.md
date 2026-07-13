# Spec 029 — Reliability mitigation

## Why

Spec 028 proved query routing on one local corpus and device profile, but its report named limits around
held-out validity, model-specific thresholds, clarification coverage, benchmark reproducibility, OCR
uncertainty and cross-device drift. Leaving those limits as prose would make later “100%” claims fragile.

## What

- WHEN semantic behavior is evaluated THEN base utterances SHALL be split into calibration and held-out
  groups before perturbations, so variants of one utterance cannot leak across both sets.
- WHEN a semantic model/profile is unknown THEN Folio SHALL abstain from semantic route mutation until a
  matching versioned calibration profile exists.
- WHEN uncertainty supports several execution routes THEN Folio SHALL expose a bounded prediction set and
  clarify instead of forcing the nearest route.
- WHEN scope remains ambiguous THEN clarification SHALL cover collection/record, financial role, time,
  entity, document/revision, unit/currency and multi-part requests using local state only.
- WHEN document work requires several operations THEN one typed execution plan SHALL compose retrieval,
  filtering, comparison, aggregation, conflict verification, exhaustive listing and absence checking.
- WHEN benchmark assets are used THEN a versioned manifest SHALL validate URL, license, SHA-256, byte size,
  MIME/signature and expected page/chunk bounds before scoring.
- WHEN a benchmark runs THEN its documents SHALL be selected by isolated benchmark IDs, never filename or
  residual user-library state; invalid/missing assets SHALL fail before ingestion/scoring.
- WHEN OCR quality is weak THEN page-level quality evidence SHALL be retained, a bounded retry SHALL run
  where supported, and uncertain numeric evidence SHALL not silently enter exact analytics.
- WHEN benchmark results are reported THEN denominators, confidence intervals, coverage, abstention,
  cold/warm latency, profile and per-category failures SHALL be present.
- WHEN retrieval/query logic changes THEN checked baselines SHALL detect category regressions and record
  explicit ablations.
- Document/query content SHALL remain local. No telemetry, cloud classifier or document-derived benchmark
  export is introduced.

## Out of scope

- Claiming statistical coverage for languages or domains absent from held-out data.
- Automatically uploading user queries, corrections or document content.
- Bundling multi-gigabyte public corpora in Git.
- Pretending one machine can prove Windows/Linux/Safari performance; reproducible commands and profile
  reports are delivered, external runners remain required evidence.
- Replacing pdf.js, Mammoth, PaddleOCR, Transformers.js, SQLite FTS5 or sqlite-vec.

## Open questions

None. Owner approved implementing every mitigation listed on 2026-07-13.

## Verification

1. Unit corpus: no base ID appears in both calibration and held-out; held-out includes FR/EN, every route,
   ambiguity and hard negatives.
2. Known profile reaches critical-route/slot/clarification gates; unknown profile never mutates route.
3. Execution-plan and every clarification dimension have positive, negative and reload-chain regressions.
4. Fixture manifest rejects HTML, wrong magic bytes, checksum, duplicate name and bound mismatch before
   scoring; isolated reuse never selects ordinary user documents.
5. OCR confidence gates exact numeric analytics and bounded retry without changing high-confidence pages.
6. Browser reports include profile, denominators, Wilson intervals, coverage/abstention, cold/warm latency,
   threshold errors and baseline diff.
7. Existing invoice, record, cross-document, fuzzy, semantic and Martin checks pass.
8. `bun run verify` exits 0 and changed flows are exercised in browser.

Never contains: implementation details (→ plan.md), task breakdown (→ tasks.md).

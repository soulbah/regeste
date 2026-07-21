# Plan 029 — Reliability mitigation

- Build leakage-safe dataset splits keyed by base case and keep perturbations inside their group.
- Replace global semantic thresholds with versioned model/profile calibration registry and conservative
  unknown-profile abstention. Add split-conformal route sets only when calibration support is sufficient.
- Introduce typed execution-plan steps derived from semantic frame; current aggregate/targeted/synthesis
  behavior maps onto plan without cloud classification.
- Generalize clarification metadata and chain composition while preserving reload behavior.
- Add benchmark asset manifest, signature/checksum validation and benchmark-owned document identity.
- Add OCR quality evidence at extraction boundary; keep retry bounded and block weak numeric facts from
  deterministic analytics.
- Enrich metric report with Wilson intervals, coverage, abstention, per-category failures, cold/warm model
  cost and checked baseline comparisons.
- Add reproducible browser-profile commands/metadata for Chromium WebGPU/WASM and external OS runners.
- Keep established libraries responsible for parsing/OCR/embedding/indexing; Regeste owns orchestration,
  calibration, provenance, abstention and quality gates.

Never contains: product behavior (→ spec.md), progress tracking (→ tasks.md).

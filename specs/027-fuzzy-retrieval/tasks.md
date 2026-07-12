# Tasks 027 — Fuzzy, multi-view and adversarial retrieval

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Research record and pinned public corpus manifest
      Done when: every source has canonical/license URL, SHA-256 and size cap; fetch is HTTPS-only,
      idempotent and gitignored; PDF/DOCX render inspection notes exist.
- [x] 2. [P] Deterministic perturbation and ≥200-case truth matrix
      Done when: keyboard/edit/Unicode/OCR/layout/language/identity/numeric/absence/scale categories each
      have positive and hard-negative labels with exact evidence locations.
- [x] 3. Baseline, ablation and cost metrics
      Done when: current exact lexical+dense baseline reports Recall@1/5/10, MRR@10, nDCG@10,
      complete-evidence rate, negative precision, citations, latency, ingest time and storage bytes.
- [x] 4. Fuzzy normalization and identifier safety
      Done when: unit tests cover accents, ligatures, césure, joined/split words, Damerau edits, OCR
      confusions and near-ID rejection without modifying source text.
- [x] 5. Schema v11 fuzzy index and atomic lifecycle
      Done when: v10→v11 migrates; insert/delete/replace/reindex keep word/fuzzy/vector rows aligned;
      interrupted upgrade resumes from OPFS and only then records the current retrieval version.
- [x] 6. Structure/context ingestion views
      Done when: child chunks carry bounded parent/heading context; DOCX table rows retain headers;
      acronym/long-form aliases work; offsets and viewer citations remain exact.
- [x] 7. Three-channel fusion and evidence diversity
      Done when: exact BM25, gram BM25 and dense candidates fuse deterministically; exact IDs dominate
      fuzzy neighbors; synthesis preserves required documents and targeted results stay compact.
- [x] 8. Unsupported-evidence and regression guards
      Done when: hard-negative precision is 100%; entity-only and typo-closer-to-wrong-entity cases
      refuse; specs 024-026 clean Recall/citations remain 100%.
- [x] 9. Browser corpus ingest and chat stress
      Done when: PDF/DOCX/TXT plus pinned public scan/two-column/long documents ingest; representative
      typo, OCR, acronym, table, multi-file, contradiction and absence chats cite exact locations.
- [x] 10. Quality/cost gate and optional-reranker decision
      Done when: perturbed Recall@5 ≥95%, multi-source completeness ≥95%, warm p95 <300 ms; report
      storage/ingest deltas and either rejects reranker or records a separately owner-approved spike.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

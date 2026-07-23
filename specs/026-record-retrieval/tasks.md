# Tasks 026 — Record-aware retrieval and exact analytics

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Research-backed adversarial corpus and question matrix
      Done when: fixtures contain no owner/provider PII; PDF and DOCX render cleanly; matrix has at least
      40 FR/EN cases covering all spec categories and machine-checkable expected evidence/results.
- [x] 2. Explicit-currency money parsing and typed financial records
      Done when: `bun run test -- src/lib/analysis` exits 0; same-line EUR/GNF, zero-decimal GNF,
      sent/received/fee/debited roles, duplicate values and split records pass.
- [x] 3. Temporal/exhaustive query analysis
      Done when: exact reported question plus month/year/range, lists, counts, accents, FR/EN and targeted
      identifiers route/filter correctly in `src/lib/analysis` tests.
- [x] 4. Local fact cache v10 and automatic existing-document repair
      Done when: v9→v10 migrates; old `money-v1` facts cannot be reused; first aggregate rebuilds complete
      `money-v2` records without reindexing document embeddings.
- [x] 5. Record-aware deterministic results and citations
      Done when: sums/lists/counts/averages/extrema match question matrix; every retained record exposes
      correct source chunk/page; ambiguity and absent-result copy stay honest.
- [x] 6. Repeated-page retrieval diversity
      Done when: `bun run test -- src/lib/pipeline` exits 0; exhaustive query retains every relevant page
      above 0.90 template similarity while targeted identity query remains compact.
- [x] 7. Benchmark harness and generated-document ingest
      Done when: benchmark reports 100% record recall, execution exact match, expected citation coverage
      and currency-role accuracy for PDF/DOCX/TXT corpus; old 25-invoice benchmark remains 100%.
- [x] 8. Real PDF and regression verification
      Done when: local ignored a local, gitignored real-world PDF answers agreed stress pack against visual truth; the private compromis benchmark and
      long scanned-document regressions remain green; browser console has no errors.
- [x] 9. Cross-document and unsupported-evidence stress
      Done when: at least eight cases require multiple files; complementary, identity, multi-hop,
      negation, superseded, conflict and absent categories pass at 100% evidence recall/completeness and
      unsupported-attribute precision; one real chat cites three distinct files.
- [x] 10. OCR conversational traps
      Done when: the live private OCR compromis document answers price/loan comparison and cadastral area from correct late/early
      evidence; French inversion does not inherit previous topic; an absent sensitive attribute uses
      zero passages; Private synthesis produces an answer without exhausting hidden reasoning.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

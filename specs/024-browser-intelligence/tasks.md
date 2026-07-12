# Tasks 024 — Browser intelligence core

Check a task off ONLY after its Done-when commands pass.

- [x] 1. Structural chunking, searchable context, and layout-preserving PDF lines
      Done when: `bun run test -- src/lib/pipeline` exits 0; headings and invoice lines remain
      retrievable while source offsets still match.
- [x] 2. Local schema v9 and correctly scoped hybrid retrieval with raw scores
      Done when: browser DB migrates v8→v9; selected-document regression test passes; warm retrieval
      p95 is recorded on synthetic corpus.
- [x] 3. Adaptive embedding tier and atomic model reindex
      Done when: WebGPU selects EmbeddingGemma q4/256d, WASM selects E5 q8/384d, and model mismatch
      produces an explicit reindex state rather than mixed vectors.
- [x] 4. Analytical router, cached fact extraction, and deterministic monetary aggregation
      Done when: tests cover FR/EN totals, separators, negatives, mixed currencies, ambiguity, all-doc
      coverage, and exact integer-minor-unit calculations.
- [x] 5. Adaptive Private reasoning and Qwen3.5 tiers
      Done when: simple prompts disable thinking, complex prompts enable bounded thinking, Qwen3.5-2B
      is capable default, 4B is strong tier, and both runtimes share the same request policy.
- [x] 6. Work-ledger UI and persisted method summaries, FR/EN
      Done when: live steps appear during retrieval/analysis, collapse on final answer, expandable method
      contains only observable operations, keyboard and reduced-motion paths work.
- [x] 7. Domain benchmark harness and regression corpus
      Done when: benchmark reports Recall@5, aggregate exact match, citation coverage, cold/warm stage
      timings, TTFT, and tokens/s without sending corpus off-device.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

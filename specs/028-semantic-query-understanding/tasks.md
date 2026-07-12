# Tasks 028 — Semantic query understanding

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Research record and architecture audit
      Done when: primary sources, project gaps, library/runtime decision and measurable gates are documented.
- [x] 2. Typed semantic frame and centralized ontology
      Done when: operation/role/scope/date/identifier parsing has positive and hard-negative unit tests;
      query-role parsing is not duplicated across analytics modules.
- [x] 3. [P] Versioned prototype corpus and deterministic behavior generator
      Done when: ≥300 labeled FR/EN cases cover MFT, invariance, directional and hard-negative categories.
- [x] 4. Local semantic fallback
      Done when: low-confidence questions use existing embedding worker; high-confidence deterministic
      questions do not pay embedding latency; thresholds reject out-of-scope/low-margin predictions.
- [x] 5. Clarification lifecycle
      Done when: ambiguous scope/measure asks one localized question; reply resolves original query after
      reload; clarification never creates citations, egress or related suggestions.
- [x] 6. Execution integration and role preservation
      Done when: send/regenerate/Assisted paths consume same frame; aggregate and targeted prompts preserve
      financial roles; exact identifier and temporal scope regressions pass.
- [x] 7. Neighbor inconsistency sweep
      Done when: follow-up, locale, generation-budget and related-question heuristics use frame/centralized
      features where applicable; duplicate keyed rendering and OPFS proxy request are fixed.
- [x] 8. Metrics and ablation
      Done when: deterministic-only, semantic-only and fused results report frame/route/slot/clarification
      quality plus p50/p95 fallback latency and threshold errors.
- [x] 9. Browser adversarial verification
      Done when: required real chats, reload clarification, specs 024–027 benchmarks and clean fresh console pass.
- [x] 10. Final gate and documentation
      Done when: `bun run verify` exits 0; report and PROGRESS log record results, costs and honest limits.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

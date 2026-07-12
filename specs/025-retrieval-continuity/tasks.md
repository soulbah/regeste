# Tasks 025 — Retrieval continuity and responsive Private answers

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Contextual follow-up representation and prompt history
      Done when: `bun run test -- src/lib/retrieval-context` exits 0; FR/EN recipient follow-ups retain
      intended entity without treating prior answers as evidence.
- [x] 2. Local candidate refinement, neighbor expansion, and weak-match calibration
      Done when: `bun run test -- src/lib/pipeline` exits 0; duplicate early-page passages no longer
      displace the late relevant passage.
- [x] 3. Long scanned-document retrieval regression
      Done when: synthetic 30-page test returns recipient answer after page 20 in final top passages and
      excludes conflicting sender-only passage.
- [x] 4. WebLLM Service Worker engine with cached fallback
      Done when: warm refresh reuses a living engine; terminated-worker recovery loads cached weights
      without downloading them again.
- [x] 5. Direct-answer prompt and adaptive generation budgets
      Done when: prompt/budget tests cover short facts versus synthesis and live recipient answer is one
      natural, cited sentence.
- [x] 6. Assisted context transparency
      Done when: pre-send review includes conversation context when used, byte accounting includes it,
      and no context leaves before confirmation.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

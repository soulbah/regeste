# Tasks 011 — Documents pack

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Schema v6 (language) + language.ts + tests + ingest wiring + badges.
      Done when: `bun run test` green; FR/EN badges visible in dev.
- [x] 2. Worker deleteChunks/replaceDocument/documentDetail + store reindex/replace.
      Done when: Verification 3–4 pass in dev.
- [x] 3. Library sort/filter + document sheet (D1) with actions.
      Done when: Verification 2 passes in dev.
- [x] 4. [P] # inline picker + added-to-library toast.
      Done when: Verification 5 passes in dev.
- [x] 5. End-to-end verification + PROGRESS.md update.
      Done when: `bun run verify` exits 0.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

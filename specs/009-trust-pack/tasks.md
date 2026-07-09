# Tasks 009 — Trust pack

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Worker: chatPrivacySummary, documentEgress, weekPrivacySummary, setChatPrivateOnly.
      Done when: `bun run check` exits 0; values match manual SQL in dev.
- [x] 2. Settings store (force offline persisted, storage estimate, wipe) + guardedFetch wired into assisted/myai/session paths.
      Done when: offline ON blocks sends with honest message; wipe empties the workspace.
- [x] 3. Settings page + sidebar entry + data-flow page (T4) + links.
      Done when: spec Verification 1–3 pass in dev.
- [x] 4. Badges P2 (chat header) + P3 (library) + P7 lock (panel + selector + send guard).
      Done when: spec Verification 4–5 pass in dev.
- [x] 5. P8 weak-match warning + P9 scores in review.
      Done when: spec Verification 6 passes in dev.
- [x] 6. End-to-end verification + PROGRESS.md update.
      Done when: `bun run verify` exits 0; all Verification steps executed.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

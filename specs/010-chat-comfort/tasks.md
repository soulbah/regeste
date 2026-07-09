# Tasks 010 — Chat comfort

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Schema v5 (pinned) + worker setChatPinned/deleteMessage/documentHeadings.
      Done when: `bun run check` exits 0; dev DB migrates.
- [x] 2. Store: shared answer path + regenerate/editLast/exportMarkdown/setPinned.
      Done when: Verification 1 & 3 pass in dev.
- [x] 3. UI: turn actions (copy/regenerate), edit-last dialog, sidebar pinned group + export item.
      Done when: Verification 1–4 pass in dev.
- [x] 4. [P] C7 drop/paste upload + C10 shortcuts.
      Done when: Verification 5 & 7 pass in dev.
- [x] 5. [P] C8/C9 suggestions (worker query + lib/suggestions.ts + surfaces).
      Done when: Verification 6 passes in dev.
- [x] 6. End-to-end verification + PROGRESS.md update.
      Done when: `bun run verify` exits 0.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

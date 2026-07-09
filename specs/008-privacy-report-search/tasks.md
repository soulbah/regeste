# Tasks 008 — Privacy Report + universal search

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Local schema v3 (messages_fts + backfill) + worker indexing on insert/delete + `searchAll` + `privacySummary`.
      Done when: `bun run check` exits 0; existing dev DB migrates; searching a known message word returns its chat.
- [x] 2. Privacy Report page + sidebar entry + JSON export + empty-egress state.
      Done when: spec.md Verification step 1 passes in dev.
- [x] 3. ⌘K command palette: global shortcut, commands, chats + documents search with snippets, navigation/viewer wiring.
      Done when: spec.md Verification step 2 passes in dev.
- [x] 4. End-to-end verification + PROGRESS.md update.
      Done when: spec.md "Verification" executed; `bun run verify` exits 0.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

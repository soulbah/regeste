# Tasks 007 — My AI mode

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Local schema v2 (`myai_model` on chats) + worker `getSetting`/`setSetting`/`setChatMyaiModel` + `LocalChat.myaiModel`.
      Done when: `bun run check` exits 0; existing local DB migrates in dev without data loss.
- [x] 2. `state/myai.svelte.ts`: config persistence, presets + CORS hints, `testConnection`, streaming `generate` with abort.
      Done when: `bun run check` exits 0; Test connection against a stub lists models; error path shows honest message.
- [x] 3. Send flow: `generateMyAi` in chats store + stop wiring + privacy event with destination host.
      Done when: streamed answer lands in the thread with citations; privacy event row has mode `myai`, destination host, bytes > 0.
- [x] 4. Mode selector config view + configured state + per-chat model persistence; turn rendering for `myai` (blue dot + meta line).
      Done when: spec.md Verification steps 1–4 pass in dev.
- [x] 5. End-to-end verification + PROGRESS.md update.
      Done when: spec.md "Verification" executed; `bun run verify` exits 0.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

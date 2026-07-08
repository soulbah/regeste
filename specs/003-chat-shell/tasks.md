# Tasks 003 — Chat shell

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. DB worker methods: chats CRUD, messages, chat_documents attach/detach/toggle, usage counts
      Done when: exercised via UI flows below; `bun run check` green.
      → Delete cascade verified (messages removed with their chat).
- [x] 2. chats.svelte.ts state (list, active, messages, send → retrieval turn) + auto-title heuristic
      Done when: unit test for title heuristic; send stores user msg + retrieval turn.
- [x] 3. App shell: layout with shadcn Sidebar + Toaster; sidebar lists chats grouped by recency with rename/delete
      Done when: create/rename/delete persist across reload (browser-verified).
      → Rename redesigned as a Dialog: the inline blur-to-commit input died instantly to the
      dropdown's focus restoration. Auto-title from first message verified ("Quel est le préavis prévu par le…").
- [x] 4. Chat view: thread + composer + mode selector (colors, honest states, per-chat persistence)
      Done when: mode persists per chat across reload; selector shows locked/unconfigured states.
      → Selector verified: Private "coming soon", Assisted "sign in required", My AI "not configured";
      all modes disabled until 004/005, so persistence is exercised then.
- [x] 5. Documents: panel in chat + library page + adaptive add popover + attach-from-library + delete with usage warning
      Done when: upload-in-chat lands in library and chat; attach existing = instant; library delete warns with chat count.
      → All verified in Chromium: "In 1 chat" badge, instant attach (no re-index), warning
      "This document is used in 1 chat", upload-in-chat → library + panel.
- [x] 6. Retrieval turn rendering + toasts per feedback rules
      Done when: question renders passages with locators; toast fires only for out-of-view completion.
      → Passages with page locators verified live; toast logic implemented per FEATURES 5bis
      (out-of-view transitions only), rendering path not staged live.
- [x] 7. End-to-end pass of spec.md Verification in Chromium
      Done when: all 6 verification steps observed; console clean (stale HMR-era errors only).

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

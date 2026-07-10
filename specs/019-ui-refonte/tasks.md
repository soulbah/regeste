# Tasks 019 — UI refonte (design system v2)

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Phase 1 — v2 palette + radius/shadows in layout.css, button/badge variants, theme setting (System/Light/Dark) in Settings, ui.md amendment
      Done when: `bun run verify` exits 0; both themes sweep clean on every screen; theme choice persists across reload; contrast audit passes (4.5:1 text, 3:1 UI); no mono-uppercase buttons/badges anywhere.
- [x] 2. Phase 2 — inset shell, sidebar rail, panel system (resize/close/reopen/persist), header egress pill + toggle, trust de-repetition, responsive Sheet fallback
      Done when: `bun run verify` exits 0; drag/snap/dblclick/⌘./header-toggle/citation-reopen all work on /chat/[id]; sizes persist across reload; `grep -r "storedLocally\|signedIn" src/` has no rendered usage left; panel renders as Sheet at 900px.
- [x] 3. Phase 3 — sources strip + chip previews + turn footer, in-place edit, retrieval turn aligned, composer (+ menu, ghost mode pill, accent send), mode-token removal
      Done when: `bun run verify` exits 0; strip/hover/click-through/footer verified live against the My AI stub; `grep -r "mode-private\|mode-myai" src/` returns nothing; edit happens in place.
- [x] 4. Phase 4 — vocabulary renames + trust-string deletions in both dictionaries, copy sweep
      Done when: `bun run verify` exits 0 (dictionaries typecheck against each other); FR + EN full-screen sweep; banned-marker sweep clean.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

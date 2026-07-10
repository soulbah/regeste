# Tasks 020 — Refonte leftovers

Check a task off ONLY after its Done-when commands pass.

- [x] 1. /chat/* namespace: move app routes, root redirect, every link/shortcut/pathname check updated
      Done when: `bun run verify` exits 0; `/` redirects to `/chat`; sidebar/palette/settings links land; off-thread viewer Sheet unaffected.
- [x] 2. Answer versions: local schema v8, retire-on-retry, ‹ n/N › nav in the turn footer, FTS follows the active version
      Done when: `bun run verify` exits 0; Try again against the stub yields ‹ 2/2 ›; ‹/› switches to 1/2 and back.
- [x] 3. Related questions: post-answer local generation (Private on-device / My AI own endpoint, egress logged), last answer only, max 3, silent absence
      Done when: `bun run verify` exits 0; stub answer shows 3 questions under the last answer; click sends; Assisted/failure shows nothing; the extra My AI call appears in the egress pill.
- [x] 4. Quote-reply: selection in an answer → floating Reply/Citer button → markdown quote in the focused composer
      Done when: `bun run verify` exits 0; selecting answer text and clicking the button leaves `> …` in the composer.

Completion checklist:

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end (against the OpenAI-compatible stub)
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

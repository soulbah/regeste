# Tasks 005 — Accounts and Assisted mode

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [ ] 1. Session state + account page (sign up / sign in / sign out) + sidebar footer reflects session
      Done when: sign up against local D1 via the UI; footer shows the account; sign out returns to Guest.
- [ ] 2. /api/assisted endpoint: valibot schema, 401 without session, quota check/increment (D1), Workers AI SSE relay
      Done when: curl without session → 401; malformed → 400; authed request streams tokens.
- [ ] 3. Pre-send preview dialog (excerpt checkboxes, size, destination, don't-ask-again)
      Done when: preview shows the real retrieved excerpts; unchecking excludes from the payload.
- [ ] 4. chats.send() assisted branch: SSE consumption, citations vs sent excerpts, privacy_event (cloud, real bytes), "what AI saw" meta line
      Done when: streamed assisted answer with citations; event row assisted · cloud · bytes > 0.
- [ ] 5. Mode selector: Assisted unlocked for signed-in users, locked with sign-in path for guests
      Done when: state flips with session, per-chat mode persists.
- [ ] 6. End-to-end verification of spec.md against wrangler dev (real Workers AI)
      Done when: all 5 verification steps observed.

Completion checklist (all required before the spec is closed):

- [ ] All tasks checked with their Done-when verified
- [ ] spec.md "Verification" section executed end-to-end
- [ ] `bun run verify` passes
- [ ] PROGRESS.md updated

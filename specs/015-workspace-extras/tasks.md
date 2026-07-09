# Tasks 015 — Workspace export + quota gauge

- [x] 1. fflate dep + worker exportData() (full local dump) + settings export flow (zip with originals).
      Done when: Verification 1 passes in dev.
- [x] 2. [P] GET /api/quota (session-guarded, read-only) + Settings gauge.
      Done when: Verification 2 passes in dev (local: 401 unauth + gauge with local session).
- [x] 3. End-to-end verification + PROGRESS.md update.
      Done when: `bun run verify` exits 0.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

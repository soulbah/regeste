# Tasks NNN — <name>

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [ ] 1. <task>
      Done when: `<command>` exits 0; <observable behavior>.
- [ ] 2. [P] <task>
      Done when: `<command>`; <observable behavior>.

Completion checklist (all required before the spec is closed):

- [ ] All tasks checked with their Done-when verified
- [ ] spec.md "Verification" section executed end-to-end
- [ ] `bun run verify` passes
- [ ] PROGRESS.md updated

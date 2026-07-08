---
name: new-spec
description: Start a new numbered spec folder from the template. Use when beginning a new feature or milestone, before writing any code for it.
disable-model-invocation: true
---

# New spec

1. Find the next number: `ls specs/` (e.g. after `001-foundation` comes `002`).
2. Copy the template: `cp -r specs/000-template specs/NNN-short-name`.
3. Fill `spec.md` (WHAT/WHY, acceptance criteria, out-of-scope, verification) from `docs/internal/PRD.md` + `docs/internal/FEATURES.md` — reference feature IDs (P1, F1, R1…) rather than restating them.
4. Fill `plan.md` (HOW) only after spec.md is validated by the owner.
5. Break into `tasks.md`: each task has a `Done when:` list of runnable commands/observable behaviors. `[P]` marks tasks safe to parallelize.
6. Add the spec to the roadmap table in `PROGRESS.md`.

Never start implementing from an unvalidated spec — post it and wait for the owner's go.

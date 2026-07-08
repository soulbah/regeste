@AGENTS.md

# Claude Code specifics

- Use plan mode for any task spanning multiple areas (UI + server, or schema changes); align the plan with the active `specs/NNN/plan.md`.
- Scoped rules in `.claude/rules/` (ui, server) load automatically when you touch matching paths.
- Skills: `verify` (exercise the app before declaring done), `db-migration`, `add-component` (shadcn-svelte procedure), `new-spec`. Prefer them over ad-hoc sequences.
- Hooks will: block writes to secrets/lockfile/applied migrations, format files after edits, and run typecheck+lint when you stop. A hook block is a hard signal — fix the cause, don't retry or bypass.
- For repo-wide exploration, delegate to a subagent to keep context lean.

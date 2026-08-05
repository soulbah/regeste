# Contributing

Thanks for considering a contribution. Regeste is maintained by a small team working primarily with AI coding agents — the repo is configured for that, and the same rules apply to everyone, human or agent.

## Ground rules

- Read `AGENTS.md` first — commands, conventions, definition of done. It applies to human contributors too.
- All changes land through a pull request against `develop` — direct pushes are refused by a repository ruleset, for the maintainer too. Branch from `develop` as `type/short-slug` (`feat/42-viewer-panel`), reference an issue when one exists.
- Every PR must pass `bun run verify` (typecheck + lint + test + build) locally and in CI.
- Work against a spec: significant changes start from a `specs/NNN-*` folder (see `specs/000-template`). Small fixes can go straight to PR.
- Conventional Commits for messages (`feat:`, `fix:`, `docs:`, `chore:`…). This
  is not cosmetic: semantic-release reads these subjects to decide the next
  version number and to write the changelog. CI lints the commits a pull
  request adds (`bun run lint:commits` runs the same check locally).
- Write the **PR title** as a Conventional Commit too: PRs are squash-merged
  and the title becomes the commit subject on `develop` — it is the line
  semantic-release will eventually read. CI lints it.
- Privacy invariants in `docs/constitution.md` are non-negotiable — a PR that sends user content server-side or adds content tables to D1 will be rejected regardless of quality.
- Fixtures and examples use invented data only — no real names, contact details, bank or file references, even partial. CI runs gitleaks over the full history with repo-specific PII rules (`.gitleaks.toml`) and fails on a hit.

## AI-assisted contributions

AI assistance is welcome (this repo is largely built with it) under two conditions:

1. **You understand your diff.** You can explain every line in review. Unreviewed "agent slop" PRs are closed without discussion.
2. **Disclose it** with an `Assisted-by:` trailer in the commit message (e.g. `Assisted-by: Claude Code`).

## Developer Certificate of Origin

Contributions are accepted under the [DCO](https://developercertificate.org/): sign your commits with `git commit -s`. No CLA.

## Security issues

See [SECURITY.md](SECURITY.md) — never open a public issue for a vulnerability.

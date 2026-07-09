# Folio — agent guide

Folio is an open-source, privacy-first "chat with your documents" web app. Everything document-related (parsing, chunking, embeddings, vector index, chats, citations) runs **in the browser** and stays on the user's device. The only backend is a single Cloudflare Worker (this SvelteKit app) handling auth, quotas and the Assisted endpoint (Workers AI). Product docs are in French, code and repo docs are in English.

## Current phase

Foundation. The UI shell, browser pipeline and specs are being built incrementally — pick work from the active spec in `specs/`, not from your own judgment of what's missing.

## Read before working

| You are about to…        | Read first                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Any task                 | `PROGRESS.md` (project state), the active `specs/NNN-*/tasks.md`                                                |
| Touch product behavior   | `docs/internal/PRD.md`, `docs/internal/FEATURES.md` (frozen feature set + decisions; local-only, not versioned) |
| Touch stack/architecture | `docs/internal/RESEARCH-2026-07-stack.md`, `docs/constitution.md`                                               |
| Touch UI                 | `.claude/rules/ui.md` (shadcn-only rule)                                                                        |
| Touch server/API/DB      | `.claude/rules/server.md`                                                                                       |
| Write user-facing text   | `.claude/rules/copy.md` (human-sounding copy, no AI markers; strings live in `src/lib/i18n/`)                   |

## Commands

```bash
bun run dev              # vite dev with emulated CF bindings (D1 local, AI proxied)
bun run check            # svelte-kit sync + svelte-check (typecheck)
bun run lint             # prettier --check + eslint
bun run format           # prettier --write
bun run test             # vitest run (client browser project + server node project)
bun run build            # vite build (Cloudflare adapter)
bun run verify           # check + lint + test + build — THE done gate
bun run db:generate      # drizzle-kit generate (after editing src/lib/server/db/schema.ts)
bun run db:migrate:local # wrangler d1 migrations apply folio-db --local
bun run cf:types         # regenerate worker-configuration.d.ts after wrangler.jsonc changes
```

Bun 1.2 + Node 22 (`.nvmrc`). bun only — never npm/pnpm/yarn. Always `bun run test` (never bare `bun test`: that invokes Bun's own runner, not vitest).

## Definition of done

A task is complete only when:

1. `bun run verify` exits 0.
2. Every `Done when:` command of the task in the active spec passed — run them, don't assume.
3. The change was exercised for real (via the `verify` skill: dev server + driving the affected flow), not just compiled.
4. `PROGRESS.md` is updated (status + one log line) in the same change.

Never batch-check tasks you did not verify. Never claim done with a failing or skipped check — report the failure instead.

## Grounding rules (anti-hallucination)

- Never invent an API, import or package name. Check `package.json` before importing; check the actual file before referencing an export.
- Read a file before editing it. Read neighboring code before writing new code — match its idioms.
- Library APIs: trust the installed version's types/docs over memory. **When in doubt about any library/API behavior, fetch the official docs BEFORE coding** (owner rule). Cloudflare APIs move fast — check https://developers.cloudflare.com/llms.txt (and the product's `llms-full.txt`) before citing limits, bindings or model names.
- Cloudflare-first: before adding any external service or dependency for infra concerns, check if Cloudflare has it (see `docs/constitution.md`).
- Uncertain about product behavior? Add `[NEEDS CLARIFICATION: question]` to the spec and stop that thread — never guess on user-visible behavior.

## Hard rules

- **UI: shadcn-svelte components only.** Before using any native HTML interactive element, check the registry — if a shadcn-svelte component exists, install and use it. Raw `<button>`, `<a>`-as-button, `<input>` etc. in app code is a task failure. Details in `.claude/rules/ui.md`.
- **Privacy is the product.** No document content, chat content, chunk, embedding or filename may ever reach the server, the database, logs or analytics. The Assisted endpoint receives excerpts transiently and must never persist or log them.
- **Validated edges**: every API endpoint validates input with valibot before use. No `any` at boundaries.
- **Secrets**: never write `.env*` / `.dev.vars` (hook-enforced); use `wrangler secret put`.
- **Migrations**: never edit an applied migration — create a new one (use the `db-migration` skill).
- **Simplicity**: smallest change that satisfies the spec. No speculative abstractions, no extra deps without need.
- **Tests: no sugar tests.** A test must protect real logic or a real regression; ceremony coverage is a task failure. When unsure whether a test is necessary, it isn't.
- **UI work starts from the frontend-design skill + real inspiration research.** Distinctive identity is a product goal — default-looking shadcn output is a task failure. The right contextual panel (not modal dialogs) hosts contextual flows: documents, pre-send review, What AI saw, viewer.

## Conventions

- TypeScript strict; Svelte 5 runes (`$state`, `$derived`, `$props`) — no legacy stores in new code.
- Formatting/lint: prettier + eslint (configs in repo). Tabs, single quotes, width 100.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`…). No AI attribution in commit messages.
- File naming: kebab-case for files, PascalCase Svelte components live in `src/lib/components/`.
- Shared state: `.svelte.ts` rune modules in `src/lib/state/`; workers are plain TS (no runes) under `src/lib/workers/`.

## Repo layout

```
src/routes/            # SvelteKit routes; api/* = server endpoints (the Worker)
src/lib/components/ui/ # shadcn-svelte components (owned, themable — edit variants here)
src/lib/server/        # server-only: auth, db schema
migrations/            # D1 migrations (generated; append-only)
specs/                 # numbered specs; 000-template is the model
docs/                  # constitution (public); internal/ = PRD, features, research (local-only, gitignored)
.agents/skills/        # canonical skills (Codex reads these; .claude/skills is a symlink)
```

## Git & deploys

- Work directly on `main` in small, frequent commits during the dev phase — the owner reviews diffs, so commit after each verified task, never batch a day of work into one commit. Conventional Commits.
- Dev phase: deploys are run locally by the agent (`bun run deploy`) when the owner asks. CI has no automatic triggers for now (manual `workflow_dispatch` only); Workers Builds + PR flow come with the open-source launch.

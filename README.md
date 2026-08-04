# Regeste

**Chat with sensitive documents. Your files stay local. You choose what the AI can see.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/soulbah/regeste/ci.yml?branch=develop&label=CI&logo=github)](https://github.com/soulbah/regeste/actions/workflows/ci.yml)
[![Bun](https://img.shields.io/badge/runtime-Bun%201.2-f9f1e2.svg?logo=bun)](https://bun.sh)

Regeste is an open-source, privacy-first document chat. Parsing, chunking, embeddings, vector search and chat history all run **in your browser** — documents never leave your device. For each answer you pick a trust boundary:

- **Private** — an LLM runs on your device (WebGPU/WASM). Nothing is sent anywhere.
- **Assisted** — only the retrieved excerpts are sent to a Cloudflare Worker (Workers AI), transiently, never stored. You see exactly what was sent ("What AI saw").
- **My AI** — bring your own endpoint (Ollama, LM Studio, vLLM, any OpenAI-compatible API).

Private and My AI need **no server** — the app is a static client. Assisted is the one mode with a backend (auth, quotas, the Workers AI call); it is **off by default** and only appears when a deployment sets `PUBLIC_ASSISTED_ENABLED=true`. Self-hosting Private + My AI needs none of the auth/database setup below.

> Don't trust us. Inspect the code, self-host it, or keep everything local.

## Stack

SvelteKit (Svelte 5) · Tailwind CSS v4 · shadcn-svelte · Cloudflare Workers + D1 + Workers AI · better-auth · drizzle · valibot · SQLite WASM + sqlite-vec in the browser.

## Development

```bash
bun install                        # Bun 1.2 + Node 22 (.nvmrc)
cp .dev.vars.example .dev.vars
bun run db:migrate:local
bun run dev                           # vite dev with emulated Cloudflare bindings
bun run verify                        # typecheck + lint + test + build
```

This repo is developed with AI coding agents; the agent harness lives in `AGENTS.md`, `.agents/skills/` and `.claude/`. Humans and agents follow the same rules — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [docs/constitution.md](docs/constitution.md) — non-negotiable principles
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together
- [PROGRESS.md](PROGRESS.md) — current state and roadmap
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute (DCO, AI-assisted rules)
- [SECURITY.md](SECURITY.md) — reporting a vulnerability
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — licenses of vendored components

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
first: it covers the DCO, the verification gate and the rules for AI-assisted
contributions. All community interactions follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Looking for a place to start? Issues
labelled `good first issue` are a good entry point.

## Support

- **Bugs and feature requests**: open a GitHub issue (templates are provided —
  please never paste document content or personal data into an issue).
- **Security**: report privately via GitHub Security Advisories, see
  [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0-only](LICENSE). The app is free to use, self-host and modify; if you run a modified version as a service, you must publish your changes.

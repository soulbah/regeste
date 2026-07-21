# Regeste

**Chat with sensitive documents. Your files stay local. You choose what the AI can see.**

Regeste is an open-source, privacy-first document chat. Parsing, chunking, embeddings, vector search and chat history all run **in your browser** — documents never leave your device. For each answer you pick a trust boundary:

- **Private** — an LLM runs on your device (WebGPU/WASM). Nothing is sent anywhere.
- **Assisted** — only the retrieved excerpts are sent to our Cloudflare Worker (Workers AI), transiently, never stored. You see exactly what was sent ("What AI saw").
- **My AI** — bring your own endpoint (Ollama, LM Studio, vLLM, any OpenAI-compatible API).

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
- [PROGRESS.md](PROGRESS.md) — current state and roadmap

## License

[AGPL-3.0-only](LICENSE). The app is free to use, self-host and modify; if you run a modified version as a service, you must publish your changes.

# Plan 007 — My AI mode

## Pieces

- **Local schema v2** (`local-db/schema.ts` MIGRATIONS append): `ALTER TABLE chats ADD COLUMN myai_model TEXT;`. Settings live in the existing `meta` table under `setting:` keys — worker gains `getSetting(key)` / `setSetting(key, value)` and `setChatMyaiModel(id, model)`; `rowToChat` maps `myaiModel`.
- **Store** (`state/myai.svelte.ts`): config `{ baseUrl, apiKey }` + default model, loaded from settings at init; `PRESETS` (Ollama `http://localhost:11434/v1`, LM Studio `http://localhost:1234/v1`, vLLM `http://localhost:8000/v1`) each with a CORS hint; `testConnection()` → `GET {base}/models` (Bearer header if key) → model ids; `generate(model, messages, onDelta)` → `POST {base}/chat/completions` `stream: true`, SSE parsing, AbortController for `stop()`. `normalizeBaseUrl` strips trailing `/`.
- **Send flow** (`chats.svelte.ts`): `send()` routes `mode === 'myai' && myaiStore.ready` to `generateMyAi` — same shape as `generatePrivate` (grounded prompt from `prompt.ts`, stripThink on stream, `resolveCitations`, `insertCitations`), privacy event `{ mode: 'myai', destination: host, excerptCount, bytesSent: full prompt bytes }`. Fetch failure → honest assistant message, no privacy event. `stopGeneration()` also aborts My AI.
- **Mode selector**: My AI row driven by `myaiStore` — unconfigured: "Not configured →" opens an in-popover config view (presets, URL, key, Test connection, model picker via Select); configured: `host · model`, selectable. Optional `onmyaimodel` callback persists the model on the active chat; on the root composer it just updates the default setting.
- **Turn rendering**: `private-turn.svelte` accepts `mode: 'myai'` (blue dot, meta line `N excerpts · X KB · {host}`); chat page routes `message.mode === 'myai'` there and passes the meta from the privacy event.

## Tradeoffs

- One endpoint config (global), model per chat — matches 5bis without inventing a multi-provider manager.
- Reuse of the SSE parser already in `chats.svelte.ts` (`consumeSse` handles the OpenAI delta shape).
- CORS hints are static text per preset; we don't probe or proxy (browser → endpoint direct is the privacy story).

## Tests (no sugar)

- None new: prompt building/citation validation already covered; the rest is I/O glue exercised in verification.

# Spec 007 — My AI mode (own endpoint)

## Why

PRD §3: the third trust boundary — the user connects their own infrastructure (OpenAI-compatible endpoint: Ollama, LM Studio, vLLM…). FEATURES A1 (provider presets + CORS help), A2 (test connection + model list via `/v1/models`), A3 (destination shown with the answer), 5bis (model selector lives in the mode popover, persisted per chat). Fully local + user-controlled: no Cloudflare dependency, so it can ship while deploys are parked.

## What

- WHEN the user opens the mode selector and My AI is not configured THEN the My AI entry SHALL show "Not configured →" and clicking it SHALL open the configuration view (in the popover, not a dialog) instead of selecting the mode.
- The configuration view SHALL offer provider presets (Ollama, LM Studio, vLLM) that prefill the endpoint URL and show provider-specific CORS help, a base-URL field, and an optional API-key field.
- WHEN the user clicks "Test connection" THEN the app SHALL call `GET {base}/models` on the configured endpoint and list the model ids on success, or show an honest error (unreachable / CORS / auth) on failure.
- WHEN a connection test succeeded THEN the user SHALL be able to pick a model; the chosen model is persisted (default for new chats, per-chat once used in a chat).
- WHEN My AI is configured THEN its selector entry SHALL show the endpoint host and current model (e.g. `localhost:11434 · llama3.2`) and be selectable, in My AI blue.
- WHEN the user sends a question in a My AI chat THEN the app SHALL run local retrieval, build the same grounded prompt as Private mode, stream the completion from `{base}/chat/completions`, validate `[n]` citations against the retrieved set, and store citations exactly like Private mode. Stop SHALL abort the request.
- Every My AI answer SHALL record a privacy event: mode `myai`, destination = endpoint host, excerpt count, bytes sent (full prompt); the answer's meta line SHALL show `N excerpts · X KB · {host}` (A3).
- WHEN the endpoint is unreachable or errors THEN the thread SHALL show an honest failure message (no privacy event, since nothing was answered — the attempted egress is still logged).
- WHEN a My AI chat has no documents THEN the app SHALL answer from general knowledge with the existing no-documents behavior (banner semantics unchanged, 0 excerpts in the privacy event).
- The app SHALL CONTINUE TO pass `bun run verify`; Private and Assisted flows SHALL be unchanged.

## Out of scope

- What AI saw panel (privacy data is stored; the panel is its own spec).
- Pre-send review for My AI (P5 is Assisted-only — My AI targets the user's own infrastructure).
- Multiple saved endpoints, per-message model switching, non-OpenAI-compatible APIs.
- Streaming tokens/s stats, context-length management beyond the existing top-K excerpts.

## Open questions

(none — A1/A2/A3 + 5bis cover the behavior)

## Verification

1. `bun run dev`; mode selector → My AI shows "Not configured"; click opens config.
2. Preset Ollama → URL prefilled + CORS hint; enter a fake URL → Test connection → honest error.
3. Against a real local OpenAI-compatible server (or a stub): Test connection lists models; pick one; select My AI.
4. Ask a question in a chat with documents: streamed answer, citations clickable into the viewer (006), meta line `N excerpts · X KB · {host}`.
5. Privacy event recorded (destination = host, bytes > 0). Stop aborts generation.
6. Kill the endpoint, ask again → honest failure message in the thread.
7. `bun run verify` exits 0.

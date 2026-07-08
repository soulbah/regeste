# Plan 004 — Private mode

## Architecture

```
src/lib/private-ai/
  capability.ts     — device detection → tier (pure-ish, unit-testable parts)
  tiers.ts          — tier table (model ids, sizes, requirements) — internal only
  llm-worker.ts     — WebLLM engine in a dedicated worker (download, generate, abort)
  llm.svelte.ts     — main-thread state: status machine (unknown → needs-download →
                      downloading(p) → ready → generating | unavailable | error)
  prompt.ts         — grounded-QA prompt builder + citation post-processing (pure, tested)
src/lib/state/chats.svelte.ts — send() branches: private → generate; else retrieval turn
mode-selector.svelte — Private card becomes the status surface (prepare/progress/ready)
message rendering    — assistant turn with streaming text + resolved citation chips
```

## Key decisions

- **Runtime: WebLLM only in this spec** (WebGPU). wllama WASM fallback (tier 1) is deferred — on non-WebGPU devices Private shows "unavailable on this device" honestly. Rationale: wllama doubles the integration surface for the small share of non-WebGPU desktops; ship the main path first, fallback as its own task later.
- **Tiers**: tier 2 default `Llama-3.2-1B-Instruct-q4f16_1-MLC` (~0.7 GB, needs shader-f16; q4f32 variant otherwise), tier 3 `Qwen3-1.7B` when adapter+deviceMemory signals allow. Detection: requestAdapter → features.has('shader-f16') → deviceMemory/hardwareConcurrency; ground truth = attempt-and-catch: engine load failure downgrades one tier and tells the user in plain words.
- **Citations forced, then validated**: prompt numbers the excerpts [1..n] and instructs bracket citations + "say you don't know if unsupported"; post-processing keeps only markers whose number exists in the retrieved set and maps them to chunk ids stored in the citations table. No JSON schema constraint in v1 of this spec (WebLLM json-mode with streaming complicates UX); revisit if hallucinated citations show up in practice.
- Assistant message content = plain text with [n] markers; citations rows written to the citations table (message_id → chunk_id, snippet, locator). Renderer splits on markers and shows chips with locators.
- Streaming: worker posts token deltas via Comlink proxy callback; abort via engine.interruptGenerate().
- privacy_events written in send() for every answered question (mode, destination 'device', 0 bytes).

## Tradeoffs

- No WASM fallback yet = Private unavailable on Safari/Firefox-without-WebGPU; honest UI state covers it.
- Model catalog pinned to @mlc-ai/web-llm's prebuilt list; version pinned in package.json.

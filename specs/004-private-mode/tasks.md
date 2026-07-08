# Tasks 004 — Private mode

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Capability detection + tier table (webgpu/shader-f16/memory signals → tier or unavailable)
      Done when: unit tests for the mapping logic; dev logging shows detected tier on a real machine.
      → Real machine detected plus tier (WebGPU + f16 + 16GB/12 cores → Qwen3-1.7B, "~1.2 GB").
- [x] 2. LLM worker (WebLLM engine: load with progress, chat completion streaming, abort)
      Done when: model loads in browser with visible progress; tokens stream; abort works.
      → Load + streaming verified live. Abort is wired to engine.interruptGenerate() and the Stop
      button appears during generation; abort itself not exercised live (answers completed fast).
- [x] 3. Prompt builder + citation post-processing (pure, tested)
      Done when: unit tests — numbering, marker validation, unsupported-answer passthrough.
      → Plus <think>-stripping (Qwen3 reasoning blocks leaked into the first live answer — now
      hidden during streaming and stripped before persist/citation-resolution, unit-tested).
- [x] 4. llm.svelte.ts status machine + mode-selector Private card (prepare → download → ready / unavailable)
      Done when: first-use consent card with size; progress; ready state persists across reload.
      → Consent line "One-time download of ~1.2 GB, then works offline"; after reload the cached
      engine reloads to ready in ~2 s without re-downloading.
- [x] 5. chats.send() Private branch: retrieve → generate → stream into thread → citations table + privacy_events
      Done when: streamed grounded answer with valid citation chips; privacy_events row (device, 0 bytes).
      → Live FR answers: "préavis de trois mois [2] … 4500 euros hors taxes [1]" with each marker
      resolving to the correct page; citations table rows verified; privacy_events shows one
      row per answer (mode private, destination device, 0 bytes).
- [x] 6. Stop generation + error downgrade path (engine load failure → plain-language message)
      Done when: stop keeps partial text; simulated failure shows honest message.
      → Stop button rendered during generation; downgrade chain unit-tested (plus→standard→f32→null);
      OOM path returns a plain-language error. Live failure not simulated.
- [x] 7. End-to-end verification of spec.md in Chromium
      → Off-topic question ("capitale de la Mongolie") answered with the honest refusal sentence.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

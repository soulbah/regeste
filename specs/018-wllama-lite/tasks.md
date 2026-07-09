# Tasks 018 — Private Lite (wllama)

- [x] 1. Phase 1: COOP/COEP (credentialless) on documents via hooks.server.ts; regression sweep of every flow under isolation.
      Done when: crossOriginIsolated true in dev; ingest, viewer, search, WebLLM download path, Assisted/auth all behave; `bun run verify` green.
- [x] 2. Phase 2: wllama dep + lite worker (load/generate/abort, same LlmApi), lite tier in capability/tiers (isolation + no-WebGPU gate), selector wording.
      Done when: with WebGPU disabled, consent card shows, download runs, grounded answer streams with valid citations, stop works, privacy event device·0.
- [x] 3. GPU machine unchanged (WebLLM path) + PROGRESS.md update.
      Done when: `bun run verify` exits 0; Private on WebGPU machine identical.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

# Plan 002 — Local database and document pipeline

## Architecture

Two dedicated workers, Comlink-wrapped, owned by `.svelte.ts` state modules; SSR disabled app-wide (local-first SPA).

```
main thread (Svelte 5 runes state)
├─ db worker      — SQLite WASM (sqlite-vec demo build) + opfs-sahpool VFS
│                    schema migrations, all SQL, hybrid search (RRF CTE)
└─ pipeline worker — parsing (pdf.js / mammoth / md), chunking,
                     embeddings (transformers.js multilingual-e5-small q8,
                     WebGPU → WASM fallback), progress events
```

- DB access single-owner: a Web Locks (`navigator.locks`) exclusive lock guards worker startup — second tab waits (full leader election + proxying deferred to 003).
- Pipeline worker sends chunk batches to the db worker via the main thread (transferables); simpler than a MessageChannel between workers for milestone 0.
- Files stored in OPFS under `/documents/<sha256>` before parsing; hash via WebCrypto `crypto.subtle.digest`.

## Files

- `src/lib/local-db/worker.ts` — sqlite init (opfs-sahpool), migrations runner, query methods
- `src/lib/local-db/schema.ts` — versioned local migrations (SQL strings)
- `src/lib/local-db/client.ts` — Comlink proxy + Web Locks guard (browser only)
- `src/lib/pipeline/worker.ts` — parse/chunk/embed orchestration + progress callbacks
- `src/lib/pipeline/parse/{pdf,docx,text}.ts` — parsers returning `ParsedDoc` (blocks with position metadata)
- `src/lib/pipeline/chunk.ts` — structure-aware recursive chunker (pure, unit-tested)
- `src/lib/pipeline/embed.ts` — transformers.js singleton (`query:`/`passage:` prefixes)
- `src/lib/state/documents.svelte.ts` — ingest state machine exposed to UI
- `src/routes/dev/pipeline/+page.svelte` — dev harness page (file drop, states, search box)
- `src/lib/types.ts` — shared pipeline/db types

## Key decisions

- **DB package**: `sqlite-vec-wasm-demo` pinned to **0.1.7-alpha.2** — 0.1.9 and 0.1.10-alpha builds abort at init (emscripten assertion: post-js ordering bug). The .mjs/.wasm pair is copied to `static/vendor/sqlite/` at install (`prepare` → `vendor` script, gitignored) and dynamically imported at runtime with `@vite-ignore`: the bundler must never touch the emscripten glue. Runtime feature-check asserts vec0 + FTS5 at startup. Replacing with our own vendored build is an OSS-launch task.
- **Parse location**: PDF/DOCX/MD parsing runs on the main thread (pdf.js brings its own worker; mammoth needs DOMParser), chunking is pure and fast; only embeddings run in a dedicated worker. Deviation from the original two-worker sketch — one less hop, same responsiveness.
- **Embeddings**: `@huggingface/transformers`, `Xenova/multilingual-e5-small`, q8, 384 dims; model files cached by the library (Cache API). WebGPU when `navigator.gpu` present, else WASM.
- **Chunking**: split on headings/pages first, then recursive by paragraph/sentence to ~1600 chars (≈400 tokens), 10% overlap inside a section only; metadata `{page?, headingPath?, paraIndex?, charStart, charEnd}` captured at parse time.
- **Hybrid search**: single SQL CTE — FTS5 top-20 + vec KNN top-20, RRF k=60, return top-8.
- **Vector storage**: vec0 virtual table `chunks_vec(embedding float[384])`, rowid = chunk id.
- Tests: pure logic (chunker, RRF maths, hash) in vitest browser project; db worker exercised via the dev page (OPFS + workers don't run under the node project).

## Tradeoffs

- Demo-build dependency accepted for milestone 0 (validating the bet beats build purity; swap is isolated behind `local-db/worker.ts`).
- No inter-worker MessageChannel yet — one extra main-thread hop per batch, negligible vs embedding cost.

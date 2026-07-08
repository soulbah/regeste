# Tasks 002 — Local database and document pipeline

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Dependencies + SSR-off + local-db worker skeleton (sqlite init, opfs-sahpool, feature asserts)
      Done when: dev page logs sqlite version, vec_version(), fts5 available, persistence VFS name; `bun run check` passes.
      → Verified in Chromium: "sqlite 3.45.3 · vec v0.1.7-alpha.2 · fts5 on · opfs-sahpool · schema v1".
      Note: sqlite-vec-wasm-demo 0.1.9/0.1.10 builds are broken (emscripten postRun assertion) — pinned 0.1.7-alpha.2, served verbatim from static/vendor (see local-db/worker.ts).
- [x] 2. Local schema migrations (documents, document_versions, chats, messages, chat_documents, chunks, chunks_fts, chunks_vec, citations, privacy_events)
      Done when: fresh profile creates all tables; reload keeps them (OPFS); migration version stored.
      → Verified: reload kept both documents and answered queries without re-ingest.
- [x] 3. [P] Chunker + hash utils (pure) with unit tests
      Done when: `bun run test` green incl. new tests (boundaries respected, overlap, offsets exact).
- [x] 4. [P] Parsers: PDF (pages+offsets, scanned detection), DOCX (heading path), MD/TXT
      Done when: sample files parse in dev page with correct metadata; scanned PDF yields `scanned_pdf` error.
      → Verified: 2-page PDF (page metadata), DOCX (heading breadcrumb "Avenant au contrat > Modification du preavis"), MD (headings), no-text PDF → scanned_pdf badge.
- [x] 5. Embeddings worker (transformers.js singleton, WebGPU→WASM, progress callback)
      Done when: dev page embeds a chunk batch, logs dims=384 and device used; model cached on second run.
      → Verified: model downloaded once, subsequent ingests/queries instant.
- [x] 6. Ingest orchestration + state machine + dedup by hash
      Done when: full flow received→ready on a real PDF; re-drop = dedup (no re-embed); states visible.
      → Verified: same content re-dropped under a different filename → "already indexed" badge, no re-embed.
- [x] 7. Hybrid search (RRF CTE) + query embedding
      Done when: query on ingested docs returns relevant passages with metadata + scores; <500 ms.
      → Verified: FR semantic queries, 112–173 ms end-to-end (embed + search), correct passages ranked first across all three formats.
- [x] 8. Dev harness page `/dev/pipeline` (drop zone, doc list with states, search box, results)
      Done when: spec.md Verification steps 2-5 pass end-to-end.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end (Chromium via dev server; DOCX/PDF/MD fixtures, dedup, persistence, scanned-PDF error)
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

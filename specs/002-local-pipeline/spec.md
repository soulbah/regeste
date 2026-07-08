# Spec 002 — Local database and document pipeline (milestone 0)

## Why

The product's two technical bets must be proven before any UI work: (1) a full RAG pipeline (parse → chunk → embed → hybrid search) can run in the browser with acceptable performance; (2) SQLite WASM + sqlite-vec + FTS5 with OPFS persistence actually works as researched. Everything else builds on this. Implements the pipeline described in docs/internal/PRD.md §6-7 and the stack decided in docs/internal/RESEARCH-2026-07-stack.md §1/§3.

## What

- WHEN the app starts in a browser THEN it SHALL open (or create) a local SQLite database persisted in OPFS, running inside a dedicated Web Worker, and apply pending local schema migrations.
- WHEN a PDF, DOCX, Markdown or TXT file is ingested THEN the app SHALL parse it, extract text with position metadata (PDF: page + char offsets; DOCX/MD: heading path + paragraph index), chunk it (~400 tokens, structure-aware, never crossing page/heading boundaries), embed each chunk locally, and store document + chunks + embeddings in the local database.
- WHEN the same file (identical content hash) is ingested again THEN the app SHALL NOT re-parse or re-embed it.
- WHEN ingestion progresses THEN the app SHALL expose named states (`received → parsing → chunking → embedding → ready` or `error`) observable by the UI, with chunk-level progress during embedding.
- WHEN a text query is issued against one or more ready documents THEN the app SHALL return the top-k passages via hybrid search (FTS5 BM25 + vec0 KNN fused with RRF), each with its document id, position metadata and score.
- WHEN a PDF has fewer than ~50 extractable characters per page on most pages THEN ingestion SHALL fail with a `scanned_pdf` error (honest state, no empty index).
- WHEN the page is reloaded THEN previously ingested documents and chunks SHALL still be present (OPFS persistence).
- The app SHALL CONTINUE TO pass `bun run verify`.

## Out of scope

- Chat UI (003), answer generation (004/005), citations rendering (003).
- Multi-tab write coordination beyond a Web Locks single-leader guard (full leader election arrives with the UI shell).
- OCR, file replacement flow, document deletion UI (schema supports them; flows come with 003).
- Vendored custom SQLite build — milestone 0 uses the official prebuilt sqlite-vec WASM package, pinned; hardening tracked in OSS-LAUNCH checklist.

## Open questions

None — stack choices were decided in RESEARCH-2026-07-stack.md.

## Verification

1. `bun run verify` green (includes browser-mode unit tests for chunker, hash, RRF).
2. `bun run dev`, open `/dev/pipeline`: drop a real multi-page PDF → states progress to ready with visible progress; drop the same file again → instant dedup; drop a DOCX and a Markdown file → ready.
3. Type a query → top passages with page/heading metadata and scores returned in <500 ms at this corpus size.
4. Reload the page → documents still listed; query still works without re-ingesting.
5. Browser console free of errors throughout.

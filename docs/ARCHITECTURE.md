# Architecture

Regeste is a "chat with your documents" web app where the whole document
pipeline runs in the browser. This document explains how the pieces fit
together; the non-negotiable principles live in
[docs/constitution.md](constitution.md).

## The privacy boundary in one paragraph

Parsing, OCR, layout analysis, chunking, embeddings, vector search, chat
history and citations all run on the user's device. Documents never reach a
server. The only server component is a Cloudflare Worker that handles auth,
quotas and the **Assisted** mode, which receives nothing but the retrieved
excerpts the user explicitly approved — transiently, never persisted, never
logged.

## Browser pipeline

```
document → parse → layout/OCR → chunk → embed → SQLite WASM (vec0 + FTS5)
                                                        ↓
question → query embedding → hybrid retrieval → ranked passages → answer
```

### Parsing

- **PDF**: pdf.js — the same library the viewer uses, so chunk coordinates map
  deterministically to the rendered text layer. Scanned pages go through OCR
  (PP-OCRv5 via onnxruntime-web) and a layout model (`ppu-doclayout`) when the
  text layer is too thin.
- **DOCX**: mammoth → semantic HTML; citations address paragraphs by heading
  path (`§2.3 Budget · ¶14`) rather than page number.
- **Markdown / TXT**: parsed directly with structure-aware metadata.

### Chunking and embeddings

- Structure-aware chunking: sections are split by headings, chunks target
  ~400 tokens with ~10% overlap, and a chunk never crosses a page or heading
  boundary. Metadata (`docId`, page/paragraph id, char offsets, heading path)
  is captured at parse time and never reconstructed later.
- Embeddings run on `transformers.js` in a dedicated worker:
  `Xenova/multilingual-e5-small` on WASM, EmbeddingGemma on WebGPU-capable
  devices. The embedding model and its version are stored per document, so a
  model change triggers an explicit re-index.

### Local database

- SQLite compiled to WASM (`sqlite3` + `vec0` + `FTS5`) served from
  `/vendor/sqlite`, opened on the OPFS storage with the `opfs-sahpool` VFS,
  owned by a single dedicated worker (Comlink). A Web Lock makes the first tab
  the single owner; a second tab gets an honest "already open elsewhere"
  notice instead of corrupting the pool.
- The schema is versioned with forward migrations applied at startup.
- Search is hybrid: vector similarity (`vec0`) + FTS5 keyword search, combined
  with RRF-style ranking and fuzzy token matching for OCR noise.

## Answer modes

Each answer runs under one of three trust boundaries, chosen per question:

- **Private** — an LLM runs on-device: WebLLM (WebGPU) as the primary engine,
  wllama (WASM, multithreaded via SharedArrayBuffer) as the CPU fallback.
  Nothing is sent anywhere. Model tiers are picked from measured device
  capability; weights are cached in Cache Storage.
- **Assisted** — the retrieved passages are sent to the Cloudflare Worker
  (Workers AI) transiently. The user reviews the passage list first
  ("pre-send review") and sees exactly what was sent ("What AI saw").
- **My AI** — the question plus the retrieved passages go to an
  OpenAI-compatible endpoint the user configured (Ollama, LM Studio, vLLM…).

### Answer reliability

- Answers are generated with citation markers enforced by grammar/decoding
  constraints where the engine supports it.
- A deterministic validation pass checks every numeric or extractive claim
  against the evidence before the answer is shown; ungrounded claims are
  dropped or the answer is refused honestly with the closest passages listed.

## Server (Cloudflare Worker)

The Worker is a SvelteKit app built with `@sveltejs/adapter-cloudflare`:

- **Auth**: better-auth (email OTP), sessions stored in D1.
- **D1**: users, quotas, session data. No document content, chat content,
  chunk or filename ever reaches D1 — the privacy boundary is enforced in
  code, not by convention.
- **Workers AI**: the Assisted generation endpoint; receives only approved
  excerpts, streams the answer back, persists nothing.
- **Email**: transactional mail for the OTP code.
- **Static assets**: the app shell and marketing pages are served from the
  asset store; the main app routes are prerendered shells (the app itself is
  client-rendered, `ssr=false`).

Runtime secrets are managed with `wrangler secret put`; the only public
environment variable is `PUBLIC_ASSISTED_ENABLED` which switches the Assisted
mode on for a deployment.

## Repository layout

```
src/routes/            # SvelteKit routes; api/* = server endpoints (the Worker)
src/lib/pipeline/      # parse, OCR, layout, chunk, embed, retrieval
src/lib/local-db/      # SQLite worker, schema, migrations
src/lib/private-ai/    # WebLLM / wllama engines, decoding, grounding
src/lib/components/    # UI components (shadcn-svelte + product components)
src/lib/server/        # server-only: auth, db schema
migrations/            # D1 migrations (append-only)
specs/                 # numbered specs; 000-template is the model
```

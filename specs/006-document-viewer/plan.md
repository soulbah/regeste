# Plan 006 — Document viewer + citation click-through

Data already in place: `chunks` keep `page`, `heading_path`, `char_start/char_end`; `citations` keep `chunk_id` + snapshot (snippet, document_name, locator); originals live in OPFS under `documents/<hash>`. No local schema migration needed.

## Pieces

- **DB worker** (`local-db/worker.ts`): `getChunk(chunkId)` → chunk + owning document (id, name, mime, hash, status, pages) or null; `getDocument(id)`. Read-only queries.
- **OPFS read** (`lib/opfs.ts`): `readOriginal(hash)` → `ArrayBuffer | null` (main thread, mirrors `storeOriginal`).
- **Parse reuse**: extract `parseByName(name, mime, data)` from `documents.svelte.ts` into `pipeline/parse/index.ts`; ingest and the text viewer share it.
- **Viewer state** (`state/viewer.svelte.ts`): rune store. `open(target)` / `close()`. Target: `{ document, chunk? }` resolved from a chunkId, or snapshot fallback `{ snippet, documentName, locator }` when the chunk/document is gone. Resolution (`openCitation`, `openHit`, `openDocument`) lives here so all entry points share one path.
- **Panel priority** (chat page): `pendingAssisted` → PresendPanel, else viewer open → ViewerPanel, else DocumentsPanel.
- **ViewerPanel** (`components/viewer-panel.svelte`): header (doc name, locator badge, close), dispatch by mime → PdfViewer | TextViewer, plus the two fallback states.
- **TextViewer**: re-parse OPFS original with `parseByName` → render blocks, emitting heading breadcrumbs when they change; highlight blocks intersecting `[charStart, charEnd)` (same offset space, set at parse time); `scrollIntoView` on the first highlighted block. OPFS miss → render the chunk text alone + honest note.
- **PdfViewer**: pdf.js (already a dep, own worker). Single-page canvas rendered fit-to-width (devicePixelRatio-aware), prev/next + "page X / N". Highlight: `getTextContent()` items → `findMatchRange(items, chunkText)` (pure, `lib/viewer/match.ts`) → absolutely-positioned overlay rects from item transforms + viewport. Char offsets stored for PDF are post-trim and unreliable for mapping back — normalized-text matching is the robust path.
- **Entry points**: citation chips + source lines in `private-turn.svelte`, passage cards in `retrieval-turn.svelte`, doc names in `documents-panel.svelte` → viewer store.

## Tradeoffs

- Text viewer re-parses the original instead of concatenating chunks: chunk overlap would duplicate text and offsets are the parser's coordinate system anyway. Parse cost (mammoth/md/txt) is fine at viewer-open time.
- PDF viewer is one page at a time (matches "citation → page" promise) — full continuous scroll is a later nicety.
- Highlight matching is fuzzy (whitespace-normalized substring): resilient to the parser's trim/EOL rewrites; a miss degrades to "page shown, no highlight" — honest and non-blocking.

## Tests (no sugar)

- `match.ts`: normalized matching maps back to correct item ranges (hit, cross-item hit, miss) — protects the only nontrivial pure logic.

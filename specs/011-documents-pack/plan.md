# Plan 011 — Documents pack

- **Schema v6**: `ALTER TABLE documents ADD COLUMN language TEXT;`.
- **language.ts**: stopword-count heuristic FR vs EN over the first ~2500 chars; returns 'fr' | 'en' | null. Unit-testable pure function (one real test: obvious FR, obvious EN, gibberish → null).
- **Worker**: `setDocumentLanguage` folded into setDocumentStatus extras; `deleteChunks(documentId)` (FTS-safe, reused by re-index and replace); `replaceDocument(id, meta, chunks, vectors, dims)` — single transaction: insert version audit row, delete old chunks, update documents row, insert new chunks; `documentDetail(id)` → chats using it + egress rows.
- **documents store**: `reindex(id)` (read OPFS original → parse → chunk → embed → deleteChunks+insertChunks with phase states); `replace(id, file)` (full pipeline first, then `replaceDocument`; on error → toast, nothing swapped); ingest sets language after parse.
- **Library page**: sort Select + type filter buttons; row click opens `document-sheet.svelte` (Sheet) with facts + actions.
- **# picker**: in composer, track caret token `#…` at end of value; popover-like dropdown (plain positioned div with Buttons — inside the composer card) listing up to 5 matches; select → onattach(docId) + strip token.
- **Toast**: chat/root `handleUpload` toasts for docs whose id was not in the library before ingest.

Tests: `language.test.ts` (3 cases).

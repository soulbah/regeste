# Tasks 006 — Document viewer + citation click-through

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. DB worker read APIs: `getChunk(chunkId)` (chunk + owning document), `getDocument(id)`.
      Done when: `bun run check` exits 0; calling `getChunk` on a real chunk id returns text + page/headingPath + document hash/mime.
- [x] 2. [P] `lib/opfs.ts` `readOriginal(hash)` + `parseByName` extracted to `pipeline/parse/index.ts` (ingest refactored to use it).
      Done when: `bun run check` exits 0; ingest still works in dev (attach a file, status reaches Ready).
- [x] 3. [P] `lib/viewer/match.ts` normalized text matcher + unit tests.
      Done when: `bun run test` passes with the new tests exercising hit / cross-item / miss.
- [x] 4. Viewer store (`state/viewer.svelte.ts`) + chat page panel priority (review > viewer > documents) + ViewerPanel shell with fallback states.
      Done when: `bun run check` exits 0; opening/closing the viewer swaps the right panel in dev.
- [x] 5. TextViewer (DOCX/MD/TXT): blocks + heading breadcrumbs, highlight + scroll, OPFS-miss fallback.
      Done when: clicking a passage card for an MD/TXT/DOCX doc scrolls to the highlighted passage in dev.
- [x] 6. PdfViewer: page render fit-to-width, prev/next nav, highlight overlay from match ranges.
      Done when: clicking a passage card for a PDF opens the cited page with the passage highlighted; prev/next works.
- [x] 7. Entry points wired: citation chips + source lines (private-turn), passage cards (retrieval-turn), doc names (documents-panel).
      Done when: all three paths open the viewer in dev; deleted-doc citation shows the snapshot fallback.
- [x] 8. End-to-end verification + PROGRESS.md update.
      Done when: spec.md "Verification" executed; `bun run verify` exits 0.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

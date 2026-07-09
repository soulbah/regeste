# Spec 006 — Document viewer + citation click-through

## Why

PRD §10: every factual answer links to its sources and a click returns the user to the passage. FEATURES MVP core: "citations cliquables → viewer avec surlignage (PDF : page ; DOCX : chemin de titres)" and the right contextual panel alternating Documents ↔ Pre-send review ↔ What AI saw ↔ Viewer. Citations exist since specs 004/005 but are dead ends (tooltip only) — the trust loop is not closed until the user can see the passage in its document.

## What

- WHEN the user clicks a citation chip `[n]` (or a source line under an answer) THEN the app SHALL open the viewer in the right contextual panel, showing the cited document with the cited passage visible and highlighted — PDF: the cited page rendered with the passage highlighted; DOCX/MD/TXT: the document text scrolled to the passage, heading breadcrumb visible, passage highlighted.
- WHEN the user clicks a passage card in a retrieval-preview turn THEN the viewer SHALL open the same way.
- WHEN the user clicks the name of a `ready` document in the Documents panel THEN the viewer SHALL open that document at its start (page 1 / top), without highlight.
- WHEN the cited chunk no longer exists locally (document deleted since the answer) THEN the viewer SHALL show the citation snapshot (document name, locator, snippet) with an honest "no longer on this device" state — never an error or a blank panel.
- WHEN the original file is missing from OPFS (Safari main-thread write limitation) THEN for text formats the viewer SHALL fall back to the indexed passage text with an honest note; for PDF it SHALL show the snapshot fallback.
- The PDF viewer SHALL support page navigation (previous/next, "page X of N") within the open document.
- The viewer SHALL provide a close affordance returning the panel to Documents.
- WHILE an Assisted pre-send review is pending, the review panel SHALL keep priority over the viewer.
- The viewer SHALL perform zero network requests: all rendering comes from OPFS originals and the local DB (privacy invariant).
- The app SHALL CONTINUE TO pass `bun run verify`; chat, ingest and Assisted flows SHALL be unchanged.

## Out of scope

- OCR / scanned PDFs (V1.1) — error documents cannot be cited anyway.
- Fiche document (D1), universal search ⌘K (spec 008), annotations, text selection/copy tooling.
- Zoom controls (fit-to-width only), viewer on `<md` screens (the whole right panel is already hidden there — mobile viewer comes with the responsive pass).
- "What AI saw" panel view (needs its own spec; privacy data already stored).

## Open questions

(none — behavior fully covered by PRD §10 + FEATURES MVP core)

## Verification

1. `bun run dev`, open a chat, attach a text-based document (MD/TXT/DOCX) and a PDF.
2. Ask a question (no Private model needed: retrieval-preview turn) → click a passage card → right panel shows the document, scrolled to the highlighted passage (text) or the cited page with highlight (PDF).
3. PDF: navigate prev/next pages, indicator updates; close viewer → Documents panel returns.
4. Click a document name in the Documents panel → viewer opens at start.
5. With a Private answer (model ready): click a `[n]` chip → same viewer behavior from the citation.
6. Delete the cited document from the library, reopen the citation → snapshot fallback with "no longer on this device".
7. `bun run verify` exits 0.

# Spec 023 — OCR for scanned PDFs

## Why

Image-only (scanned) PDF pages yield no extractable text, so today the whole
document dead-ends at the `scanned_pdf` error and never enters the library. That
discards a large share of real-world PDFs (contracts, invoices, administrative
scans). Recognize that text on the user's device so scanned PDFs become
first-class, searchable documents without any content leaving the browser.

Direction validated by the owner (2026-07-11, after the in-browser OCR research):
engine **PaddleOCR PP-OCRv5 mobile on onnxruntime-web**, OCR is **opt-in** (never
silent at ingest), Tesseract.js `fra` is the named fallback if the spike fails.

## What

- WHEN a PDF has a mix of text pages and image-only pages THEN the parser SHALL
  keep the text pages' blocks and record the image-only page numbers as awaiting
  OCR, and SHALL NOT throw away the document (no more all-or-nothing `scanned_pdf`).
- WHEN a document has pages awaiting OCR THEN it SHALL land in a non-error
  `scanned` status that carries an opt-in action, not a terminal error.
- WHEN the user runs the OCR action THEN the app SHALL, entirely on the device,
  rasterize each awaiting page, recognize its text, splice it back as a block at
  that page number, then re-chunk and re-embed the merged document through the
  existing pipeline.
- WHEN OCR is running THEN progress SHALL be visible per page and the pass SHALL
  be cancellable.
- WHEN WebGPU is unavailable THEN OCR SHALL run on multi-threaded WASM (slower,
  stated honestly), never a hard failure.
- The recognized text and the page images SHALL be treated as document content:
  they never reach the Assisted endpoint, the Worker, logs, or analytics.
- Model weights SHALL be served from the app's own origin and cached locally, so
  no third party learns a document is being read.
- The app SHALL CONTINUE TO parse text PDFs, chunk, embed and cite exactly as
  today; OCR'd blocks SHALL carry the correct page number and char offsets so the
  document viewer and citations (spec 006) resolve to the right location.

## Out of scope

- Handwriting and non-Latin scripts (Latin recognizer only).
- In-viewer per-word box highlighting of OCR'd text (keep boxes optional; future).
- Moving the e5 embedding model same-origin (same metadata-leak class; separate).
- Auto-OCR without the button (deferred; revisit if opt-in proves annoying).

## Open questions

- [SPIKE GATE 1] Do PP-OCRv5 det+rec run under ORT's WebGPU EP in a worker against
  the pinned nightly onnxruntime-web without silent per-op WASM fallback?
- [SPIKE GATE 2] Does French accuracy hold on real scans (clean + photographed)?
  If either gate fails → fall back to Tesseract.js `fra`.
- [NEEDS CLARIFICATION] Also move e5 same-origin now, or keep the current HF-CDN
  fetch and only self-host the OCR weights?

## Verification

- Spike proves both gates on a real French scan (WebGPU path + WASM path), or the
  fallback is chosen with the reason recorded.
- A scanned French PDF ingests to `scanned` status (not error), the good text
  pages of a mixed PDF are already searchable, and the awaiting pages are listed.
- Tapping the opt-in action OCRs on-device with visible per-page progress; the
  network panel shows zero document egress and zero third-party fetch after the
  weights are cached.
- After OCR the document is `ready`; a question retrieves an OCR'd passage and the
  citation opens the correct page in the viewer.
- `bun run verify` exits 0; both locales sweep clean (no `OCR` jargon in copy).

# Spec 023 — OCR for scanned PDFs

## Why

Image-only (scanned) PDF pages yield no extractable text, so today the whole
document dead-ends at the `scanned_pdf` error and never enters the library. That
discards a large share of real-world PDFs (contracts, invoices, administrative
scans). Recognize that text on the user's device so scanned PDFs become
first-class, searchable documents without any content leaving the browser.

Direction validated by the owner (2026-07-11, after the in-browser OCR research),
then refined after live use (2026-07-12): engine **PaddleOCR PP-OCRv5 mobile on
onnxruntime-web**; scanned pages are read automatically during ingest. OCR stays
an implementation detail and follows the same visible phases as text PDFs.

## What

- WHEN a PDF has a mix of text pages and image-only pages THEN the parser SHALL
  keep the text pages' blocks and record the image-only page numbers as awaiting
  OCR, and SHALL NOT throw away the document (no more all-or-nothing `scanned_pdf`).
- WHEN a document has pages awaiting OCR THEN it SHALL land in a non-error
  internal `scanned` status and queue recognition automatically.
- WHEN recognition runs THEN the app SHALL, entirely on the device,
  rasterize each awaiting page, recognize its text, splice it back as a block at
  that page number, then re-chunk and re-embed the merged document through the
  existing pipeline.
- WHEN OCR is running THEN the UI SHALL use the normal document phases (Reading,
  Splitting, Preparing), with no scanned-only label, action or progress treatment.
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
- Moving the e5 embedding model same-origin. This remains separate from spec 023;
  only OCR weights are self-hosted here.

## Resolved decisions

- PP-OCRv5 det+rec passed the WebGPU and French-accuracy spike gates; no
  Tesseract.js fallback was needed.
- OCR runs on the main thread with WebGPU/WASM inference, matching the proven
  spike. Worker migration remains a performance follow-up.
- OCR weights are self-hosted. The e5 model keeps its existing Hugging Face fetch
  and is explicitly outside this spec.

## Verification

- Spike proves both gates on a real French scan (WebGPU path + WASM path), or the
  fallback is chosen with the reason recorded.
- A scanned French PDF ingests to `scanned` status (not error), the good text
  pages of a mixed PDF are already searchable, and recognition starts automatically.
- Scanned and text PDFs expose the same named ingest phases; the network panel
  shows zero document egress and zero third-party fetch after weights are cached.
- After OCR the document is `ready`; a question retrieves an OCR'd passage and the
  citation opens the correct page in the viewer.
- `bun run verify` exits 0; both locales sweep clean (no `OCR` jargon in copy).

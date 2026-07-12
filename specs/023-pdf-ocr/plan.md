# Plan 023 — OCR for scanned PDFs

Implementation record, updated after live verification and owner follow-ups.

## Engine

PaddleOCR **PP-OCRv5 mobile**: DB text detector + `latin_PP-OCRv5` recognizer +
`ppocrv5_latin_dict` (~12 MB total). `ppu-paddle-ocr` runs through
onnxruntime-web, using WebGPU where available and WASM otherwise.

Recognition currently runs on the main thread, matching the proven spike.
Pages are rendered one at a time at 300 DPI to bound memory. Moving this work to
a worker remains a performance follow-up, not unfinished spec 023 scope.

Model weights are fetched at install time by `scripts/vendor-ocr-models.sh` into
`static/models/ocr/`, then served same-origin. Generic ORT WASM glue may come from
its CDN; document bytes and recognized text never do.

## Data flow

`ingest` → `parsePdf` (text pages keep blocks, image pages become `needsOcr[]`)
→ text blocks chunked/embedded immediately → internal `scanned` status →
automatic serialized `ocrDocument(id)` → `ocr.ts` renders each image page →
PP-OCRv5 recognizes text → blocks merged at correct page numbers → re-chunk →
re-embed → index → `ready`.

Visible status stays identical to a text PDF: Received → Reading → Splitting
→ Preparing → Ready. Internal `scanned` and `ocr` states both map to Reading;
no scan-only action, label, cancellation control or progress treatment remains.

## Files

- `src/lib/pipeline/parse/pdf.ts`: per-page text/image classification.
- `src/lib/pipeline/ocr-model.ts`: same-origin PP-OCRv5 model URLs.
- `src/lib/pipeline/ocr.ts`: one-page-at-a-time rendering and recognition.
- `src/lib/state/documents.svelte.ts`: automatic serialized recognition, merge,
  chunk, embed and index orchestration.
- `src/lib/document-status.ts`: shared user-facing phase mapping.
- Library, chat sources and detail components: same phases for every document.
- `src/lib/i18n/{en,fr}.ts`: shared phase and generic failure copy.

## Completed phases

1. Spike: WebGPU/WASM path and French accuracy gates passed.
2. Parser: mixed PDFs retain searchable text pages while image pages are queued.
3. Recognition: PP-OCRv5 output rejoins normal chunk/embed/index pipeline.
4. Automatic ingest: scan-only opt-in UI removed after owner review.
5. Verification: image-only French PDF became searchable and citable without a
   click; shared status UI and full `bun run verify` passed.

## Tradeoffs

- Main-thread recognition can cause periodic jank on large scans; serialization
  prevents multiple OCR passes from competing at once.
- 300 DPI is kept for accented French accuracy despite higher per-page memory.
- e5 same-origin hosting stays outside this spec; current Hugging Face fetch is a
  separate product/infrastructure decision.

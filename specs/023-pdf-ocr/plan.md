# Plan 023 — OCR for scanned PDFs

## Engine

PaddleOCR **PP-OCRv5 mobile**: DB text detector + `latin_PP-OCRv5` recognizer +
`ppocrv5_latin_dict` (~12 MB `.ort` total). Run on **onnxruntime-web**, the ORT
already pulled transitively by `@huggingface/transformers` — reuse the single
pinned copy (nightly `1.26.0-dev.*`). **Dependency-free**: create raw
`InferenceSession`s and own the ~200 lines of pre/post (DB box extraction, CTC
decode, optional angle-cls). Do NOT add the `ppu-paddle-ocr` SDK (unpinned ORT
peer dep → risks a second ORT copy / ABI mismatch). Device selection copies
`embed-worker.ts`'s `pickDevice()` (WebGPU adapter probe → WASM fallback).

Fallback (only if a spike gate fails): Tesseract.js v7 with `fra`+`eng`
traineddata (single-threaded WASM, ~3–8 s/page).

## Data flow

`ingest` → `parsePdf` (per-page: text pages keep blocks, image pages → `needsOcr[]`)
→ document stored `scanned` with text pages already embedded → user taps action →
`ocrDocument(id)` reads OPFS original → `ocr-worker` renders each `needsOcr` page
via pdf.js @300 DPI to an OffscreenCanvas → DB detect → crop lines → CRNN recognize
→ CTC decode → splice text back as blocks at their page → re-chunk → re-embed
(existing e5 worker) → index → `ready`. GPU is serialized: OCR pass, then embed
pass (single WebGPU queue shared with embeddings).

## Files touched

- `src/lib/pipeline/parse/pdf.ts` — replace the sparse-ratio throw (l.37-41) with
  per-page tagging; return `{ blocks, pages, needsOcr }`.
- `src/lib/types.ts` — `ParsedDoc.needsOcr?: number[]`; new `DocumentStatus`
  `'scanned'`; decide `scanned_pdf` IngestErrorCode fate (repurpose to "OCR ran,
  still nothing").
- `src/lib/pipeline/ocr-worker.ts` (new) — Comlink worker; raw ORT det+rec on the
  existing onnxruntime-web; pdf.js raster; one page in flight (~35 MB @300 DPI).
- `src/lib/pipeline/ocr-model.ts` (new) — model URLs (same-origin), dict, config.
- `src/lib/state/documents.svelte.ts` — `ingest` lands `scanned` instead of error
  when `needsOcr` non-empty; new `ocrDocument(id)` modeled on `reindex` (l.178),
  streaming `setIngest` progress, cancellable.
- `src/lib/state/models.svelte.ts` — `labelFor` (l.19) branch so the OCR cache
  shows/deletes in model management.
- Model weights self-hosted (static/ or `?url` import), cached via Cache API.
- UI: `documents-panel.svelte`, `document-detail-panel.svelte`,
  `chat/documents/+page.svelte` — `scanned` status + "Read the scanned pages"
  action + per-page progress + cancel.
- `src/lib/i18n/{en,fr}.ts` — status + action + progress copy (verb-first, no
  "OCR" jargon, no anthropomorphism, FR vouvoiement).

## Phasing

0. **Spike** (gates) — prove PP-OCRv5 runs in a worker on ORT (WebGPU + WASM) and
   recognizes a real French scan acceptably. Throwaway harness under `src/routes/dev/`.
1. Parser per-page merge + `needsOcr` + `scanned` status (fixes mixed PDFs today).
2. `ocr-worker` + model hosting + model-management wiring.
3. UI: opt-in action, progress, cancel, honest copy.
4. Verify end-to-end (privacy: zero egress) + PROGRESS.

## Tradeoffs

- Dep-free port = more code we own, but one ORT and no new dep (fits the
  simplicity + Cloudflare-first-but-really-fewer-deps ethos).
- Opt-in (not auto) because a 40-page scan is minutes of CPU/GPU/battery.
- 300 DPI is the accuracy floor for accented French; never drop to 150 to save RAM.

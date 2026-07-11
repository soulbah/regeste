# Tasks 023 — OCR for scanned PDFs

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

## Phase 0 — Spike (gates; must pass before Phase 1+)

- [ ] 0.1 Acquire PP-OCRv5 mobile ONNX weights (DB det, latin_v5 rec, dict), self-hosted.
      Done when: files present under the app origin; sizes ~12 MB total; source + license (Apache-2.0) recorded.
- [ ] 0.2 Throwaway harness: load det+rec as raw ORT sessions in a worker; probe WebGPU→WASM.
      Done when: a `/dev/ocr` route runs both sessions on a sample image; console reports the active EP per session (no silent per-op WASM fallback on WebGPU) — GATE 1.
- [ ] 0.3 Recognize a real French scan (clean + photographed) and eyeball accuracy.
      Done when: recognized text of a French scan is legible with accents intact — GATE 2. If either gate fails, record it and switch the plan to Tesseract.js `fra`.

## Phase 1 — Parser per-page merge

- [ ] 1.1 `parsePdf` returns per-page: keep text pages, collect image pages into `needsOcr[]`; no throw.
      Done when: `bun run test` passes new pdf-parse unit tests (mixed PDF → some blocks + `needsOcr`; fully-scanned → `blocks: []` + all pages in `needsOcr`).
- [ ] 1.2 [P] `types.ts`: `ParsedDoc.needsOcr`, `DocumentStatus 'scanned'`, `scanned_pdf` fate.
      Done when: `bun run check` exits 0.
- [ ] 1.3 `ingest` lands `scanned` (text pages embedded) instead of erroring when `needsOcr` non-empty.
      Done when: a scanned PDF ingests to `scanned`; a mixed PDF is already searchable on its text pages.

## Phase 2 — OCR worker

- [ ] 2.1 `ocr-model.ts` (URLs/dict/config, same-origin) + Cache-API caching + `models.svelte.ts labelFor` branch.
      Done when: model-management lists an OCR cache with real size; delete works.
- [ ] 2.2 `ocr-worker.ts`: pdf.js raster @300 DPI (one page in flight) → det → rec → CTC decode → text per page.
      Done when: worker returns correct text for the sample scan pages; peak memory stays bounded (one canvas).
- [ ] 2.3 `ocrDocument(id)`: read OPFS original, OCR `needsOcr` pages, splice blocks (correct page + char offsets), re-chunk, re-embed, index; cancellable; GPU serialized after embeddings.
      Done when: after `ocrDocument`, the doc is `ready` and a query retrieves an OCR'd passage.

## Phase 3 — UI (opt-in)

- [ ] 3.1 `scanned` status + "Read the scanned pages" action in detail panel + documents row + chat sources panel.
      Done when: the button appears only for `scanned` docs and starts the pass.
- [ ] 3.2 [P] Per-page progress (existing `setIngest` channel) + cancel; honest copy in both dictionaries.
      Done when: progress advances per page, cancel stops it, no `OCR` jargon; both locales sweep clean.

## Phase 4 — Verify

- [ ] 4.1 End-to-end on a real French scan: ingest → `scanned` → OCR → `ready` → cited answer opens the right page.
      Done when: spec.md Verification passes; network panel shows zero document egress and zero third-party fetch post-cache.

Completion checklist (all required before the spec is closed):

- [ ] All tasks checked with their Done-when verified
- [ ] spec.md "Verification" section executed end-to-end
- [ ] `bun run verify` passes
- [ ] PROGRESS.md updated

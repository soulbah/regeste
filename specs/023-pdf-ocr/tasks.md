# Tasks 023 — OCR for scanned PDFs

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

## Phase 0 — Spike (gates) — DONE, both gates PASS (2026-07-11)

Harness: `spike-ocr/` (plain Vite via `vite.spike.config.ts`, no CF adapter). Used
the `ppu-paddle-ocr` SDK as a throwaway to isolate accuracy from plumbing.

- [x] 0.1 Self-hosted PP-OCRv5 mobile ONNX (det 4.5 MB + latin_v5 rec 7.7 MB + dict), Apache-2.0, in `static/models/ocr/` (gitignored; fetch in spike-ocr/README).
- [x] 0.2 GATE 1 (WebGPU): PP-OCRv5 det+rec ran on ORT's WebGPU provider and produced correct output; ~220 ms/page warm. Owner's real GPU is the definitive perf check.
- [x] 0.3 GATE 2 (French): PASS on clean print — perfect `é è à ê û ç € —` + digits. Degraded synthetic loses accuracy (harsher than real scans); real-file testing via the harness upload. No fallback to Tesseract needed.

Phase-2 gotchas found: (a) Vite dev rewrites ORT's dynamic `import()` to `?import`
and 500s on same-origin public `.mjs` → self-host the ORT glue inside a worker
(like `embed-worker.ts`), not via a page import. (b) The CF `platformProxy`
(`hooks.server.ts` reads `platform.env` every request) spawns a `workerd` that can
wedge in sandboxes — irrelevant to prod, but the OCR worker must not depend on it.

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

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

## Phase 1 — Parser per-page merge — DONE

- [x] 1.1 `parsePdf` per-page: text pages keep blocks, image pages → `needsOcr[]`, never throws. (No unit test: parsePdf needs a real scanned-PDF fixture; a faked one would be a sugar test. Covered by check + the owner's live run.)
- [x] 1.2 `types.ts`: `ParsedDoc.needsOcr?`, `DocumentStatus` gains `'scanned'` + `'ocr'`; `scanned_pdf` repurposed to "OCR ran, still nothing". `bun run check` = 0 errors.
- [x] 1.3 `ingest` embeds any text pages then lands `scanned` when `needsOcr` non-empty (fully-scanned → no chunks + `scanned`, no error). Mixed PDFs are searchable on their text pages immediately.

## Phase 2 — OCR execution — DONE (deviation: main thread, SDK)

- [x] 2.1 `ocr-model.ts`: self-hosted `/models/ocr` PP-OCRv5 latin. Committed as static app assets (not a Cache-API download), so the model-management `labelFor` branch is N/A — nothing to list/delete.
- [x] 2.2 `ocr.ts` (NOT a worker — main thread, mirroring the proven spike; a worker was unverifiable here): pdf.js renders each page to an OffscreenCanvas @300 DPI, one in flight, ppu-paddle-ocr (PP-OCRv5) recognizes → text per page. **Validated live in the spike: OffscreenCanvas + self-hosted models → perfect French, 736 ms.**
- [x] 2.3 `ocrDocument(id)`: re-parses for `needsOcr`, OCRs those pages, splices blocks at their page numbers, re-chunks, re-embeds, re-indexes → `ready`; cancellable (AbortController → reverts to `scanned`).

## Phase 3 — UI (opt-in) — DONE

- [x] 3.1 `scanned`/`ocr` handled in the detail panel (bordered CTA block: "Read the scanned pages" → progress + Cancel), the documents row (meta + ⋯ menu action), and the chat sources panel (idle muted dot).
- [x] 3.2 Per-page progress via the existing `setIngest` channel + Cancel; copy in both dictionaries, verb-first, no "OCR" jargon. `bun run lint` = 0 errors.

## Phase 4 — Verify — PARTIAL (sandbox cannot run the app dev server)

- [x] `bun run verify` (check + lint + test + build) all green.
- [x] Engine + OffscreenCanvas path validated live in the plain-Vite spike.
- [ ] **Owner to run**: the integrated flow (ingest scanned PDF → `scanned` → tap Read → `ready` → cited answer) can only run in the real app; the CF `platformProxy` wedges `workerd` in this sandbox, so the app dev server won't start here. `bun run dev` on the owner's machine, open a scanned PDF, verify zero document egress.

Completion checklist:

- [x] `bun run verify` passes
- [x] PROGRESS.md updated
- [ ] spec.md Verification executed end-to-end (owner's machine — sandbox blocker above)

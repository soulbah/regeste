# Plan 034 — Layout-model parsing architecture

## Architecture

One new pipeline stage, regions, flowing through the existing shapes:

```
page image ──► ppu-doclayout (in the OCR worker) ──► LayoutRegion[]
                                                        │
positioned text ──► orderPdfText ──► blocks ──► tag by region overlap
                                                        │
chunker: sectionKey includes region class ──► chrome never glues to body
```

- **Where inference runs:** inside `ocr-worker.ts`. It already owns
  rasterisation (the hidden-tab rAF trap forced that), already loads ONNX
  wasm, and for scanned pages the bitmap already exists — regions are nearly
  free there. Born-digital pages that trip an uncertainty signal use the same
  worker's `renderPage` for a raster-only pass (no recognition).
- **Model:** PP-DocLayoutV3 (130 MB) through the `/cdn` proxy
  (`media.githubusercontent.com` is already allow-listed), threshold **0.15**,
  input size **800** — both measured; the library defaults (0.5, and any other
  size) return nothing usable.
- **Uncertainty signals** (born-digital routing, all cheap, computed from the
  positioned items we already have):
  1. bottom-band block ≥ 120 chars (legal-footer candidate; page numbers stay
     under it),
  2. priced-column candidate (the existing `isPricedColumn` inputs),
  3. multi-column gutter detected.
- **Block tagging:** a block whose y-center falls inside a `footer` / `header`
  / `aside_text` region gets `region` on `ParsedBlock`. The chunker folds the
  region into `sectionKey`, so chrome forms its own chunks and body order is
  restored (the attestation's balance sentence before the footer).
- **No legacy:** `PARSE_VERSION` bump forces re-index. Old chunks are not
  translated. If the model cannot load, blocks simply carry no region — the
  same parse, fewer hints.

## What the detector replaces (butcher list, this spec)

- The footer-glue repair: `roleHeadOf` + `CORPORATE_BOILERPLATE` in
  `retrieval.ts`, and the glued-footer test shapes. Chrome is segregated at
  chunk time now.
- The bottom-band heuristics in `pdf-layout.ts` that guessed at footers.
- NOT `personRoleCarrier`'s organisation context: it serves answer-time
  qualifier matching, spec 033's benchmark decides its fate.
- NOT `isPricedColumn` yet: the corpus measurement decides whether `table`
  regions are reliable on ruled tariff pages before that heuristic dies.

## Measurements that gate each step

| step                     | instrument                                            | gate                                         |
| ------------------------ | ----------------------------------------------------- | -------------------------------------------- |
| browser inference cost   | `/dev/layout` on owner PNGs                           | ≤ 3 s/page or stop                           |
| region quality on corpus | node probe over pre-rastered truth pages              | footer found on letter-shaped docs           |
| end quality              | `parser-ab --only ours,ours+layout,marker`            | wrong bindings ≤ 5/87, contamination ≥ 46/48 |
| app end-to-end           | re-ingest owner PDFs, three questions + reading order | spec's owner test                            |

## Deliverables

1. `src/lib/pipeline/layout-model.ts` — constants (model URL via /cdn,
   threshold, input size, labels of interest).
2. `ocr-worker.ts` — `detectLayout(pageNumber)` (raster + analyze, no
   recognition) and regions returned beside `recognizePage`.
3. `pdf-layout.ts` — uncertainty signals exported; block tagging from regions.
4. `chunk.ts` — region-aware `sectionKey`; chrome sections ordered after body.
5. `parser-ab` — `ours+layout` adapter over pre-rastered truth pages.
6. Deletions per the butcher list, with their tests rewritten to the new
   contract.
7. `/dev/layout` measurement page (kept: it is the calibration instrument).

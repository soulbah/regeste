# Tasks 034 — Layout-model parsing architecture

## T1 — Browser cost measurement

`done` — 1.31–1.41 s/page in the hidden pane (kill line was 3 s), footer at 0.95 on the attestation, region sets identical to node.

`/dev/layout`: run `ppu-doclayout/web` on the owner PNGs through the `/cdn`
proxy, report ms/page and regions found. This is the calibration instrument and
it stays after the spec ships.

**Done when:** detection ≤ 3 s/page in the browser on both owner pages, footer
found on the attestation. Above 3 s, the spec stops here and says so.

## T2 — Region quality on the corpus

`done` — `table` fires on every ruled AND shaded tariff page, zero tables on the IPIDs, chrome labelled; `isPricedColumn` stays until a table-region reconstruction exists (spec 035 candidate).

Pre-raster the truth-pair pages (pypdfium2, 200 DPI), run the node probe over
them, record which labels appear on tariff pages (does `table` fire on ruled
tariff tables?) and on the IPIDs.

**Done when:** a table of page → labels exists in the spec directory and the
`isPricedColumn` keep/kill call is made from it.

## T3 — Regions through the pipeline

`done` — split BEFORE ordering, per line with a 0.5 chrome floor and position bands (both added by measured regressions); heading fold in the chunker so a bare signature name survives the noise floor; RETRIEVAL_VERSION 23.

`layout-model.ts` constants; `detectLayout` in the OCR worker (raster-only
render + analyze); uncertainty signals in `pdf-layout.ts`; `region` on
`ParsedBlock`; region-aware `sectionKey` in `chunk.ts` with chrome after body;
parse-version bump forcing re-index.

**Done when:** `bun run verify` green; a unit test pins chrome segregation
(footer block never in the same chunk as the signature, body order restored).

## T4 — Measure end quality

`done` — bindings at parity with shipped (2 wrong ≤ 5 ✓), contamination 46/48 (the transient 48/48 came from unguarded junk chrome and was given back), OCR-triage false positive 1 → 0, attestation reads body → signature → footer with all four end-to-end assertions green.

`ours+layout` adapter in parser-ab over the pre-rastered pages.

**Done when:** wrong bindings ≤ 5/87, contamination ≥ 46/48, reading-order
defect on the attestation gone. Otherwise the routing is retuned or the spec
stops.

## T5 — Butcher

`done` — `roleHeadOf` and `CORPORATE_BOILERPLATE` deleted; the glued-footer test shapes rewritten to the new contract; 927 tests green.

Delete the footer-glue repair (`roleHeadOf`, `CORPORATE_BOILERPLATE`) and the
bottom-band footer guesses; rewrite their tests to the new contract.

**Done when:** the constants are gone, `bun run verify` green, stress answers
unregressed on the three owner questions.

## T6 — Deploy and hand to the owner

`todo`

**Done when:** deployed; PROGRESS updated with what changed, what was deferred
(PP-OCRv6, reranker quantization, wllama-VLM measurement), and the owner test
script from the spec.

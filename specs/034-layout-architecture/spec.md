# Spec 034 — Layout-model parsing architecture

## Why

The parser has no layout model, and the codebase grew a hand-written one:
column gutters, priced-column refusal, footer-glue repair, and ~27 document
vocabularies (`CORPORATE_BOILERPLATE`, `ORGANISATION_TOKEN`) that recognise a
legal footer by its nouns instead of its position. Measured on 87 hand-verified
pairs: 9 wrong label→value bindings against Marker's 2, and the owner's own
attestation reads its balance sentence after the legal footer. The owner
rejected the old architecture (2026-08-01): no legacy, no compatibility layer.

PP-DocLayout detects 25 region types in one forward pass (~1 s/page in node),
with no decoder that can loop and no fp16 graph that can overflow.

## What

- WHEN a page is recognised by OCR THEN the app SHALL also detect its layout
  regions from the same rasterisation, at no extra render cost.
- WHEN a born-digital page shows a layout-uncertainty signal (a dense
  bottom-band block, a priced-column candidate, a multi-column gutter) THEN the
  app SHALL rasterise that page off the main thread and detect its regions.
- WHEN blocks fall inside a detected `footer` or `header` region THEN the
  chunker SHALL keep them out of the body flow: body text first, page chrome
  after, never glued to a signature or a closing sentence.
- WHEN the layout model cannot load (offline, storage refused) THEN parsing
  SHALL proceed without regions — resilience, not a compatibility mode.
- WHEN a document was indexed by the old parser THEN the app SHALL re-index it
  (version bump), not translate it.
- The app SHALL CONTINUE TO pass every `Done when` of specs 023–027 that is not
  superseded here.

## Out of scope

- granite-docling through wllama (fallback parser for detector-unsettled
  pages): measured separately, own spec if the browser number holds.
- Deleting the answer-time vocabularies (spec 033 owns that; this spec only
  removes the parser-side ones the detector makes moot).
- PP-OCRv6 upgrade and reranker quantization: deferred, tracked in PROGRESS.

## Open questions

- None blocking. Consent for the 130–213 MB model download follows the
  documents-first rule (auto-run what the user clearly asked for) unless the
  owner objects; the storage-quota check runs before fetch either way.

## Verification

```bash
bun run verify
bun run parser-ab --only ours,ours+layout,marker
bun scripts/doclayout-probe.ts .scratch/attestation-p1.png 0.15 800
```

Kill criteria, set before implementation:

- browser detection > 3 s/page on routed pages → the detector does not ship
- wrong bindings not ≤ 5/87 with the detector on → the routing is not worth it

Owner test, after deploy: re-add the attestation and the RAPO agreement, then

1. "Quel est mon solde ?" — the cited passage must show the balance sentence in
   body order, before the legal footer, and the viewer highlight must match.
2. "Qui est le directeur d'agence du Banque Populaire ?" — still names the
   signatory.
3. "Combien coûte un RAPO ?" — still 1100 € HT.

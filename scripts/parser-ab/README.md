# Parser A/B

Compares PDF parsing strategies on documents of the kind people actually upload.

```bash
bun run parser-ab:fetch          # download + verify the corpus (once)
bun run parser-ab                # all adapters, all metrics
bun run parser-ab -- --failures  # list every individual failure
bun run parser-ab -- --only ours,liteparse:hybrid --json report.json
```

## Why this exists separately from `benchmarks/fuzzy-*`

`benchmarks/fuzzy-corpus-manifest.json` and `.benchmark-corpus/private` are the
**non-regression** corpus. `src/lib/pipeline/parse/pdf-layout.ts` was developed
against those exact files — its comments cite bugs found in them by name. They
are good at catching a regression and structurally unable to arbitrate a parser
choice: measuring a parser on the documents it was tuned against is marking your
own exam. Both parsers score within a point of each other there, and that result
means nothing.

This corpus is fetched fresh from public sources, pinned by digest, and **must
never be used to tune a heuristic**. If you tune against it, it stops being
evidence and a new one is needed.

## Corpus

18 documents, `benchmarks/parser-ab-manifest.json`, downloaded to
`.benchmark-corpus/parser-ab/` (gitignored; only URLs and hashes are committed).
Chosen to be both common and hard:

| class                      | what it stresses                                                  |
| -------------------------- | ----------------------------------------------------------------- |
| `tarifs-bancaires` (5)     | ruled and unruled price tables, multi-line cells, dot-leaders     |
| `assurance-ipid` (5)       | two side-by-side boxes: covered vs **not** covered                |
| `bulletin-de-paie`         | one row, two amounts (salarié / employeur), diagonal watermark    |
| `facture-energie`          | consumption table, taxes, totals, fine print                      |
| `diagnostic-immobilier`    | gauge graphics mixed with rating tables                           |
| `reglementaire-long`       | 185 pages, nested tables, figures                                 |
| `formulaire-cerfa`         | AcroForm fields and checkboxes                                    |
| `juridique-2-colonnes` (3) | two-column Official Journal, **paired with the publisher's HTML** |

The `fetch.ts` digest check is deliberately strict: when a bank reissues a
brochure the hash changes and the fetch fails rather than silently swapping the
document under the ground truth. That failure is the signal to re-verify the
pages listed in `truth.json`.

## Ground truth

`truth.json`. Every pair was read off a page image rendered with pdf.js at 4x
and checked by eye — never taken from a parser's output, so the labels favour
neither side. Re-render with any PDF viewer to audit them.

## Metrics

Five, reported separately and never averaged. They trade off against each other,
and the disagreements are the finding — a parser that concatenates a whole page
onto one line wins binding proximity and loses reading order.

1. **label→value binding** — does a price stay attached to the service it
   prices? `WRONG` means a _different_ value sits closer to the label than the
   right one. That is the damaging failure: a fluent, well-cited, incorrect
   answer. Authoritative but small-n.
2. **orphan values** — a value on a line carrying no word that could name it.
   Needs no labels so it covers every page, but a parser that never breaks lines
   trivially wins it. Direction only; read it beside metric 1, never instead.
3. **reading order** — against the publisher's own HTML of the same legal act.
   `CONTIGUOUS` is the real test: column interleaving leaves every word present
   and shears the sentence, passing recall and failing here.
4. **cross-section contamination** — does a statement share an output line with
   a statement from a different section? On an insurance IPID the two boxes are
   "what is covered" and "what is **not** covered"; when a parse fuses them, one
   line carries a covered peril and an exclusion at once and the chunk cannot
   tell the model which is which. Worst failure the corpus can express: real
   passage, real citation, inverted answer.

   Measured by co-occurrence, not by "the last heading before the item". Every
   IPID here puts both box headings on one output line — the heading rows share
   a y coordinate — so any heading-attribution rule is ambiguous for _both_
   sides. An earlier version of this metric used that rule and produced numbers
   that were an artifact of it. Items are matched on their opening words because
   both parsers wrap and truncate long statements mid-phrase.

5. **OCR triage** — pages whose text layer is unusable. Both errors cost in a
   browser: a false negative serves scan garbage as searchable text, a false
   positive burns seconds of on-device OCR the user waits through. Ground truth
   is label-free (does the extracted text read as language) and taken from one
   shared pdf.js extraction, so every adapter is judged against the same pages
   rather than against its own output.

## Adapters

Every adapter returns two views per page, because they have different jobs and
`pdf-layout.ts` already draws that line (`text` is cited, `retrievalContext` is
retrieval-only):

- `citationText` — what a citation points into. Must stay the document's own
  words, since character offsets are taken against it.
- `retrievalText` — what gets embedded and searched. May add structure the page
  implies, as long as nothing is invented.

| adapter                     | what it is                                                                        |
| --------------------------- | --------------------------------------------------------------------------------- |
| `ours`                      | the shipped pipeline: pdf.js text positions, XY-cut gutters, table-header binding |
| `liteparse:text`            | liteparse plain text for both views                                               |
| `liteparse:markdown`        | liteparse markdown for both views                                                 |
| `liteparse:hybrid`          | text view cited, markdown view retrieved — the proposed integration               |
| `liteparse:markdown+chrome` | same, keeping running headers/footers                                             |
| `routed`                    | per page: markdown where its rows bind values, our line order elsewhere           |
| `shipped`                   | what `src/lib/pipeline/parse/pdf.ts` now does — routing + raster scan triage      |

`shipped` imports the routing predicate, the markdown-to-text conversion and the
scan test from the app rather than restating them, so a change to the pipeline
shows up here without touching the harness. Keep `ours` around: it is the
pre-change baseline and the only way to see what the routing bought.

`routed` exists because neither parser wins everywhere and the split is
mechanical. liteparse's markdown reconstructs ruled price tables that our text
positions shear; it also renders _any_ two-column layout as a table, which on an
IPID pairs a covered peril with an exclusion. A page keeps the markdown view only
when a quarter of its table rows end in a value (an amount, a percentage,
`Gratuit`) — the property the win actually depends on. Cell length was tried
first and does not separate them: IPID rows are short bullets too.

`ours` duplicates the body of `parsePdf` rather than importing it, because that
module resolves the pdf.js worker through a Vite-only `?url` import. The three
modules that make the actual parsing decisions are imported directly, so the
measured behaviour is the app's.

liteparse adapters are configured from the package's own typings rather than
left on defaults: `preserveVerySmallText` on (French policy documents put binding
sublimits in 5pt type), `skipDiagonalText` on (matches the rotated-text filter
the app already applies to pdf.js, and removes the payslip's SPECIMEN
watermark), `imageMode: 'off'`, and `maxPages` raised well above the default
1000 so long documents are not silently truncated.

To add a parser, implement `Adapter` in `adapters.ts` and add it to
`defaultAdapters()`. Nothing else needs to change.

## Result

|                   | in chunk  | WRONG | contaminated | scan pages missed |
| ----------------- | --------- | ----- | ------------ | ----------------- |
| `ours` (before)   | 85% 74/87 | 10    | 2/48         | 229               |
| `shipped` (after) | 97% 84/87 | 3     | 2/48         | 35                |

Wrong bindings down from 10 to 3 and the scan blind spot down from 229 pages to
35, with contamination and reading order unchanged. Parsing costs about 4× more
(2.4s → 9.0s over 729 pages), all of it off the main thread.

The scan numbers come from the _retrieval_ corpus, not this one — the evaluation
corpus has almost no scans, so it cannot measure that fix. Using the retrieval
corpus is fair here for once: it was tuned against the reading order, never
against a scan detector.

## Known residual

The three binding failures `routed` still has are all on `bank-ca-2026.pdf` p2,
a shaded table with no ruling. liteparse emits no table for it, so the router
falls back to our reading order, which shears it. Unruled shaded tables are
unsolved by both parsers and are the obvious next target.

The routing rule was chosen while looking at this corpus. That makes it the one
part of this harness that is fitted to the evidence, so it needs confirming on
documents added later — the rest of the corpus never informed a heuristic.

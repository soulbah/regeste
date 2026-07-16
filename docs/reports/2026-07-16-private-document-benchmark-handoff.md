# Private document benchmark handoff — 2026-07-16

## Scope and honest result

The final 117-case Assurance run did **not** complete as one uninterrupted run. The browser
reloaded after saving case 53. The remaining cases were then resumed explicitly as cases 54–117.
Do not report a 117/117 score from these two runs: the first checkpoint was overwritten by the
suffix run before a consolidated report was exported.

Verified focused regression after the last fixes:

| Gate                 |                      Result |
| -------------------- | --------------------------: |
| Cases                |                         4/4 |
| Retrieval            |                         4/4 |
| Expected-page recall |                         4/4 |
| Answer triage        |                         4/4 |
| Final answer         |                         4/4 |
| Citation             |                         4/4 |
| Runtime              |                     28.47 s |
| Generation           | 4 extractive, 0 model calls |

Completed suffix run, cases 54–117:

| Gate                          |                                      Result |
| ----------------------------- | ------------------------------------------: |
| Automatic all-gates           |                              55/64 (85.94%) |
| Retrieval                     |                                       64/64 |
| Expected-page recall          |                                       64/64 |
| Answer-bearing lexical triage |                                       64/64 |
| Final answer comparator       |                                       56/64 |
| Citation comparator           |                                       63/64 |
| Runtime                       |                      1,572.84 s (26.21 min) |
| Generation                    | 28 extractive, 32 model calls, 0 cache hits |

Human source audit identifies three automatic false negatives:

- `annual-math`: exact calculation and difference are correct; comparator requires the literal
  token `non` and rejects “ils ne correspondent pas”.
- `historic-building`: “nous ne couvrons pas…” is an exact supported negative; comparator only
  accepts `non` or `pas couvert`.
- `gas-after-meter`: answer is exact and cited to the extracted assistance clause on page 32;
  oracle expects page 39. This is a page-oracle mismatch requiring PDF/source verification.

Six remaining product failures in the suffix:

- `assistance-insurer-territory`: territory correct, assistance carrier wrong.
- `assistance-hotel`: OCR table synthesis is incoherent and omits 150 EUR / three nights.
- `moving-storage`: returns 2 days / 750 EUR but omits 30 days / 500 EUR.
- `prescription-two-five`: misses general two-year and five-year drought periods.
- `renunciation`: returns 30-day reimbursement but omits 14-day renunciation period.
- `subscriber-identity`: returns birth date/place but omits subscriber name.

The suffix therefore has 58/64 human-correct sourced answers after removing the three invalid
automatic rejections. Full 117 quality remains **unvalidated**, because the first 53 results lack
an exported consolidated report.

## What changed

- Typed query analysis and bounded multilingual recall variants replace document-specific word
  matching.
- Hybrid dense/FTS5/fuzzy retrieval, query batching, embedding cache and worker-side ranking.
- Larger bounded evidence window preserves split OCR clauses and table continuations.
- Deterministic extractors cover arithmetic, dates, thresholds, forms, numbered lists,
  obligations, duration scopes and composed label/value requests.
- Answer-cache reuse validates the current oracle before accepting a cached generation.
- Dev benchmark records independent retrieval, page, answer-triage, answer and citation gates,
  plus human source review and resumable checkpoints.
- Original 40.5 MiB AEC fixture stays outside the Cloudflare asset graph; it is fetched into the
  ignored local corpus and verified by size/hash.

## Corpus preservation

Private local fixtures are intentionally ignored by Git and stored at:

`/Users/dev/Projects/saas/folio/.benchmark-corpus/private/`

Contents: Assurance PDF, `transfer-statement.pdf`, `Compromis Martin.pdf`, Martin call-for-funds PDF,
117-case matrix and oracle review. The Compromis original was recovered from the obsolete Claude
worktree before that worktree was removed.

Public research fixtures are reproducible through
`benchmarks/fuzzy-corpus-manifest.json`. `bun run benchmark:fetch` enforces an HTTPS host
allowlist, maximum size, exact byte count, SHA-256, file signature and UTF-8 checks.

## Prompt for the next independent agent

```text
Work only on /Users/dev/Projects/saas/folio, branch main. Never use or merge c556da.

Goal: independently validate and improve Folio's private document QA. Do not assume the current
automatic oracle is correct. Source corpus is local in .benchmark-corpus/private/; public corpus
is reproducible from benchmarks/fuzzy-corpus-manifest.json. Read PROGRESS.md, AGENTS.md and this
handoff first.

Known measured state:
- focused last-four regressions: 4/4 retrieval, page, answer and citation in 28.47 s;
- Assurance cases 54–117: automatic 55/64, retrieval/page/answer-bearing 64/64,
  answer 56/64, citation 63/64, 26.21 min;
- human audit marks annual-math, historic-building and gas-after-meter as oracle issues;
- six real suffix failures: assistance-insurer-territory, assistance-hotel, moving-storage,
  prescription-two-five, renunciation, subscriber-identity;
- full 117 run is not validated: browser reloaded at 53, suffix was resumed separately.

First inspect git diff and run bun run verify. Preserve existing changes unless evidence proves a
regression. Add a real Resume benchmark action that continues saved results without overwriting
the prefix, and export one machine-readable consolidated report. Then run retrieval-only gate
first. Run model generation only for changed/failed cases; do not spend 30–50 minutes regenerating
unchanged passes. Review every automatic failure against the actual PDF text and rendered page.
Classify each as product failure, oracle failure or citation-page numbering mismatch. Never count a
literal-string comparator failure as a product failure when the answer is semantically correct and
sourced.

Fix root causes only: OCR table structure, split-clause continuation, label/value binding,
cross-page synthesis, citation provenance. No document-specific answer strings, exhaustive intent
word lists or regex classifier. Re-run targeted failures, then the consolidated 117. Target 100%
human-correct+sourced; report automatic score separately. Stop after one final complete batch,
run bun run verify, exercise the real browser, update PROGRESS.md, and commit cleanly on main.
```

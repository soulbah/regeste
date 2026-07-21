# Fuzzy retrieval stress results — 2026-07-12

## Outcome

Quality gate passed on the real browser pipeline, not a mocked ranker:

| Metric                  | Fused result |     Gate |
| ----------------------- | -----------: | -------: |
| Recall@1                |        92.7% | reported |
| Recall@5 / Recall@10    |  100% / 100% |     ≥95% |
| MRR@10 / nDCG@10        |  100% / 100% | reported |
| Complete evidence       |         100% |     ≥95% |
| Hard-negative precision |         100% |     100% |
| Citation accuracy       |         100% |     100% |
| Warm p95                |     247.6 ms |  <300 ms |

The 20 browser cases cover noisy French queries over English sources, OCR spacing, a two-column CFR
and Federal Register notice, a 50-page historical NASA report, duplicate RFC 9110 TXT/PDF renditions,
DOCX tables, near identifiers, three-file Malik synthesis and three unsupported questions. The
deterministic generator separately keeps 300 labeled perturbation cases across keyboard/edit/Unicode,
OCR, layout, language, identity, numeric, absence and scale categories.

The real Martin chat now answers `Quel est le prxi de vnete exct du bien Cpelle ?` with `146.000,00
euros`, eight inspected passages and a clickable citation to the source PDF. The scoped diagnostic
returns page 19 in second position and passes the answer-bearing guard. The historical multi-document
pack finishes with evidence recall, complete-case rate and absent precision all equal to 100%.

## Ablation

Same documents, questions, scopes and truth labels; each retrieval channel isolated before final
fusion:

| Channel                    | Recall@1 | Recall@5 | MRR@10 | nDCG@10 | Complete evidence | Negative precision | Citations |
| -------------------------- | -------: | -------: | -----: | ------: | ----------------: | -----------------: | --------: |
| Exact lexical BM25         |    80.2% |    82.3% |  87.5% |   83.6% |             75.0% |               100% |     75.0% |
| Character-gram fuzzy       |    86.5% |     100% |  96.9% |   96.8% |             87.5% |               100% |     87.5% |
| Dense contextual           |    86.5% |    93.8% |  93.8% |   93.8% |             93.8% |               100% |     93.8% |
| Fused + guards + neighbors |    92.7% |     100% |   100% |    100% |              100% |               100% |      100% |

Conclusion: fuzzy improves typo recall, dense recovers paraphrase/cross-language evidence, exact BM25
protects literal IDs, and only fusion closes evidence/citation completeness. A reranker is rejected for
this milestone: no remaining quality gap justifies another model, download or runtime dependency.

## Fresh-ingest cost

Measured after deleting and re-ingesting only the ten controlled/public fuzzy fixtures. Originals were
already present in OPFS, so browser-storage and SQLite deltas measure this run but may reuse existing
files/pages; they are not presented as a pristine-profile install size.

| Measurement             |                                                  Result |
| ----------------------- | ------------------------------------------------------: |
| Input                   |                          6,495,366 bytes; 248 PDF pages |
| Wall time               |                                                 147.7 s |
| Throughput              |                              0.0419 MiB/s; 1.68 pages/s |
| Indexed chunks          |                                                   1,362 |
| Chunk source text       |                                         1,126,940 bytes |
| Float embedding payload |                                         1,394,688 bytes |
| SQLite file delta       |                      +114,688 bytes (free pages reused) |
| Browser storage delta   |                                        +4,706,304 bytes |
| Sampled peak JS memory  | unavailable; Chromium memory API exceeded the 1 s bound |

The unbounded experimental Chromium memory API initially stalled the benchmark. It is now time-bounded
and reports `null` rather than delaying ingestion. This metric does not affect production.

## Root bugs found and fixed by stress testing

All nine root causes below are fixed in the production path and protected by unit, deterministic-corpus
or real-browser regression tests. None is left as a report-only recommendation.

1. **Ready with zero chunks.** Retrieval-version repair reparsed scanned PDFs without OCR, atomically
   replacing a valid OCR index with an empty one and still setting `ready`. Repair now reruns OCR before
   swap, refuses empty swaps, detects old zero-chunk rows and sequences OCR/retrieval upgrades.
2. **Legacy filename invisibility.** Old `search_text` rows omitted document names. The v11 repair now
   rewrites word and fuzzy external-content rows atomically before background structure rebuild.
3. **Page-context citation leak.** Copying the first 600 page characters into every child made a correct
   page rank with the wrong passage. Parent context now propagates only from real headings/table context;
   PDF page numbers alone are not semantic parents.
4. **Two-column interleaving.** pdf.js items from left/right columns were joined on the same visual line.
   A conservative repeated-gutter detector reads sustained columns independently and leaves sparse
   label/value tables line-ordered.
5. **Fuzzy index tail loss.** A 768-gram cap dropped late table/RFC facts. The derived view now allows
   4,096 grams while the query is bounded to 40 discriminating grams.
6. **Exact identifier/file-extension conflict.** `RFC9110` conflicted with `RFC9110.PDF`. Identifier
   extraction now records both filename identifier and extension-free basename; near IDs still reject.
7. **Cross-document evidence loss.** Final selection could fill with one source. Synthesis preserves one
   leader per document; table rows repeat headers in retrieval-only context.
8. **Guard false refusals.** Four-letter transpositions (`prxi`) were deliberately excluded from fuzzy
   evidence validation; one edit is now allowed at length four. Instruction words and bilingual
   attribute aliases no longer dilute real evidence, while password/blood-type and exact-ID guards keep
   hard-negative precision at 100%.
9. **Global vector filtering risk.** Filtering after a small global top-k can lose a selected document.
   Scoped search remains exact. When efficient, vec0 KNN fetches `limit + outside-scope count`, which is
   mathematically sufficient to preserve the scoped top-k; narrow scopes retain the exact manual scan.

## Library boundary

Regeste uses established local primitives: SQLite FTS5 for word/full-text indexes, sqlite-vec `vec0` for
vectors/KNN, pdf.js for PDF extraction/rendering, Mammoth for DOCX and PP-OCRv5 through
`ppu-paddle-ocr` for OCR. Product-specific code is limited to normalized derived views, rank fusion,
structure/provenance and refusal guards.

This boundary is deliberate:

- **Library-owned:** parsing/rendering, OCR inference, word tokenization/ranking, vector storage and KNN.
  Regeste does not reimplement those engines.
- **Regeste-owned:** privacy-preserving derived text views, exact source offsets, cross-channel fusion,
  selected-document constraints, evidence diversity and unsupported-answer policy. Generic libraries do
  not know these product invariants.
- **No unjustified dependency:** a generic in-memory fuzzy package would require loading/ranking the
  corpus in JavaScript and would not provide SQLite lifecycle atomicity, exact-ID guards or citation
  provenance. The small normalizer/edit-distance layer stays bounded and regression-tested.

SQLite's native `trigram` tokenizer remains a worthwhile storage/performance ablation. The current
explicit gram view permits controlled OR-of-shared-grams under edit noise; native trigram is not adopted
without reproducing the same 100% evidence/negative gates and improving measured storage/latency. No
generic fuzzy-search package is added merely to replace a small deterministic normalizer already covered
by tests.

Primary implementation references:

- SQLite FTS5 trigram tokenizer: <https://www.sqlite.org/fts5.html#the_trigram_tokenizer>
- sqlite-vec KNN queries: <https://alexgarcia.xyz/sqlite-vec/features/knn.html>
- sqlite-vec metadata/filtering trade-offs: <https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html>

## Regression evidence

- Fuzzy browser corpus: no failures; all final quality gates above.
- Cross-document browser pack: evidence recall 100%, complete cases 100%, absence precision 100%.
- Invoice browser pack: Recall@5, exact aggregation, citations, record recall and currency-role accuracy
  all 100%; warm retrieval p95 65.4 ms.
- Record PDF/DOCX/TXT pack: exact aggregation, record recall and currency-role accuracy all 100%.
- Index health after upgrades: 54 documents, 1,528 chunks, zero `ready` documents with no chunks, zero
  stale retrieval versions; Martin has 102 chunks at retrieval version 5.

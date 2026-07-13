# Retrieval and query reliability mitigation — 2026-07-13

## Decision

Folio now treats routing, benchmark data and OCR-derived numbers as calibrated evidence rather than
universal truth. The safe default is abstention: an unknown embedding profile cannot change the route;
an ambiguous question asks for a slot; weak OCR can remain searchable and citable but cannot silently
enter exact arithmetic; an invalid benchmark asset fails before scoring.

The design stays hybrid. Small rules parse deterministic structure (dates, identifiers, arithmetic,
currency and explicit scope). A typed frame and execution plan compose those slots. Local embeddings are
consulted only for low-confidence route selection, under a model/dimension/prototype calibration profile.
This avoids both an exhaustive word-list classifier and a semantic-only rewrite.

## Research basis

- [CheckList](https://aclanthology.org/2020.acl-main.442/) shows why one held-out accuracy number is
  insufficient and organizes tests as minimum-functionality, invariance and directional expectations.
  Folio's matrix uses those categories plus hard negatives and misspellings.
- [CLINC out-of-scope evaluation](https://aclanthology.org/D19-1131/) establishes that production intent
  systems cannot assume every query belongs to one supported intent. Folio therefore leaves unknown
  profiles and uncertain route sets unchanged instead of forcing the nearest label.
- [Conformal Intent Classification and Clarification](https://aclanthology.org/2024.findings-naacl.156/)
  motivates small candidate sets and clarification. Folio implements the conservative behavior, but does
  **not** claim the paper's distribution-free coverage guarantee: the independent labeled calibration
  volume is not yet sufficient for that claim.
- [OWASP's file-upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
  recommends defense in depth: allowlists, size limits, declared-type distrust and signature/content
  validation. The benchmark fetcher now combines allowlisted HTTPS hosts, fixed sizes, SHA-256, signature
  detection, UTF-8 validation and post-ingestion page/chunk bounds.
- The existing architecture remains consistent with [TOP's compositional semantic
  parsing](https://aclanthology.org/D18-1300/), [Duckling's typed entity
  parsing](https://github.com/facebook/duckling), and the rule boundaries documented by
  [Rasa](https://rasa.com/docs/reference/primitives/intents-and-entities/) and
  [spaCy](https://spacy.io/usage/rule-based-matching/): rules are precise structural signals, not a full
  natural-language classifier.

## Nine root risks closed

1. **Perturbation leakage.** Accent, case, spacing and typo variants could be split across calibration and
   test. The stable split is now keyed by base utterance before expansion; tests prove disjoint base IDs.
2. **Global threshold drift.** A score calibrated for Gemma could mutate E5/WASM behavior. Profiles are
   keyed by prototype version, exact model and dimensions. Unknown or uncalibrated profiles abstain.
3. **Nearest-label overconfidence.** A close top score hid several plausible routes. Classification now
   emits a bounded candidate set and accepts only a unique candidate above score and margin gates.
4. **Route without execution semantics.** A label did not say whether to retrieve broadly, filter,
   compare, verify conflicts, aggregate or prove absence. A typed execution plan now composes those steps.
5. **Narrow clarification.** Only total scope and monetary role were covered. Local clarification now also
   handles relative time, missing entity context, document/revision, target currency and multi-part input.
6. **State-contaminated benchmark selection.** A same-named or large user file could satisfy a fixture.
   Reuse now requires the registered content hash; invalid or absent assets stop the run.
7. **Weak asset identity.** URL and extension could hide HTML or changed content. `file-type` owns binary
   signature detection; Folio adds host/size/hash/UTF-8 checks and expected parser output bounds.
8. **OCR certainty laundering.** Noisy recognized digits looked identical to native text. Page confidence
   now propagates to chunks/hits, one contrast retry is permitted, and low-confidence hits are excluded
   from exact financial facts while remaining available as cited evidence.
9. **Aggregate metrics hiding failures.** Reports now include denominators, Wilson 95% intervals,
   per-category failures, held-out metrics, coverage/abstention, cold/warm latency, runtime/model profile,
   threshold sweep and checked baseline regressions.

## Browser measurements

Measured locally in Chromium 150 on macOS, 12 logical cores, 16 GiB reported memory, WebGPU available,
cross-origin isolation enabled, EmbeddingGemma ONNX 256 dimensions, prototype v3, SQLite schema v12 using
`opfs-sahpool`.

| Gate                                                    |                                                          Observed |
| ------------------------------------------------------- | ----------------------------------------------------------------: |
| Semantic corpus                                         |                                                     372 questions |
| Held-out partition                                      | 240 questions, FR/EN, every route, ambiguities and hard negatives |
| Fused route / frame / slot / clarification / invariance |                                  100% / 100% / 100% / 100% / 100% |
| Baseline regressions / category failures                |                                                             0 / 0 |
| Accepted low-confidence cases                           |                                                          71 / 123 |
| Coverage                                                |                                57.72%, Wilson 95% CI 48.89–66.09% |
| Abstention                                              |                                42.28%, Wilson 95% CI 33.91–51.11% |
| Prototype cold work                                     |                                                        2407.01 ms |
| Warm local embedding                                    |                                        p50 32.40 ms, p95 39.78 ms |
| Invoice pack                                            |                                       all five quality gates 100% |
| Cross-document pack                                     |                                evidence/completeness/absence 100% |
| Fuzzy fused                                             |    Recall@5/10, MRR, nDCG, evidence, negatives and citations 100% |
| Fuzzy ablation Recall@5                                 |                            lexical 82.29%; fuzzy 100%; dense 100% |
| Fuzzy p95                                               |                                                         351.55 ms |
| Martin OCR                                             |                  answer-bearing; distinct relevant pages retained |

The separate 12-case held-out file is versioned independently from the generated matrix, but it was
still authored in the same development effort. It reduces accidental template leakage; it is not an
independent human evaluation and the report does not label it as one.

## Cost

- One development dependency: `file-type`, used only by the offline benchmark fetch command rather than a
  handwritten signature table.
- Public corpus manifest: 19,785,557 bytes across seven research assets. Large downloads and published
  browser fixtures are gitignored; the repository stores only manifest, licenses/URLs, hashes and bounds.
- OCR: unchanged 300 DPI first pass; only pages below confidence `0.78` pay one contrast preprocessing and
  one extra recognition. Retry count is bounded by a unit-tested predicate.
- Storage: one nullable `REAL` (`ocr_confidence`) per chunk and schema v12 migration. Existing native-text
  chunks store null and remain accepted for exact analytics.
- Query latency: deterministic high-confidence questions pay no semantic embedding. Only uncertain cases
  use the local model; 42.28% of those were deliberately rejected on this run.
- Benchmark reuse run: 1,362 registered chunks, 248 PDF pages, 1,126,940 indexed text bytes and 1,394,688
  embedding bytes; no new storage because verified fixtures were already indexed.

## Library versus Folio boundary

Libraries continue to own generic engines: pdf.js (PDF), Mammoth (DOCX), PP-OCRv5 through
`ppu-paddle-ocr` (recognition), Transformers.js/model artifacts (embeddings), SQLite FTS5 and sqlite-vec
(indexes), and `file-type` (binary signature detection). Folio owns the product contract around them:
privacy, model-profile registry, typed query frame, execution plan, clarification lifecycle, hybrid fusion,
OCR quality policy, provenance, fixture isolation, behavioral qrels and regression gates.

Folio does not implement a tokenizer, embedding model, OCR engine, MIME database, vector index or generic
intent framework.

## Reproduction

```bash
bun install --frozen-lockfile
bun run benchmark:fetch
bun run dev
# Open /dev/pipeline and run invoice, cross-document, fuzzy, Martin and semantic benchmarks.
bun run verify
```

The browser report prints runtime and model profile so two results are not compared as if hardware,
backend or dimensions were identical. The fetch command refuses changed assets; the browser refuses
signature/hash/bound mismatches before scoring.

## Honest remaining evidence boundary

- The Gemma 256D profile is calibrated and promoted. E5 384D is registered as uncalibrated and therefore
  safely abstains from semantic route mutation; it needs its own fresh browser calibration before promotion.
- A same-author held-out set cannot measure open-world generalization. Promotion to a claimed conformal
  guarantee needs independently written calibration/test queries, enough examples per route, a predeclared
  error rate and observed coverage on untouched data.
- This run proves Chromium/macOS/WebGPU. It does not prove Safari, Windows, Linux, low-memory devices or the
  E5/WASM fallback. The emitted profile and reproduction commands make those external runs comparable;
  claiming them without executing them would be false.
- OCR confidence is an engine score, not calibrated digit-level probability. The mitigation blocks weak
  OCR from exact sums and cites it for review; it cannot recover unreadable source pixels.
- File signatures and hashes protect benchmark identity, not arbitrary user-document malware analysis.
  Folio still parses locally in the browser and never uploads files; full CDR/antivirus is outside this
  local-only product boundary.

## Strict ablation follow-up

The first pass stopped too early because fused quality was perfect while lexical and dense ablations were
not. A case-level rerun exposed seven additional root problems:

1. Isolated channels skipped neighbor expansion, deduplication and diversity selection used by production.
2. The fused weak-score threshold was incorrectly applied to one-channel RRF, whose mathematical maximum
   is lower.
3. Query variants were merged by raw cosine values from different queries, although those scores are not
   directly comparable; rank fusion now merges original and expanded dense queries.
4. Plain TXT parsing discarded numbered section hierarchy; RFC-style headings now propagate to child
   chunks and retrieval index v7 rebuilds persisted views.
5. Evidence evaluation ignored `headingPath`, counting correct section citations as failures.
6. Reranking indexed headings but then omitted them from candidate scoring; heading coverage is explicit.
7. Negative evidence combined a password mention and a recommendation from unrelated passages, and even
   interpreted “password is deprecated” as a password value. Value questions now require structured
   label/value evidence in one passage.

Two attempted changes were rejected by browser evidence: increasing fuzzy candidates 60→160 did not fix
the missing section and raised p95 to 570.84 ms; a separate acronym fuzzy query regressed cross-format RFC.
Neither remains in production. The accepted solution stores distinct heading grams for structural fuzzy
queries while exact identifiers keep priority.

Final 20-case public/controlled browser matrix:

| Channel      | R@1 raw / ceiling / normalized | R@5/10            | MRR   | nDCG    | Complete evidence | Negatives | Citations |
| ------------ | ------------------------------ | ----------------- | ----- | ------- | ----------------- | --------- | --------- |
| Fused        | 92.708% / 92.708% / **100%**   | 100% / 100%       | 100%  | 100%    | 100%              | 100%      | 100%      |
| Fuzzy only   | 92.708% / 92.708% / **100%**   | 100% / 100%       | 100%  | 99.081% | 100%              | 100%      | 100%      |
| Dense only   | 92.708% / 92.708% / **100%**   | 100% / 100%       | 100%  | 100%    | 100%              | 100%      | 100%      |
| Lexical only | 80.208% / 92.708% / 86.517%    | 82.292% / 82.292% | 87.5% | 83.616% | 75%               | 100%      | 75%       |

Raw Recall@1 cannot reach 100% because one case requires three documents and another requires two; one
rank can retrieve at most one relevant document. Reports now emit the ceiling and normalized value instead
of presenting 92.708% as a defect. Lexical-only retains five expected misses: typo-only Cobb, French→English
NASA wording, typoed three-document Malik synthesis, an exact hourly phrase, and two-format RFC diversity.
Making that channel score 100% would require adding fuzzy or dense behavior and would invalidate the
ablation. A versioned baseline now requires fused/fuzzy/dense critical metrics at their achieved gates,
keeps a lexical floor, caps fused p95 at 600 ms, and prints every regression.

Fresh v7 corpus rebuild cost 236.49 s and +6 MiB browser storage for 1,432 chunks / 248 PDF pages. Warm
strict rerun p95 was 351.55 ms. Invoice, repeated-record, cross-document, Martin OCR and 372-case semantic
packs remained green; browser console had no errors.

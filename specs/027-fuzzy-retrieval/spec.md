# Spec 027 — Fuzzy, multi-view and adversarial retrieval

## Why

Regeste's current hybrid search combines exact word-level FTS5 and one dense embedding per structural
chunk. It remains brittle to user typos, OCR confusions, broken words, abbreviations, inflections,
near-identical identifiers and facts whose useful context lives in a parent section or another file.
The owner accepts slower ingestion when it produces materially better grounded answers. This extends
MVP retrieval/citations, P8/P9, D2-D4 and specs 024-026 without weakening the local-only boundary.

Research basis:

- SQLite FTS5's trigram tokenizer supports general substring matching and optional diacritic removal:
  https://www.sqlite.org/fts5.html#the_trigram_tokenizer
- Typo-robust dense-retrieval work shows misspellings materially damage passage retrieval and evaluates
  deletion, insertion, substitution and transposition noise:
  https://aclanthology.org/2021.emnlp-main.225/
  https://aclanthology.org/2023.acl-short.95/
- ColBERTv2 shows token-level late interaction can improve out-of-domain retrieval, but increases index
  footprint before compression: https://aclanthology.org/2022.naacl-main.272/
- MIRACL and NoMIRACL separate multilingual relevance from unsupported-answer rejection:
  https://arxiv.org/abs/2210.09984 and https://arxiv.org/abs/2312.11361
- OCR robustness work warns that good character/word accuracy alone does not guarantee downstream RAG
  retrieval quality: https://aclanthology.org/2026.acl-industry.60/

## What

- WHEN a query contains one or more realistic spelling mistakes THEN Regeste SHALL retrieve the same
  supporting evidence as the clean query when enough discriminating characters remain.
- WHEN a query or extracted passage differs only through accents, case, Unicode normalization,
  ligatures, apostrophes, hyphens, soft hyphens, line-break hyphenation or joined/split words THEN
  retrieval SHALL treat the forms as equivalent without altering displayed source text.
- WHEN OCR confuses `0/O`, `1/l/I`, `5/S`, `rn/m`, `cl/d` or inserts/deletes spaces THEN fuzzy retrieval
  SHALL recover candidates while exact identifiers and stronger context prevent cross-record matches.
- WHEN a typo affects a short exact identifier, date, amount, legal citation, model number or acronym
  THEN Regeste SHALL NOT silently replace it with a nearby identifier; it SHALL either recover evidence
  with explicit corroborating context or report weak/absent evidence.
- WHEN a document defines an acronym, alias or parenthetical long form THEN either form SHALL retrieve
  the same evidence. Domain vocabulary SHALL be derived from selected documents, not hard-coded into
  global product code.
- WHEN useful meaning spans a heading, table header, row, caption, footnote or parent section THEN every
  retrieved child SHALL carry enough structural context to answer and cite the original location.
- WHEN a long section contains several topics THEN retrieval SHALL expose fine-grained evidence without
  losing the section-level context needed to interpret it.
- WHEN several files each contain part of an answer THEN candidate generation and final selection SHALL
  preserve every required document instead of filling the result set with redundant passages from one
  source.
- WHEN documents contain homonyms, near identifiers, superseded revisions, negation or contradictory
  claims THEN fuzzy matching SHALL NOT merge their meanings. Exact discriminators, dates and provenance
  SHALL outrank approximate text similarity.
- WHEN a query has no supporting answer THEN spelling tolerance SHALL NOT turn a merely similar entity
  or attribute into evidence. Unsupported-answer precision SHALL be measured independently from recall.
- WHEN clean exact search already finds the correct evidence THEN fuzzy channels SHALL NOT lower its
  rank, change its citation or introduce a false positive.
- WHEN a file is ingested THEN Regeste MAY spend additional local CPU time and storage building multiple
  searchable views, derived vocabulary and hierarchical context. UI SHALL continue showing truthful
  named ingest phases and remain responsive/cancellable.
- WHEN an index schema or extraction version changes THEN existing documents SHALL upgrade from OPFS
  automatically, resumably and without requiring re-upload.
- WHEN benchmark documents are fetched from the web THEN only pinned public/licensed sources SHALL be
  used through a development-only manifest containing canonical URL, license/public-use evidence,
  expected hash, format and size. No network fetch SHALL occur in production ingestion or tests.
- The app SHALL CONTINUE TO keep originals, normalized views, vocabulary, embeddings, queries, OCR text,
  ranking and evaluation on-device. Display/citations SHALL use untouched source text and offsets.

## Adversarial coverage matrix

Every row below needs clean and perturbed query pairs, machine-checkable expected evidence, hard
negatives and citation locations:

- Keyboard: AZERTY/QWERTY neighbor substitution, insertion, deletion, adjacent transposition, doubled
  character, missing character.
- Language: FR/EN accents, inflection, singular/plural, conjugation, compound words, cross-language query
  over same concept, uncommon proper nouns.
- Unicode/layout: NFC/NFD, curly/straight apostrophes, non-breaking spaces, ligatures, soft hyphens,
  line-break hyphens, joined/split tokens, mojibake negative cases.
- OCR: digit/letter confusions, `rn/m`, `cl/d`, punctuation loss, column interleaving, headers/footers,
  rotated/landscape pages, low contrast and handwritten annotations as unsupported content.
- Structure: heading-only context, table headers repeated across pages, row/column intersection,
  caption/figure reference, footnote qualifiers, appendix/main-text references, parent-child facts.
- Identity: homonyms, one-character-different IDs, prefix collisions, reordered names, initials, aliases,
  acronyms and long forms.
- Semantics: synonym, paraphrase, negation, exception, superseded version, temporal scope, contradiction,
  answer split across two to four files, multiple answers inside each file.
- Numeric/exact: dates, decimals, thousands separators, currencies, units, section numbers, RFC/CFR
  citations, serial/model numbers and zero values.
- Absence/adversarial: plausible but missing attributes, entity-only overlap, nearby wrong answer,
  typo closer to wrong entity, prompt-like document text and unrelated high-semantic-similarity passages.
- Scale: tiny note, 500+ page born-digital PDF, 100+ page scan, dense two-column publication, repeated
  forms, duplicate format renditions and 100-document chat scope.

## Public benchmark corpus

Development manifest SHALL pin a deliberately heterogeneous, legally reusable corpus. Initial
candidates (final license/hash review required before download):

- NASA public-use scanned Apollo flight plan, landscape timelines and missing-page warning:
  https://www.nasa.gov/wp-content/uploads/static/apollo50th/pdf/a11final-fltpln.pdf
- NASA public-use technical report, born-digital/scanned comparison:
  https://ntrs.nasa.gov/citations/19720024229
- GovInfo Federal Register issue, dense two-column PDF:
  https://www.govinfo.gov/content/pkg/FR-2024-10-21/pdf/FR-2024-10-21.pdf
- GovInfo CFR section in PDF plus text/XML rendition for cross-format truth:
  https://www.govinfo.gov/app/details/CFR-2024-title49-vol3/CFR-2024-title49-vol3-sec178-516
- RFC 9110 official TXT/PDF renditions, abbreviations, exact section references and errata:
  https://www.rfc-editor.org/info/rfc9110/
- SEC EDGAR annual filing HTML/iXBRL transformed development-only into TXT/MD/DOCX, preserving tables
  and headings, with transformation hash and source accession recorded:
  https://www.sec.gov/Archives/edgar/data/1336917/000133691726000073/0001336917-26-000073-index.htm
- Synthetic fictional DOCX/PDF/TXT variants generated from public-use facts for controlled homonyms,
  contradictions, revisions and multi-file evidence. Synthetic truth remains canonical when public
  documents lack stable answer labels.

Downloaded binaries SHALL remain gitignored. Small generated fixtures, manifest, hashes, extraction
snapshots and question/answer labels MAY be committed when licensing and privacy checks pass.

## Quality and cost gates

- Clean-query Recall@5 and citation accuracy SHALL remain 100% on specs 024-026 regression packs.
- Perturbed-query evidence Recall@5 SHALL reach at least 95% overall and 100% for exact identifiers when
  user text preserves the identifier exactly.
- At least 95% of answerable multi-source cases SHALL retrieve the complete expected evidence set within
  the final context budget.
- Unsupported-attribute and wrong-near-identifier precision SHALL remain 100% on curated hard negatives.
- Clean/perturbed answer invariance SHALL reach at least 95% for deterministic answers.
- PDF/DOCX/TXT renditions of equivalent content SHALL produce the same evidence set and answer.
- Warm query p95 SHALL remain below 300 ms on the owner's reference machine for the pinned medium corpus.
- Benchmark SHALL report ingest wall time, pages/MB per second, peak memory, extracted-text bytes, index
  bytes, embedding bytes and total storage amplification. These metrics are visible gates, not hidden
  costs.
- Ingestion MAY be slower than today; no fixed multiplier is imposed until baseline measurement. It SHALL
  remain cancellable, resumable and free of main-thread stalls longer than one animation frame outside
  explicitly named OCR/model work.
- Any optional model/reranker/late-interaction experiment SHALL pass an isolated quality delta, download
  size, memory, storage and latency gate before becoming a runtime dependency. No model is adopted only
  because it improves one benchmark.

## Out of scope

- Server-side indexing, hosted vector databases, cloud OCR or document/query telemetry.
- Automatic replacement of user-visible query text or “Did you mean” UI in this spec.
- Supporting new production file formats such as HTML, XLSX, PPTX or EML; conversions exist only in the
  development benchmark corpus.
- Shipping a new reranker or late-interaction model before deterministic multi-view + fuzzy baselines
  show the remaining gap and owner validates its download/storage cost.
- Claiming universal fuzzy matching for arbitrary languages/scripts absent from the benchmark.

## Decisions

- Quality-first order validated: deterministic character/structure/multi-view retrieval ships first.
- No reranker or optional model is added: the measured baseline exceeds every quality gate, so another
  download, index and runtime cost has no demonstrated product benefit. Any future model requires a new,
  separately approved and measured spec.

## Verification

1. Run a pinned corpus fetch script twice: hashes/license manifest match; second run is idempotent and no
   fetched binary is tracked by Git.
2. Render/inspect every PDF and DOCX; record page count, text/OCR mode, rotations, tables and known layout
   traps. Reject malformed or sensitive sources.
3. Build at least 200 question cases: at least 80 realistic perturbations, 30 exact identifier/numeric,
   30 structure/table, 30 multi-document/identity/temporal/conflict and 30 absence/hard-negative cases;
   every case stores expected document, page/heading/chunk and answer/evidence policy.
4. Run an ablation report for exact lexical, fuzzy lexical, dense child, dense contextual/parent and fused
   retrieval. Report Recall@1/5/10, MRR@10, nDCG@10, complete-evidence rate, unsupported precision and
   citation accuracy by perturbation category.
5. Run all clean and noisy variants through PDF/DOCX/TXT ingest in `/dev/pipeline`; compare extraction,
   hierarchy, candidates, selected context and deterministic outputs.
6. Exercise real chats: typo, OCR confusion, acronym, exact ID, table lookup, multi-file synthesis,
   contradiction and absent attribute. What AI saw exposes correct untouched passages and citations open
   exact locations.
7. Interrupt ingest during every new phase, reload, resume and verify no duplicate index rows or stale
   schema/version cache.
8. Measure cold/warm ingest and query performance on owner machine at small/medium/large corpus sizes;
   compare storage before/after and confirm UI remains responsive.
9. Run `bun run verify`; rerun specs 024-026 browser benchmarks; open fresh browser session with no console
   errors and no network request containing document/query data.

Never contains: implementation details (→ plan.md), task breakdown (→ tasks.md).

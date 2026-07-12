# Plan 026 — Record-aware retrieval and exact analytics

## Evidence model

- Replace line-local amount guessing with explicit money spans: value and adjacent currency token are
  parsed together, using each currency's ISO fraction digits. This prevents a EUR symbol from claiming
  a later GNF value on the same line.
- Extract lightweight financial records from existing chunks, grouped by page or heading and split by
  transaction/invoice anchors where needed. A record carries stable key, optional identifier/date and
  typed facts (`sent`, `received`, `fee`, `debited`, invoice totals/tax/subtotal).
- Persist record key/date with cached facts in local schema v10. Bump extractor version so existing
  documents rebuild facts lazily on first analytical question; embeddings/chunks remain valid.

## Query analysis and exact path

- Normalize case/diacritics once. Analyze operation, exhaustive/list intent, requested money role and
  temporal scope (month/year/date range) from bounded FR/EN patterns.
- Route record lists/counts/time-scoped calculations to deterministic analytics. Keep singular
  identifier/date lookups targeted.
- Filter records before selecting facts. Deduplicate overlapping copies only inside one record; equal
  values from different record keys remain distinct. Group incompatible currencies instead of
  converting them.
- Format lists/counts/calculations from structured results with one citation per retained record.

## Retrieval

- Keep current hybrid scoped search. During exhaustive record questions, diversity control may remove
  same-page overlap/boilerplate but never another page solely because template prose is similar.
- Keep targeted-query compression so repeated identity boilerplate does not fill small-model context.

## Benchmark corpus

- Add anonymized repeated-record fixtures for PDF, DOCX and plain text. PDF mirrors seven near-identical
  receipt pages; DOCX stresses tables/merged textual labels; text stresses multiple records without
  page boundaries. No owner data or provider-specific identifiers enter Git.
- Add a versioned FR/EN question matrix with expected operation, record keys, exact groups and citation
  pages. Metrics separate record retrieval, execution exactness, citation coverage and currency-role
  attribution, following FinQA/TAT-QA/RAGChecker warnings.
- Extend `/dev/pipeline` benchmark to run both existing multi-document invoices and new single-document
  multi-record corpus.

## Tradeoffs

- No layout model, reranker or general table engine. Existing text/layout extraction is sufficient for
  this failure and keeps privacy/download cost unchanged.
- No exchange-rate conversion. Rates remain retrievable evidence; sums stay grouped by source currency.
- Page/heading/anchor heuristics cover repeated financial records without provider-specific schemas.

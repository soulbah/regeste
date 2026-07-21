# Fuzzy retrieval research and architecture decision — 2026-07-12

## Decision

Ship a deterministic, local three-channel baseline before adding a reranker:

1. preserve exact word BM25 and dense retrieval;
2. add a separate character-trigram FTS view for typos/OCR/layout noise;
3. enrich embeddings with bounded heading/parent/table-header context and acronym aliases;
4. fuse ranks with RRF, then apply exact-identifier mismatch guards and multi-document diversity;
5. measure unsupported-answer precision independently from recall.

No source text is rewritten. Citations continue to use original text and offsets. Extra ingestion CPU and
storage are accepted, measured and resumable from OPFS.

Measured implementation results and defects found are recorded in
`docs/reports/2026-07-12-fuzzy-retrieval-stress-results.md`.

## Evidence behind the choice

- SQLite documents trigram tokenization as substring-capable; a separate gram view preserves the clean
  word index and makes its cost ablatable: <https://www.sqlite.org/fts5.html#the_trigram_tokenizer>.
- Zhuang and Zuccon show deletion, insertion, substitution and transposition typos materially hurt
  neural retrieval: <https://aclanthology.org/2021.emnlp-main.225/>.
- Sidiropoulos and Kanoulas show typo-robust dense training can help, but this would require a model
  change; deterministic grams are the lower-risk first layer:
  <https://aclanthology.org/2023.acl-short.95/>.
- ColBERTv2 supports token-level late interaction but its additional index/model cost warrants a gated
  experiment, not an initial dependency: <https://aclanthology.org/2022.naacl-main.272/>.
- MIRACL supplies multilingual retrieval methodology while NoMIRACL explicitly evaluates non-relevant
  query rejection; optimizing recall alone is insufficient:
  <https://arxiv.org/abs/2210.09984>, <https://arxiv.org/abs/2312.11361>.
- OCR research reports that OCR quality metrics do not reliably predict downstream RAG quality, hence
  the corpus includes real noisy scans and end-to-end evidence tests:
  <https://aclanthology.org/2026.acl-industry.60/>.
- TableRAG supports structure-aware table retrieval rather than flattening away headers:
  <https://aclanthology.org/2025.emnlp-main.710/>.
- HiChunk, TreeRAG and H-RAG support hierarchical/parent-child context, while MultiDocFusion motivates
  explicit evidence diversity across documents:
  <https://aclanthology.org/2026.acl-long.1372/>,
  <https://aclanthology.org/2025.findings-acl.20/>,
  <https://aclanthology.org/2026.semeval-1.155/>,
  <https://aclanthology.org/2025.emnlp-main.1062/>.
- sqlite-vec documents optimized `vec0` KNN through `embedding MATCH ? AND k = ?`; Regeste uses this
  established primitive only where exact scoped-top-k preservation can be proven:
  <https://alexgarcia.xyz/sqlite-vec/features/knn.html>.

## Release gate

The fuzzy path does not ship as “done” unless perturbed Recall@5 and multi-source completeness reach
95%, hard-negative/near-ID precision remains 100%, clean regressions remain 100%, and warm p95 remains
below 300 ms on the reference machine. A reranker is considered only if this measured baseline misses
the quality gate.

# Plan 027 — Fuzzy, multi-view and adversarial retrieval

## Evidence-led decisions

- Character n-grams are language-independent and robust to insert/delete/substitute/transpose noise;
  use a separate FTS5 gram channel, never destructive query autocorrection.
- Preserve exact word BM25 and dense retrieval. Fuse independent rank lists with generalized RRF;
  ablate each channel. Exact identifiers receive explicit match/mismatch guards.
- Build deterministic ingestion views: untouched source, context-enriched text, normalized fuzzy grams,
  acronym/alias forms and structural parent context. No new model or domain dictionary.
- Parent-child retrieval follows hierarchical-RAG findings: retrieve fine children, attach bounded parent
  context, never hard-filter documents at parent level.
- Table rows retain headers in retrieval-only context. Display/citation still uses original row/page text.
- Synthesis selection uses relevance + novelty + document coverage; targeted queries remain compact.
- Optional reranker/late interaction stays behind benchmark gate. Initial architecture adds no model.

## Local data flow

`ParsedBlock source + retrievalContext` → structure-aware child chunks → context/alias normalization →
`search_text` word+dense view + `fuzzy_text` char-gram view → embeddings → atomic schema-v11 insert.

Query → exact word BM25 + fuzzy gram BM25 + dense vector candidates → generalized RRF → exact-ID and
query-coverage calibration → neighbor/parent expansion → diversity selection → evidence guard → answer.

## Schema and migration

- v11 adds `chunks.fuzzy_text`, `documents.retrieval_version`, and external-content `chunks_fuzzy_fts`.
- Every insert/delete/replace/reindex transaction updates word FTS, fuzzy FTS and vector index together.
- `RETRIEVAL_INDEX_VERSION=2`; ready v1 documents rebuild from OPFS automatically through existing
  resumable processing. Version flips only after atomic index completion.

## Benchmark architecture

- `benchmark/fuzzy-corpus-manifest.json`: URLs, public-use/license URL, SHA-256, size, format.
- `scripts/fetch-fuzzy-benchmark.ts`: allowlisted HTTPS only, size cap, hash verification, gitignored output.
- Deterministic perturbation generator creates keyboard, edit, Unicode, OCR and layout variants.
- ≥200 labeled cases combine pinned public documents and synthetic controlled truth.
- Report per-channel and fused Recall@1/5/10, MRR, nDCG, evidence completeness, negative precision,
  citation accuracy, query p95, ingest time and storage amplification.

## Main files

- `src/lib/pipeline/fuzzy.ts`: normalization, grams, aliases, identifiers, typo similarity.
- `src/lib/pipeline/chunk.ts` + parsers: bounded parent/table context.
- `src/lib/local-db/schema.ts`, `worker.ts`: v11 fuzzy index and three-channel search.
- `src/lib/pipeline/retrieval.ts`: generalized fusion, ID guards, diversity.
- `src/lib/state/documents.svelte.ts`: versioned repair and fuzzy candidate orchestration.
- `src/lib/benchmark/fuzzy-*`, `/dev/pipeline`: corpus, perturbations, metrics and live harness.

## Tradeoffs

- More ingest CPU/storage accepted; report cost explicitly. Gram text is deterministic and resumable.
- Fuzzy recall never overrides exact identifiers. False-positive gate blocks shipping before recall gate.
- No web document enters production bundle; fetched corpus stays development-only and gitignored.
- No model summary/entity extraction: avoids hidden hallucinations, downloads and privacy ambiguity.

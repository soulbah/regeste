# Semantic query understanding and retrieval stress report — 2026-07-13

## Outcome

Folio now resolves a typed query frame before retrieval: route, operation, financial role, scope,
time range, identifiers, follow-up state, answer shape, confidence and clarification. Deterministic
parsing handles exact structure; the existing local multilingual embedding model is used only for
low-confidence route fallback. Ambiguous monetary questions ask a local clarification instead of
guessing. No document text, query, frame or embedding leaves the browser.

This is deliberately not an exhaustive dictionary. The checked asset is a versioned behavior corpus
with expected frames and controlled perturbations. Vocabulary rules remain small and specific to
deterministic concepts such as dates, record identifiers, arithmetic operations and money roles.

## What comparable open-source projects provide

There is no useful universal “RAG word matrix”. The reusable open-source building blocks fall into
four complementary groups:

| Need                          | Public reference                                                                                                                                                                                                                                                                                                                                                          | What Folio adopts                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Heterogeneous retrieval qrels | [BEIR](https://github.com/beir-cellar/beir), [MIRACL](https://aclanthology.org/2023.tacl-1.63/)                                                                                                                                                                                                                                                                           | Query/document relevance labels, Recall@k, MRR and nDCG, heterogeneous document formats |
| Behavioral NLP testing        | [CheckList](https://github.com/marcotcr/checklist)                                                                                                                                                                                                                                                                                                                        | Minimum-functionality, invariance and directional perturbation matrices                 |
| Intent + slots                | [TOP](https://aclanthology.org/D18-1300/), [MTOP](https://aclanthology.org/2021.eacl-main.257/), [Duckling](https://github.com/facebook/duckling)                                                                                                                                                                                                                         | Compositional frame, bilingual cases, deterministic entity dimensions                   |
| End-to-end RAG evaluation     | [RAGBench](https://github.com/rungalileo/ragbench), [TREC RAG](https://pages.nist.gov/trec-browser/trec33/rag/overview/), [EnterpriseRAG-Bench](https://github.com/onyx-dot-app/EnterpriseRAG-Bench), [Ragas](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/), [TruLens RAG triad](https://www.trulens.org/getting_started/core_concepts/rag_triad/) | Separate retrieval, evidence completeness, grounded answer and citation checks          |

Rasa and spaCy both position regex/lookup rules as precise signals, not a complete general-language
classifier ([Rasa](https://rasa.com/docs/reference/primitives/intents-and-entities/),
[spaCy](https://spacy.io/usage/rule-based-matching/)). BEIR also reports that no single dense method
dominates heterogeneous zero-shot retrieval and that reranking improves quality at added compute cost.
That supports Folio's hybrid lexical/fuzzy/dense retrieval and its measured ablations rather than a
dense-only rewrite.

## Behavior corpus

Corpus v1 contains 360 labeled French/English questions: 60 base requests, each rendered as plain,
case, punctuation, accent, spacing and typo variants. It covers:

- arithmetic operations and sent/received/fee/debited/tax/subtotal/TTC roles;
- single record, page, date and selected-collection scope;
- exact identifiers and near-identifier negatives;
- synthesis across files, targeted questions, elliptical follow-ups and translations;
- ambiguous totals requiring scope then financial-role clarification;
- general document questions that must not be forced into an aggregate route;
- free-form synthesis paraphrases reserved for semantic fallback.

The corpus is domain-shaped but document-independent: it tests query behavior, not memorized facts from
`transfer-statement.pdf` or Martin. Retrieval truth remains in separate synthetic and public-document qrels.

## Ablation and metrics

Measured in the browser with the installed `multilingual-e5-small` profile:

| Query resolver         | Route accuracy | Frame exact match | Slot accuracy | Clarification P/R | Invariance |
| ---------------------- | -------------: | ----------------: | ------------: | ----------------: | ---------: |
| Deterministic only     |         83.33% |            83.33% |          100% |       100% / 100% |       100% |
| Semantic only          |         74.44% |            74.44% |          100% |       100% / 100% |     74.00% |
| Fused rules + fallback |       **100%** |          **100%** |      **100%** |   **100% / 100%** |   **100%** |

The deterministic score is intentionally lower because 60 free-form cases have no phrase rule. The
semantic-only score demonstrates why embeddings must not replace exact slots. The fused path embeds 120
low-confidence cases, accepts 71 and rejects 49. A threshold sweep selected cosine score `0.42` and
top-route margin `0.03`: 100% on corpus v1 with zero unsafe route changes in its hard-negative set.

Fallback latency after model readiness: p50 26.15 ms, p95 27.10 ms. Prototype cold work with a warm
model was 202.51 ms. The first observed model initialization was about 1.7 s; that is a device/session
startup cost and must not be hidden behind the warm number.

Retrieval regression packs after the refactor:

| Pack                             | Result                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 25 invoices                      | Recall@5, aggregate exact match, citation coverage, record recall, currency-role accuracy: **100%**             |
| Cross-document                   | Evidence recall, complete-case rate, absent-case precision: **100%**                                            |
| Public + controlled fuzzy corpus | Recall@5/10, MRR@10, nDCG@10, complete evidence, negative precision, citation accuracy: **100%**; p95 242.48 ms |
| Fuzzy ablation                   | lexical Recall@5 82.29%; fuzzy 100%; dense 93.75%; fused 100%                                                   |
| Martin OCR                      | Noisy price query answer-bearing; relevant price/financing pages retained                                       |
| Real repeated records            | `Combien j'ai envoyé au total ?` → 1,370.00 EUR from seven cited records; single-record request stays targeted  |
| Reloaded clarification           | scope clarification → reload → role clarification → reload → exact 1,370.00 EUR aggregate with seven citations  |

## Cost

- No new dependency, cloud classifier, model download or server endpoint.
- Fourteen short bilingual prototype anchors reuse the local 256-dimensional embedding worker. Cached
  anchor vectors cost about 14 KB plus small JavaScript metadata.
- High-confidence deterministic questions add no embedding latency.
- Low-confidence questions add one local query embedding, about 26 ms p50 after readiness.
- Ingestion and retrieval storage formats are unchanged. The existing quality-first cost remains in
  parsing/OCR, contextual chunks, FTS5, sqlite-vec and cached facts.

## Nine root bugs and fixes

1. **Flat overlapping phrase rules:** equivalent wording selected different routes. Replaced by one
   compositional frame with evidence and confidence.
2. **Money-role drift:** aggregate, retrieval and prompt code independently inferred “sent”, “received”
   and fee values. Role parsing is centralized and passed through execution.
3. **Collection versus record confusion:** “total sent” could be answered from one top passage. Structural
   record/page scope now overrides collection aggregation; otherwise role-bearing sums are exhaustive.
4. **Follow-up contamination:** locale, previous-turn, temporal and generation-budget heuristics disagreed.
   They now consume the same frame or its centralized features.
5. **Nominal semantic fallback:** the original `0.70` score threshold rejected 100% of fallback decisions.
   Normalized inputs, versioned prototypes and a score/margin sweep made the fallback effective.
6. **No honest abstention:** an underspecified total was guessed. Scope and financial role now trigger
   short localized clarifications with no citation, related-question call or egress.
7. **Broken multi-step clarification composition:** after the second reload, the last slot replaced the
   original question and fell back to generation. The full chain of user slots is now rebuilt around the
   original question; assistant control text is excluded.
8. **Neighbor runtime inconsistencies:** related-question duplicates could crash keyed rendering and the
   unused SQLite async OPFS VFS requested a missing proxy Worker. Output is deduplicated and that VFS is
   disabled while `opfs-sahpool` remains active.
9. **State-dependent benchmark false failure:** missing fixture URLs returned the app's HTML fallback,
   which was ingested as a one-page PDF and collapsed fuzzy scores. The harness now reuses the largest
   valid ready fixture and rejects HTML/missing assets explicitly.

## Library versus Folio boundary

Library-owned behavior stays library-owned:

- PDF parsing/rendering: pdf.js;
- DOCX parsing: Mammoth;
- OCR inference: `ppu-paddle-ocr` / PP-OCRv5;
- embeddings: Transformers.js and the installed multilingual E5 model;
- lexical and vector storage/search: SQLite FTS5 and sqlite-vec.

Folio code owns the product-specific contract those libraries cannot supply: privacy, typed query frame,
financial ontology, scope semantics, clarification state, hybrid candidate fusion, evidence/citation
provenance, behavioral corpora, thresholds and regression gates. Folio does not implement a tokenizer,
embedding model, OCR engine, vector index or generic NLU framework.

## Honest limits and next gates

- Corpus v1 is a strong regression set, not a statistical guarantee for arbitrary languages or domains.
- Threshold scores are model/profile-specific. A model change must rerun calibration; the numbers are not
  probabilities.
- Clarification quality is checked for the currently specialized arithmetic ambiguities. Open-ended
  conversational ambiguity still uses grounded retrieval/refusal.
- Semantic prototypes cover three execution routes, not every possible user intent. Adding a new route
  requires new hard negatives and a fresh threshold sweep.
- The fuzzy benchmark can reuse already indexed public fixtures. A clean machine still needs those large,
  gitignored public assets downloaded before that browser benchmark; it now fails explicitly if absent.
- Real OCR remains dependent on scan quality. Retrieval may find price-related pages without making every
  OCR token exact.
- Future promotion should add held-out paraphrases written by someone other than the implementer and a
  second device/browser profile. If the labeled set becomes large enough, conformal abstention can replace
  fixed thresholds; doing that today would overstate calibration.

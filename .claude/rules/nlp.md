---
paths:
  - 'src/lib/pipeline/**'
  - 'src/lib/nlu/**'
  - 'src/lib/private-ai/**'
  - 'src/lib/analysis/**'
  - 'src/lib/retrieval-context.ts'
---

# NLP rules — no hand-maintained vocabularies

Owner rule, 2026-08-01, after measuring 337 word-list sites across 14 files. The
verdict was that they pollute the code and cost rendering quality, and that this
product runs a classic RAG with modern optimizations, not bespoke plumbing.

## The hard rule

**Never add a regex that enumerates words.** If you are about to write
`/\b(?:combien|prix|montant|tarif|honoraires)\b/`, stop: that is a classifier
with a hand-written weight vector, and it will be wrong in the next sentence
somebody types.

The failure is not hypothetical. `requestedNumericKinds` matched `coûte` and not
`coute`, so a missing circumflex silently disabled an entire answer correction,
and nobody could have found it by reading the code.

## The line: token TYPE vs VOCABULARY

A pattern over a token **type** is lexing. It is stable across languages and
across time, and it stays.

```ts
const AMOUNT = /\d[\d\s.,]*\s*(?:€|eur\b|usd\b)/iu;   // fine: a shape
const HONORIFIC = /^(?:m\.|mme|dr\.?|ma[iî]tre)\s+/iu; // fine: a closed set
```

A pattern over a **vocabulary** is a classifier in disguise. It does not stay.

```ts
const ASKS_A_COST = /\b(?:combien|cout\w*|prix|montant|tarif\w*)\b/iu; // banned
const ORGANISATION_TOKEN = /\b(?:societe|caisse|banque|groupe)\b/iu;    // banned
```

The test: could a competent speaker of the language add a word to this list
tomorrow? If yes, it is a vocabulary. Closed sets that a standards body fixed
(currency marks, ISO date separators, civility titles) are types.

## What replaces them

**Intent and draft classification → prototype embeddings.** The question is
already encoded for retrieval and cached in `QueryEmbeddingCache`, so
classifying it costs one dot product per class, not a forward pass. Write four
to eight example sentences per class, encode them once, take the cosine. Eight
examples generalize to phrasings nobody enumerated, and they are multilingual
for free because `embeddinggemma-300m` / `multilingual-e5-small` are.

**Answer shape → constrained decoding, not post-hoc repair.** Both runtimes we
already ship support it: `web-llm` takes `response_format: { type: 'grammar' }`
(XGrammar) and `wllama` takes `grammar` in its sampling config (llama.cpp GBNF).
A shape the grammar forbids cannot be emitted, so it never needs detecting. A
model that cannot say "je peux vous répondre" needs no `isMetaNonAnswer`.

**Groundedness → an entailment encoder, if measurement demands one.** That is
the published mechanism (LettuceDetect, Luna, NLI fine-tuning), not regex. The
smallest multilingual candidate is `onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX`
at 107 MB int8, so it can only ever be opt-in behind the same consent grammar as
the reranker. Do not make it mandatory.

## What is not in question

Retrieval scoring is clean and stays that way: embeddings + BM25 fused by RRF,
then a cross-encoder. No lexical boost has ever touched a score, and none may.

The correction-retry architecture is published work (Corrective RAG, Self-RAG)
and is not what the rule is about. Detecting insufficient evidence and reasking
is legitimate; detecting it by keyword is not.

## Before you add anything here

A new correction needs a failing case from a real document and a measurement
that it moves the benchmark. "It might help" is how 337 of these arrived.

# Spec 033 — Remove the hand-maintained vocabularies

## Why

The answer pipeline decides what a question asks and whether a draft answered it
by matching hand-written word lists. Measured on 2026-08-01: **337 sites across
14 files**, worst in `extractive-answer.ts` (41), `retrieval.ts` (23),
`prompt.ts` (21), `relevance.ts` (14).

They are unfalsifiable, monolingual in practice, and silently brittle. The
motivating defect: `requestedNumericKinds` matches `coûte` and not `coute`, so a
question typed without the circumflex disabled an entire correction, and no test
could have caught it because nobody can enumerate a language.

Owner decision, 2026-08-01: this product runs a classic RAG with modern
optimizations. The plumbing goes.

## What

- WHEN the app classifies what a question asks THEN it SHALL compare the
  question's embedding to labelled example questions, never to a word list.
- WHEN the app decides whether a draft answered THEN it SHALL rely on the
  decoding grammar and on evidence checks, never on a refusal vocabulary.
- WHEN the private model generates an answer THEN the runtime SHALL constrain
  decoding to a grammar that admits a cited answer or the app's own refusal, and
  nothing else.
- WHEN a pattern describes a token TYPE (an amount, a date, an honorific, a
  citation marker) THEN it MAY remain a regex.
- The app SHALL CONTINUE TO score retrieval with embeddings + BM25 fused by RRF
  and a cross-encoder, with no lexical term touching a score.
- The app SHALL CONTINUE TO answer every question in the stress benchmark at or
  above the baseline recorded before the first task of this spec.

## Out of scope

- An entailment encoder for groundedness. The smallest multilingual candidate is
  107 MB int8, so it can only be opt-in behind a consent, and it is only worth
  adding if measurement here demands it. Its own spec if so.
- Retrieval scoring, chunking and parsing. Not implicated, not touched.
- The Cloud and Your server modes' prompts, except where they share the grammar.

## Open questions

- None blocking. The grammar's exact shape is a plan question, not a product one.

## Verification

```bash
bun run test          # unit, including the prototype-classifier boundary tests
bun run verify        # the done gate
```

Then, on the owner's own documents through the real app:

1. `Combien coûte un RAPO ?` and `Combien coute un rapo ?` return the same
   amount. The accent must stop mattering.
2. `Qui est le directeur d'agence du Banque Populaire ?` names the signatory;
   `Qui est le directeur financier ?` refuses on the same document.
3. `Quel est mon solde ?` answers in the second person and names no role.
4. A question the documents cannot answer returns the app's refusal, never a
   sentence offering to answer.

The gate is the stress benchmark, run before the first task and after the last:
no answer group may regress.

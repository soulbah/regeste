# Plan 033 — Remove the hand-maintained vocabularies

## The audit

337 sites, 14 files. They are not one thing, and the cleanup fails if they are
treated as one. Three kinds, with very different fates.

### Type A — token-type lexers (keep, ~60 sites)

Describe a token's shape. Stable across languages and across time.

`AMOUNT_CELL`, `AMOUNT_IN_TEXT`, `CURRENCY_PATTERN`, `EXPLICIT_TIME`
(`\d{1,2}[h:]\d{2}`), `TEXT_DATE_PATTERN`, `PERSON_NAME` (a capitalised run),
`HONORIFIC`, `SCHEDULE_ROW_PATTERN`, `VALUE_CELL`, `CITATION_MARKER`,
`TRANSLATION_PREFIX` and `RETRIEVAL_PREFIX` (they parse our own prompt output,
which is structure we control).

These stay, and the rule in `.claude/rules/nlp.md` says why.

### Type B — question-intent vocabularies (replace, ~180 sites)

Decide what kind of question this is. Every one is a text classifier written by
hand.

| Site                                                                            | File                             | Class it really computes    |
| ------------------------------------------------------------------------------- | -------------------------------- | --------------------------- |
| `ASKS_A_COST`, `MONEY_CONTEXT`, `EXACT_VALUE_QUESTION`                          | retrieval, frame, relevance      | asks an amount              |
| `requestedNumericKinds` (money/date/duration/count)                             | retrieval                        | asks a figure, which kind   |
| `asksForDate` / `asksForTime` / `asksWhen` (×2)                                 | relevance                        | asks a moment               |
| `PERSON_ROLE_ASKED`, `wantsNamedPerson`, `wantsCompanion`                       | retrieval, relevance             | asks who                    |
| `conflictRequested` / `absenceRequested` / `compareRequested`                   | execution-plan                   | operation over documents    |
| `interrogatives`, `synthesis`, `financiallyAggregate`, `exhaustiveDocumentList` | frame                            | route                       |
| `DEMONSTRATIVE_WITH_NOUN`, `CONTESTATION_LEAD`                                  | clarification, retrieval-context | needs clarification         |
| `METRIC_SLOT_TERM`, `actionPattern`, `temporalPair`                             | extractive-answer                | which slot the answer fills |

All of it is "classify a short sentence into one of N intents", which is what
the embedder already loaded in all three modes does natively.

### Type C — answer-shape vocabularies (delete, ~70 sites)

Detect that the model misbehaved, then repair the text.

`isRefusalLike`, `BLAMES_THE_READER`, `OFFERS_TO_ANSWER`, `isPureRefusalLike`,
`NON_QUERY_CANDIDATE`, the second-person flip in `enforceAnswerInvariants`, the
citation repair in `resolveCitations` / `resolveTargetedCitations`.

These exist because the decoder was free to emit anything. It does not have to
be.

### Type D — document vocabularies (case by case, ~27 sites)

`ORGANISATION_TOKEN`, `CORPORATE_BOILERPLATE`, `COMPANION_ROLE`, `LABEL_NOISE`,
`NEGATION`, `structuralPattern`. They read the document rather than the
question, so prototypes are the wrong shape (they would run per line). Each is
either replaced by structure (a legal footer is last, set small, and repeats the
letterhead) or deleted with the correction it serves.

## The three replacement mechanisms

### 0. First ask whether it must exist at all

Measured 2026-08-01, before writing any of the rest: a prototype classifier on
the embedder we already ship scores **12/41** against the word lists' **25/41**,
and its ceiling with the best gate pair found by sweep is **27/41 with no gates
at all**, which means never abstaining. Two questions of difference on 41 is
noise.

The cause is the encoder, and it is structural rather than fixable by writing
better examples: `multilingual-e5-small` is an asymmetric RETRIEVAL encoder,
trained to bring a query close to a PASSAGE and never to another query. Every
short interrogative sentence lands in the same cone, so cosines compress into
0.83-0.99 where nothing separates. Centring the space spreads them to 0.20-0.46
and the ranking barely moves, because separation that is not in the geometry
cannot be recovered from it.

The lesson is larger than the number. A classic RAG has no question-intent
classifier. Ours exists only to trigger corrections, and the corrections exist
only because the decoder may emit anything. Porting the word lists to embeddings
would build a more expensive version of the thing this spec exists to remove.

So: delete first, constrain the decoder second, and reach for prototypes only
for what genuinely survives both, measuring again then with the encoder choice
reopened. `scripts/intent-calibration.ts` stays as the instrument that decides.

### 1. Prototype embeddings, for what survives both

The question is already encoded for retrieval and cached in
`QueryEmbeddingCache`. Classifying it is a dot product per class, not a forward
pass. New module `src/lib/nlu/intent-prototypes.ts`:

```ts
export const INTENT_EXAMPLES = {
  amount: ['Combien coûte un recours ?', 'Quel est le montant des honoraires ?',
           'How much is the deductible?', 'Quels sont les frais de dossier ?', …],
  moment: ['Quand expire le contrat ?', 'Quelle est la date de fin ?', …],
  person: ["Qui est le directeur d'agence ?", 'Who signed this?', …],
  …
} satisfies Record<IntentName, string[]>;
```

Encoded once per session (one batch, ~40 short strings), cached beside the query
cache, compared by cosine. A class fires above a margin over the runner-up, so
an unclassifiable question falls through to no intent rather than to the nearest
one. Thresholds are calibrated on the stress benchmark's questions, never fitted
to a single document.

Four to eight examples per class. More is a smell: if a class needs twenty, it
is two classes.

### 2. Constrained decoding, for Type C

Both runtimes we already ship support it, no new dependency, and both take it on
the exact call we already make. Read off the installed type definitions rather
than from memory:

- `@mlc-ai/web-llm` — `engine.chat.completions.create({ response_format })`,
  where the type is `'text' | 'json_object' | 'grammar' | 'structural_tag'`
  (`lib/openai_api_protocols/chat_completion.d.ts:804`), backed by
  `@mlc-ai/web-xgrammar`. Its stats already carry `grammar_init_s` and
  `grammar_per_token_s`, so the cost is measurable without instrumenting
  anything.
- `@wllama/wllama` — `createChatCompletion` takes `ChatCompletionParams &
SamplingParams`, and `SamplingParams` carries `grammar?: string`
  (`types/types.d.ts:91`, `types/oai-compat.d.ts:97`). It also accepts
  `response_format: { type: 'json_schema', json_schema }` if a schema reads
  better than a GBNF grammar.

Both call sites already pass an options object built from `GenerationOptions`
(`llm-worker.ts:38`, `wllama-worker.ts:61`), so wiring is one optional field on
that interface and one line at each site.

The grammar admits an answer made of sentences each ending in one or more
citation markers drawn from the excerpts actually in the prompt, or the app's
own refusal token, and nothing else. A model that cannot emit "je peux vous
répondre" needs no detector for it.

Hook point is `generationOptionsFor` in `src/lib/private-ai/generation.ts`,
which already routes targeted vs synthesis.

Risk to measure, not to assume: [format restrictions can cost reasoning
quality](https://arxiv.org/pdf/2408.02442). The grammar must stay loose enough
to be a shape and not a script, and the stress benchmark decides.

### 3. Structure, for Type D

A legal footer is the last block, set smaller, repeating the letterhead. That is
readable from the parser's own geometry, which we already carry, and it does not
need a list of company-law nouns.

## Phases, each with its own gate

| #   | What                                                                     | Gate                                           |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| 0   | Baseline: run the stress benchmark, record every answer group            | the numbers exist                              |
| 1   | ~~Prototypes first~~ — measured and rejected, see mechanism 0            | done: 12/41 against 25/41                      |
| 2   | Decoding grammar behind a flag, both runtimes                            | quality at or above baseline, latency measured |
| 3   | Type C deletion, once the grammar carries it                             | no regression                                  |
| 4   | Type B: delete what only fed a deleted correction, migrate the remainder | no regression per file                         |
| 5   | Type D case by case                                                      | no regression                                  |
| 6   | A lint rule that fails the build on a new word-list regex                | it catches a planted one                       |

The order is the finding, not a preference: phase 4 is only sized once phases 2
and 3 have removed the corrections most of those lists exist to trigger.

## What is explicitly not changing

Retrieval scoring: embeddings + BM25 fused by RRF, then the cross-encoder. No
lexical term has ever touched a score and none may. The correction-retry
architecture stays too; it is published work. Only its triggers change.

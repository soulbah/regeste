# Tasks 033 — Remove the hand-maintained vocabularies

Status legend: `todo` / `doing` / `done`.

---

## T1 — The rule, so nothing new arrives while the old goes out

`done`

`.claude/rules/nlp.md` states the type-vs-vocabulary line and the three
replacement mechanisms; `AGENTS.md` carries it as a hard rule and in the
read-before-working table.

**Done when:** `.claude/rules/nlp.md` exists with `paths:` covering
`src/lib/pipeline`, `src/lib/nlu`, `src/lib/private-ai`, `src/lib/analysis`.

---

## T2 — A labelled question set, from the tests that already exist

`todo`

The regexes were written against real questions and those questions live in the
test suites. Harvest them into one labelled fixture, which is what every later
phase measures against. No new judgement calls: a question's label is the class
the shipped regex assigns it today, and disagreements are read by hand before
being recorded.

**Done when:** `src/lib/nlu/intent-fixtures.ts` holds at least 120 labelled
questions across the classes in plan.md, and `bun run test` covers it.

---

## T3 — The prototype classifier

`rejected as first move, 2026-08-01`

Measured before building on it: **12/41 against the word lists' 25/41**, ceiling
27/41 with no gates at all. `multilingual-e5-small` is an asymmetric retrieval
encoder and its geometry does not separate short questions. `scripts/intent-calibration.ts`
holds the measurement and stays as the instrument. Revisit only for the classes
that survive T5 and T6, with the encoder choice reopened.

`src/lib/nlu/intent-prototypes.ts`: four to eight example questions per class,
encoded once per session through the existing `QueryEmbeddingCache`, compared by
cosine with a margin over the runner-up so an unclassifiable question falls
through to no intent.

**Done when:** a node calibration script reports agreement against T2's fixture
per class, and every class is at or above what its regex scores on the same
fixture; the accent pair (`coûte` / `coute`) classifies identically.

---

## T4 — Migrate Type B, file by file

`todo` — after T5/T6, since most of these lists only feed corrections that go away

`execution-plan.ts` (3) → `clarification.ts` (3) → `semantic-frame.ts` (10) →
`relevance.ts` (14) → `retrieval.ts` (23) → `extractive-answer.ts` (41). Each
list is deleted in the same change that lands its class, never before.

**Done when:** each file's word-list count is zero, `bun run verify` is green
after each, and the stress benchmark shows no regressed answer group.

---

## T5 — The decoding grammar

`built, not switched on`

`src/lib/private-ai/answer-grammar.ts` builds it; both workers pass it through
(`llm-worker.ts` as `response_format`, `wllama-worker.ts` as a sampling
parameter, both compiling with `root`). `answerGrammarEnabled()` reads
`localStorage['regeste:answer-grammar']` so one session can run both
configurations. Default off until T5b.

The honest limit is pinned by a test: a grammar constrains shape, never
meaning. `"Je n'ai pas compris la question [1]."` satisfies it. Semantic
failures stay the business of the evidence checks.

Behind a flag, both runtimes: `response_format: { type: 'grammar' }` for
web-llm, `grammar` in the sampling config for wllama. Admits a cited answer or
the app's own refusal token.

**Done when:** measured against baseline on the stress benchmark, with
`grammar_init_s` and `grammar_per_token_s` recorded, and the flag flipped on
only if quality holds.

---

## T5b — Measure it

`todo`

Two stress runs in one session, flag off then on, on a profile that already
holds a model and the owner's documents. Record `grammar_init_s` and
`grammar_per_token_s`. The default flips only if no answer group regresses.

---

## T6 — Delete Type C

`blocked by T5b`

`isRefusalLike`, `BLAMES_THE_READER`, `isMetaNonAnswer`, `isPureRefusalLike`,
`NON_QUERY_CANDIDATE`, the second-person flip, the citation repair. Each goes
when the grammar demonstrably carries it, not before.

**Done when:** the constants are gone and the benchmark is unregressed.

---

## T7 — Type D, case by case

`todo`

`ORGANISATION_TOKEN` and `CORPORATE_BOILERPLATE` become "the last blocks, set
smaller, repeating the letterhead" from the parser's geometry. The rest go with
the corrections they serve.

---

## T8 — A lint rule so it cannot come back

`todo`

An eslint rule failing on a regex literal with three or more alphabetic
alternatives inside `src/lib/{pipeline,nlu,private-ai,analysis}`, with an
allow-list comment for the token-type lexers.

**Done when:** a planted `/\b(?:foo|bar|baz)\b/` fails `bun run lint`, and the
kept lexers pass.

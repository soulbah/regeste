# Spec 035 — Answer reliability

## Why

The same answer-bearing passages can currently produce an answer, a refusal, or an
unnecessary scope clarification depending on wording and model output. This breaks the
grounded-answer promise in PRD P3 and the private/cloud answer flows in FEATURES F3-F4.

## What

- WHEN a question names a subject or several facets joined by a coordinator THEN the app
  SHALL answer from the selected documents without asking whether to calculate one record or
  all documents.
- WHEN an excerpt binds an amount to the subject of a targeted question THEN the app SHALL
  preserve a retry that states the same canonical amount even when its spacing, decimal suffix,
  or currency spelling differs from the excerpt.
- WHEN selected passages support a direct or combined answer THEN repeated semantically
  equivalent questions SHALL produce grounded answers rather than the generic insufficient
  information refusal.
- WHEN a question contains several dependent clauses THEN retrieval SHALL establish one
  answer-bearing document before resolving short elliptical clauses inside that document, so a
  date or signatory from another attachment cannot drift into the answer.
- WHEN a coordinated factual answer needs several passages THEN prompt compression SHALL retain
  evidence from each retrieval branch instead of collapsing to the globally strongest passage.
- WHEN a cached local model is being placed in memory THEN the app SHALL show a visibly
  indeterminate loading indicator, not a stationary partial progress bar.
- WHEN the inference Service Worker changes while a request is pending THEN the app SHALL
  reject the orphaned request and retry model loading instead of remaining busy forever.
- WHEN either offered Cloudflare model is selected THEN a grounded message SHALL return a
  non-empty cited answer through the Workers AI binding.
- The app SHALL CONTINUE TO refuse unsupported values, keep document processing local in
  private mode, and never log or persist Assisted question or excerpt content on the server.

## Out of scope

- Changing the local model catalogue or download size.
- Deploying production changes; deployment remains owner-triggered.
- Completing every vocabulary removal identified by spec 033; this spec removes classifiers on
  the failing answer path and adds an executable whole-tree inventory, while spec 033 owns the
  remaining file-by-file migration.

## Open questions

None. The owner's report, screenshots, source documents and requested Cloudflare coverage define
the expected behavior.

## Verification

1. Run the focused clarification, prompt, grounding, client-lifecycle and answer regression tests.
2. Open `/dev/pipeline`, import the two owner-provided PDFs and confirm retrieval contains page 10
   for RAPO/TA fee questions and page 1 for balance/account questions.
3. Ask direct, paraphrased, coordinated and combined-total questions in `/chat`; confirm answers
   contain the supported values and citations, with no scope clarification or false refusal.
4. Refresh while a cached model is loading; confirm the indeterminate indicator moves and the
   model either becomes ready or surfaces a recoverable error after a worker restart.
5. Run one grounded request through each offered Cloudflare model and confirm non-empty cited
   answers.
6. Run `bun run verify`.

Never contains: implementation details (→ plan.md), task breakdown (→ tasks.md).

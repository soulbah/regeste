# Plan 024 — Browser intelligence core

## Pipeline

- Replace character-only chunks with token-budgeted structural child chunks. Keep source text intact;
  add a separate searchable representation containing document and heading context.
- Add local schema v9 for `search_text`, raw dense vectors, document facts, and per-message method
  summaries. Keep migrations append-only and browser-only.
- Scope lexical and vector candidates before ranking. Run FTS immediately, embed query concurrently,
  then fuse candidates while retaining raw scores.
- Use EmbeddingGemma q4/256d on WebGPU and multilingual-e5-small q8/384d on WASM. Store active model
  and dimensions; rebuild index atomically when they change.

## Analytical path

- Classify obvious exhaustive/numerical questions with deterministic bilingual patterns.
- Gather candidate amount lines per enabled document, parse locale-aware money into integer minor
  units, prefer explicit requested labels (TTC/HT/TVA/total), and compute sum/count/average/min/max in
  TypeScript.
- Persist extracted facts by document hash + extractor version. Answer from computed rows, never from
  free-form model arithmetic.

## Private generation

- Move capable tier to Qwen3.5-2B; add Qwen3.5-4B strong tier.
- Pass an explicit thinking policy to both WebLLM and wllama. Simple retrieval disables thinking;
  complex synthesis enables it with a bounded budget.
- Capture raw reasoning only transiently. Persist/display a short method summary made from observable
  pipeline facts and final structured output.

## UI direction

Subject: private document analysis for people checking sensitive contracts and invoices. Single job:
show useful progress without turning speculative model prose into evidence.

- Existing warm-paper/green system remains unchanged. New surface uses neutral ink and border tokens;
  no new status color.
- Typography: body Geist, evidence/metrics Geist Mono, existing Newsreader only for established display
  headings.
- Layout signature: a compact "work ledger" inside the assistant turn. Each row is an observed action
  (documents searched, values checked, calculation made), with a live hairline sweep on current row.
  Final answer collapses ledger to one quiet disclosure row.
- Motion: one linear progress sweep during active work; reduced-motion becomes static state change.

Wireframe:

```text
question
  ┌ work ledger ─────────────────────┐
  │ ✓ Searched 12 documents          │
  │ ◌ Checking totals                │
  └───────────────────────────────────┘

answer [1][2]
  ▸ How this result was built · 12 documents · exact calculation
```

Design critique: a chat "thinking bubble" would imitate generic assistants and anthropomorphize the
model. Ledger describes verifiable operations instead. This matches product's audit vocabulary and
keeps source evidence visually dominant.

## Tradeoffs

- No default reranker: another 300M-class model duplicates download/memory before domain evidence
  proves need.
- No raw thought display: major reasoning providers expose summaries, and raw chains are not reliable
  evidence. Users still get live progress and an expandable method record.
- Exact analytics initially supports money and counts. Unsupported operations fall back to grounded QA
  with an honest limitation.

# Spec 024 — Browser intelligence core

## Why

The local pipeline answers targeted questions but loses scoped results, starts cold too slowly, and
cannot answer exhaustive numerical questions such as totals across invoices. Private generation also
spends time on hidden reasoning without giving the user useful progress or an auditable method.

## What

- WHEN a question targets attached documents THEN retrieval SHALL rank only chunks from enabled
  documents and SHALL expose calibrated lexical, semantic, and fused relevance signals.
- WHEN indexed content has titles, headings, page lines, or table rows THEN those structural labels
  SHALL improve retrieval without changing quoted source text.
- WHEN a straightforward factual question is asked THEN Private SHALL answer without extended
  reasoning.
- WHEN a comparison, exhaustive, or numerical question is asked THEN Private SHALL use a deliberate
  path and the thread SHALL show concise, factual progress while work is running.
- WHEN the final answer appears THEN progress SHALL collapse automatically; the user MAY expand a
  short method summary. Raw model chain-of-thought SHALL NOT be presented as authoritative evidence.
- WHEN a question asks for a sum, count, average, minimum, or maximum across documents THEN the app
  SHALL inspect every enabled document, extract candidate values with citations, validate compatible
  units/currencies, and compute the result deterministically on-device.
- WHEN an aggregate is ambiguous (for example HT versus TTC or mixed currencies) THEN the app SHALL
  ask for clarification or return grouped totals instead of silently choosing.
- WHEN WebGPU is capable THEN the document index SHALL use the quality embedding tier; lower-capacity
  devices SHALL retain a smaller local fallback, with explicit reindexing between model versions.
- WHEN a capable Private tier is selected THEN it SHALL use Qwen3.5-2B; stronger devices MAY use the
  4B tier and weaker devices SHALL retain a smaller fallback.
- The app SHALL CONTINUE TO keep document content, extracted facts, calculations, reasoning summaries,
  and embeddings on-device.

## Out of scope

- General spreadsheet engine and arbitrary code execution.
- Cloud extraction or cloud reranking.
- Displaying raw hidden chain-of-thought as ground truth.
- Domain-specific invoice accounting beyond common totals, currencies, dates, and identifiers.

## Open questions

None. Owner approved implementing every priority from the 2026-07-11 functional audit.

## Verification

1. `bun run test` covers scoped retrieval, structure-aware chunking, query routing, monetary parsing,
   deterministic aggregation, mixed currencies, and reasoning-summary parsing.
2. In `/dev/pipeline`, index the bundled contracts and a synthetic invoice set. Targeted searches
   return only enabled documents and show warm retrieval timing.
3. In a Private chat, a factual question shows direct progress and answer; a comparison shows the
   deliberate progress treatment, which collapses when the answer streams.
4. Ask for total TTC across synthetic invoices. The result equals exact integer-cent sum, cites every
   included invoice, and reports ambiguous/excluded documents.
5. `bun run verify` exits 0 and the affected flow is exercised in Chromium without console errors.

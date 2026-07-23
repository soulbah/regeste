# Spec 026 — Record-aware retrieval and exact analytics

## Why

The current pipeline treats near-identical pages as duplicate prose and exact analytics assumes one
amount per document. A statement or receipt bundle containing several repeated records therefore
loses valid pages, confuses monetary roles and answers scoped totals from one matching page. This
breaks the PRD's cited-answer contract and spec 024's exhaustive numerical path.

## What

- WHEN a PDF contains repeated forms, receipts, invoices, statements or transactions THEN the app
  SHALL preserve each occurrence as distinct evidence when its page, date, identifier or values differ.
- WHEN repeated records share most template text THEN retrieval SHALL NOT remove relevant records as
  prose duplicates; boilerplate MAY be collapsed without collapsing record-bearing pages.
- WHEN a question asks for a list, count, sum, average, minimum or maximum over a month, year, date
  range or all records THEN the app SHALL inspect every matching record in every enabled document.
- WHEN a financial record exposes sent amount, received amount, fee, debited total, currency and
  exchange rate THEN the app SHALL keep those roles associated with their own transaction and date.
- WHEN two distinct records have the same amount THEN both SHALL be retained and counted.
- WHEN two currencies occur on the same visual line THEN each value SHALL retain its explicit currency;
  a nearby symbol SHALL NOT relabel another currency.
- WHEN a user asks for money "sent", "received", "paid in fees" or "debited" THEN the calculation
  SHALL select that role instead of treating every label containing "amount" or "total" as equivalent.
- WHEN a French or English question expresses exhaustive intent through natural variants such as
  "envoyée", "combien de transferts", "liste chaque" or "during June" THEN it SHALL use the exhaustive
  record path. Accentless forms and ordinary singular/plural variants SHALL behave equivalently.
- WHEN a question is ambiguous between distinct monetary roles or currencies THEN the answer SHALL
  ask for the missing choice or show clearly separated groups; it SHALL NOT choose one page silently.
- WHEN an exhaustive result contains records THEN every retained record SHALL have a page citation,
  and the displayed method SHALL state matched-record count and exact calculation.
- WHEN a targeted question asks about one transaction, date, identifier, party or motive THEN retrieval
  SHALL select the matching record without pulling a different near-identical page.
- WHEN requested information is absent THEN the answer SHALL say it was not found; repeated template
  text SHALL NOT be used to infer a value.
- The app SHALL CONTINUE TO scope retrieval to enabled documents, preserve source text and offsets,
  keep all extraction and calculation in the browser, and pass existing contract/OCR regressions.
- Cross-document questions SHALL retain complementary facts from multiple files, preserve conflicts and
  superseded values, keep homonyms separate when IDs differ, and refuse unsupported attributes.
- French subject-verb inversion SHALL NOT inherit unrelated conversation context; genuine pronoun and
  elliptical follow-ups SHALL CONTINUE TO resolve against the preceding completed exchange.

## Out of scope

- General spreadsheet formulas or arbitrary code execution.
- Provider-specific Orange Money rules, hard-coded names, transaction identifiers or page layouts.
- Committing the owner's PDF or any derived personally identifying/financial fixture. Automated tests
  use an anonymized synthetic document with the same repeated-record structure.
- Accounting advice, fraud detection, reconciliation against external accounts, or exchange-rate
  verification against network data.

## Open questions

None. Scope follows the owner's request to prioritize indexing and retrieval quality for multi-record
financial PDFs, then expand the stress pass to cross-document and OCR questions. Owner validated and
requested full implementation on 2026-07-12.

## Verification

1. `bun run test -- src/lib/analysis src/lib/pipeline src/lib/benchmark` covers a seven-page anonymized
   repeated-receipt fixture, equal-value distinct records, same-line EUR/GNF values, temporal filters,
   field roles, exhaustive routing, ambiguity and absent facts.
2. The deterministic benchmark contains at least 40 FR/EN questions across targeted lookup, lists,
   counts, sums, averages, extrema, time scopes, field disambiguation, correlations, paraphrases,
   accentless text, follow-ups and honest absence. It reports 100% record Recall, 100% aggregate exact
   match, 100% expected citation coverage and zero cross-currency attribution errors.
3. In `/dev/pipeline`, ingest the anonymized fixture and observe all record-bearing pages remain in the
   candidate/result set even though their template similarity exceeds 0.90.
4. In a real Private chat, ingest the owner's local ignored a local, gitignored real-world PDF. Run the agreed question pack,
   including June sent amount, June debited total, June fees, June received GNF, transaction count,
   per-month lists, extrema, equal 150 EUR records, identifiers and absent facts. Compare every answer
   and citation against visual page truth; no answer may rely on a single page for an exhaustive query.
5. Re-run long scanned-contract retrieval and the existing 25-invoice benchmark. Both retain their
   previous 100% recall/exactness/citation targets.
6. `bun run verify` exits 0. Exercise affected flows in Chromium with no console errors.

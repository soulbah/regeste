# Record retrieval stress report — 2026-07-12

## Scope

This pass tests retrieval as a system, not against one PDF template. All committed fixtures are
fictional. Owner documents were tested locally and are neither copied nor committed.

Three packs cover distinct failure modes:

1. Seven near-identical transfer receipts in PDF, DOCX and TXT.
2. Nine heterogeneous cross-document notes with complementary, conflicting, superseded and absent
   facts.
3. One local 26-page image-only real-estate PDF, read through the production OCR path.

## Research warnings converted into tests

- Financial QA needs supporting-fact retrieval and symbolic execution measured separately, not one
  end-answer score (FinQA, TAT-QA, MultiHiertt).
- Multi-step numeric questions fail when table/page structure or operand roles are lost.
- RAG evaluation must separate retrieval recall, context precision, answer correctness and faithfulness
  (RAGChecker).
- FTS diacritic folding does not provide morphology, entity resolution, record grouping or temporal
  reasoning; those need explicit logic.

## Question packs

### Repeated records

48 French/English cases cover sums, lists, counts, averages, extrema, month/year/ranges, equal values,
zero fees, EUR/GNF roles, ambiguous totals, absent months and targeted transaction identifiers.

Representative traps:

- Quelle est la somme totale envoyée en juin ?
- Quelle somme totale a été débitée en juin ?
- Quelle somme a été reçue en GNF en juin ?
- Liste chaque montant envoyé en juin — including two legitimate equal values.
- Quel est le total en juin ? — must ask which amount role.
- Combien ai-je envoyé en juillet ? — must not invent records.
- Et en mai ? — must inherit the role, but replace the month.

### Cross-document evidence

Ten cases cover eight questions requiring two to four documents plus one conflict and one unsupported
attribute:

- Combine education, residence and marital status for one explicit fictional ID.
- Keep two people with the same name separated by ID.
- Resolve a shipment location through shipment → batch → warehouse across two files.
- Prefer an applicable revised budget while preserving the superseded value as history.
- Preserve positive and negative role statements (“leads” versus “does not lead”).
- Return both conflicting witness descriptions without fabricating consensus.
- Refuse an absent passport number even when the person ID matches many passages.

### Long OCR document

Local-only questions exercise early and late pages, repeated amounts, terminology expansion, conjunctions
and absence: exact sale price, loan amount, separate comparison evidence, cadastral area, parties and
roles, French subject-verb inversion after an unrelated turn, and an unsupported passport number.

## Bugs found and fixed

1. Accented “envoyée” missed aggregate routing.
2. Near-identical pages above 0.90 similarity were discarded as duplicates.
3. One amount per document was assumed; one document containing many records became ambiguous.
4. Month filters, amount roles and zero-decimal currencies were missing.
5. Adjacent EUR/GNF values could swap roles; exchange-rate values could become fees.
6. Equal legitimate transactions were deduplicated.
7. Interrupted ingest/OCR work could stay pending forever.
8. Fast send after library attachment could create a second chat without sources.
9. Entity-only retrieval could support an absent attribute.
10. “Chaque” in a comparison or evidence request could trigger numeric list aggregation.
11. French “Que sait-on” with a hyphen missed synthesis routing and locale detection.
12. French subject-verb inversion (“est-elle”) contaminated retrieval with the previous turn.
13. Targeted citation repair collapsed multi-fact answers to one misleading source.
14. Private synthesis could spend its token budget in hidden reasoning and emit no answer.

## Measured gates

- Record pack, PDF/DOCX/TXT: record recall 1.00, exact execution 1.00, citation coverage 1.00,
  currency-role accuracy 1.00.
- Cross-document pack: evidence recall 1.00, complete evidence-set rate 1.00, absent-case precision 1.00.
- Existing 25-invoice benchmark: retrieval, aggregate result and citations remain 1.00.
- Live OCR: relevant page recovered for cadastral area; comparison recovered distinct price/loan evidence;
  unsupported attribute used zero passages.

## Maintenance rule

Every retrieval regression receives: minimal fixture, expected evidence locations, route assertion,
answer/result assertion where deterministic, and browser replay for user-visible failures. Never replace
this matrix with one happy-path accuracy number.

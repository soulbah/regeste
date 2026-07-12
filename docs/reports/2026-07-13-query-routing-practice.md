# Query routing practice — 2026-07-13

## Decision

Do not grow an exhaustive phrase list for aggregate intent. Parse a small semantic frame instead:

- operation: sum, average, minimum, maximum, count or list;
- financial role: sent, received, fee, debited, tax, subtotal or invoice total;
- scope: explicit single record versus selected-document collection;
- temporal and identifier slots.

A sum over a financial role defaults to collection scope unless the utterance structurally selects one
record (singular invoice/transaction/transfer/receipt reference or explicit page). This makes “au total”,
“en tout” and “how much did I send” equivalent through composition rather than separate phrase entries.
Exact record identifiers and source labels remain deterministic rules. Targeted generation receives the
parsed financial role and may not substitute sent, received, fee or debited values.

## Evidence

- Rasa recommends regex/lookup features as specific signals combined with intent classification rather
  than broad regexes acting as the whole classifier:
  <https://rasa.com/docs/reference/primitives/intents-and-entities/>
- spaCy recommends rules for specific cases and statistical models for generalization, with hybrid use
  where appropriate: <https://spacy.io/usage/rule-based-matching/>
- Duckling represents deterministic language understanding as composable dimensions, rules and positive
  plus negative corpora: <https://github.com/facebook/duckling>
- TOP represents task-oriented requests as compositional intents and slots rather than flat phrase
  matching: <https://aclanthology.org/D18-1300/>
- CheckList recommends behavioral capability matrices, invariance and perturbation tests instead of one
  held-out accuracy number: <https://aclanthology.org/2020.acl-main.442/>
- Real-world casing, misspelling, morphology, paraphrase, punctuation and synonym noise degrades intent
  and slot models, motivating explicit perturbation coverage:
  <https://aclanthology.org/2021.nlp4convai-1.7/>
- SQLite documents `opfs-sahpool` as an explicitly installed VFS and recommends disabling unused VFSes
  to avoid their proxy Worker, bandwidth and memory cost:
  <https://sqlite.org/wasm/doc/trunk/persistence.md>,
  <https://sqlite.org/wasm/doc/trunk/cookbook.md>.

## Regression policy

Maintain positive paraphrase matrices in French and English, explicit single-record counterexamples,
misspelling/Unicode variants and end-to-end document calculations. Add domain ontology entries only when
they represent a new operation, role or record type—not every new surface wording.

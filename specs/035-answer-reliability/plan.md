# Plan 035 — Answer reliability

## Measured causes

1. Retrieval found the right fee passage, then `hasAnswerBearingEvidence` — a handwritten lexical
   classifier — emptied the hits and forced a refusal. Remove that final veto. Retrieval evidence
   reaches generation; numeric grounding still rejects unsupported figures.
2. Global searches for short clauses such as “à quelle date ?” and “qui l'a signé ?” drifted to a
   different attachment. Use two-stage decomposition: longest self-contained clause chooses the
   document, then every clause searches only inside that document. Merge one result per branch.
3. Factual compression then collapsed those merged branches back to one passage. Preserve the
   interleaved branch order for multi-part lookups; compact a single-fact lookup normally.
4. A scope classifier asked “one record or all selected documents?” after retrieval had already
   found evidence. Suppress guessed scope clarification on the chat path and answer best-effort
   from selected evidence.
5. Cached WebLLM requests survived a Service Worker replacement as orphaned promises. Stamp the
   worker boot, reject pending requests on controller/boot change, heartbeat the controller and
   retry loading once.
6. Small decoders continued after a complete answer/refusal and sometimes copied internal field
   scaffolds. Stop at a complete coordinated factual prefix or the exact contractual refusal,
   bound refusal audit to 120 tokens / 8 seconds, and remove a structurally marked `[n]: …`
   appendix before citation rebinding.

## Techniques checked before coding

- Question decomposition with merged candidates is established multi-hop RAG practice
  ([ACL 2025](https://aclanthology.org/2025.acl-srw.32/),
  [EMNLP 2024](https://aclanthology.org/2024.emnlp-main.199/)). This motivates document anchoring,
  not a vocabulary for conjunctions.
- Context-aware extractive compression can beat uncompressed prompts while reducing latency
  ([EXIT, ACL 2025](https://aclanthology.org/2025.findings-acl.253/)). Here compression is
  deterministic and branch-preserving.
- Adaptive routing should use a learned classifier trained from task outcomes
  ([Adaptive-RAG, NAACL 2024](https://aclanthology.org/2024.naacl-long.389/)). The already shipped
  E5 nearest-prototype experiment was rerun and rejected: 12/41 versus 25/41 for the legacy rules,
  best swept ceiling 27/41 only by never abstaining. No uncalibrated “semantic route” replaces it.
- Grammar-constrained decoding guarantees shape, not truth
  ([EMNLP 2023](https://aclanthology.org/2023.emnlp-main.674/)). Live A/B on the supplied fee PDF
  made the local model copy long evidence, so grammar metrics stay wired but the flag remains off.
- Cloudflare calls use the official Workers AI binding and current model catalogue
  ([bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/),
  [models](https://developers.cloudflare.com/workers-ai/models/)).

## Vocabulary audit

`bun run audit:nlp` walks the TypeScript AST and currently reports 282 candidates across 23
files. It intentionally over-reports: token shapes, parser-controlled prefixes and language
stopwords need human classification. This change deletes the three dead execution-plan intent
classifiers and three speculative clarification families, adds no document-specific vocabulary,
and removes the lexical classifier from the final answer/no-answer decision. Remaining Type B/C/D
migration stays tracked in spec 033; the audit command prevents the work from becoming invisible.

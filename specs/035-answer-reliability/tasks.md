# Tasks 035 — Answer reliability

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Reproduce the three owner-reported failures against current `develop`.
      Done when: the two supplied PDFs are ingested in `/dev/pipeline`; baseline observations and
      exact failing inputs are recorded in tests or this spec.
- [x] 2. Resolve named/coordinated question scope without a business vocabulary.
      Done when: `bun run test -- src/lib/nlu/clarification.test.ts` exits 0 and the exact combined
      RAPO/TA question never returns `scope` with two selected documents.
- [x] 3. Preserve grounded amount corrections across equivalent number formatting.
      Done when: focused answer/prompt tests exit 0 and `1 100 euros HT` is accepted for
      `1100 € HT`, while unsupported amounts still refuse.
- [x] 4. Make cached-model loading visibly live and resilient to Service Worker replacement.
      Done when: focused lifecycle/component checks exit 0; pending requests reject on controller
      replacement; a fresh request can load on the replacement controller.
- [x] 5. Exercise answer variants on the supplied PDFs.
      Done when: direct, paraphrased, coordinated and total questions return supported cited
      answers for the RAPO document; balance, account-owner/date and signatory questions return
      supported cited answers for the bank attestation.
- [x] 6. Exercise both Cloudflare models.
      Done when: `balanced` and `best` each return a non-empty grounded cited answer from an actual
      remote Workers AI call.
- [x] 7. Close verification and project record.
      Done when: `bun run verify` exits 0 and `PROGRESS.md` contains spec 035 status plus one log
      entry.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes
- [x] PROGRESS.md updated

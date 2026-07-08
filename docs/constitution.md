# Constitution

Non-negotiable principles. Violating one requires an owner-approved amendment to this file, not a judgment call mid-task.

1. **Local-first, forever.** Documents, chats, messages, chunks, embeddings, citations and filenames never leave the browser except the excerpts a user explicitly sends in Assisted mode — transiently, never persisted server-side. The remote DB holds identity, plan and quota data only.
2. **Transparency over promises.** Every byte that leaves the device must be visible to the user (What AI saw, Privacy Report). No silent network calls tied to user content; "Related questions" and similar niceties are computed locally or don't exist.
3. **Cloudflare-native backend.** Before any external service or infra dependency, check Cloudflare's offering. Deviating requires an ADR.
4. **shadcn-svelte-only UI.** Interactive elements come from `src/lib/components/ui/`; identity lives in theme tokens, not ad-hoc styles.
5. **Strict types, validated edges.** TypeScript strict everywhere; valibot on every API boundary; no `any` at edges; prepared statements only.
6. **Spec-driven, done-when-verified.** Work flows through numbered specs with runnable Done-when criteria. `bun run verify` green is the floor, not the definition, of done.
7. **Simplicity.** Smallest change that satisfies the spec. New dependencies need a reason written in the PR. No speculative abstraction.
8. **Honest failure.** An unanswerable question gets "not found in your documents"; a failing check gets reported, not hidden; scanned PDFs get an honest "OCR not supported yet".
9. **Open source is the audit.** AGPL-3.0-only. The code must make the privacy claims verifiable: data flows readable, egress points few and explicit.
10. **English code, bilingual product.** Code, comments, docs, commits in English; UI strings via i18n (FR/EN).

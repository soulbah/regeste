---
name: verify
description: Run the full verification gate and exercise the app for real. Use before declaring any task done, before commits, and whenever asked to "check that it works".
---

# Verify

1. `bun run verify` (check + lint + test + build). All four must pass — fix failures, don't skip.
2. Exercise the change end-to-end, don't stop at compilation:
   - UI change → `bun run dev`, open the affected route, drive the flow (click/type), watch the browser console for errors.
   - API change → `bun run build && bunx wrangler dev`, then `curl` the endpoint with a realistic payload; check status, body and `wrangler` output for errors.
   - DB change → apply locally (`bun run db:migrate:local`), run one real query through the changed path.
3. Compare the observed behavior to the task's `Done when:` list in the active spec — run each command listed there.
4. Report honestly: what was run, what was observed, anything skipped and why. A failing check reported is fine; a failing check hidden is not.

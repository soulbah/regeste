# Spec 012 — What AI saw panel + honest refusal sources

## Why

PRD §4 — the signature feature: per answer, exactly what the AI received (passages selected, passages actually sent, volume, destination). The meta line exists since 005/007; this makes the full panel real. Plus FEATURES MVP core: honest refusal shows the closest sources.

## What

- Every generated answer SHALL record, locally, the passages the AI actually saw: for Private all retrieved passages (destination: this device), for My AI the passages sent, for Assisted both the sent and the user-excluded passages (marked as excluded).
- WHEN the user clicks an answer's meta line THEN the right contextual panel SHALL show "What AI saw": the question, mode + destination + bytes (from the privacy event), and the passage list with per-passage status (sent / excluded / stayed on device); each passage opens the viewer.
- WHEN an answer has no citations but passages were retrieved THEN the turn SHALL list the closest sources under the answer (clickable), so a refusal still shows what came closest.
- Passages SHALL be stored as snapshots (like citations): deleting the document later degrades the panel to snapshots, never breaks it.
- The panel SHALL take its place in the existing right-panel rotation (review > what-AI-saw > viewer > documents).
- The app SHALL CONTINUE TO pass `bun run verify`; all data stays local.

## Out of scope

- Retro-filling excerpts for answers generated before this spec (their panel shows the privacy summary only).
- Retrieval scores in the panel (P9 lives in the pre-send review).

## Open questions

(none)

## Verification

1. My AI answer → meta line click → panel shows question, destination host, bytes, sent passages; passage click opens the viewer.
2. Assisted answer with one excluded excerpt → panel marks it "excluded", bytes match the review.
3. Private answer → passages marked "stayed on this device", 0 bytes.
4. Ask an unanswerable question (grounded) → refusal shows "Closest sources" clickable list.
5. `bun run verify` exits 0.

# Spec 008 — Privacy Report + universal search (⌘K)

## Why

FEATURES P1 (Privacy Report — egress journal, exportable, "empty report" as the #1 privacy proof), P2/P4 piggyback on the same data; F1 (universal search: FTS5 already indexes documents — indexing messages makes ⌘K search everything, which no local competitor has); 5 (⌘K palette = universal search + command registry). All data already exists locally (`privacy_events`, FTS5 engine); this spec is UI + one local index.

## What

### Privacy Report (P1)

- The app SHALL provide a Privacy Report page (reachable from the sidebar) listing every egress event: when, mode, destination, excerpt count, bytes sent — newest first.
- WHEN no data ever left the device THEN the report SHALL show an explicit celebratory empty state ("Nothing has left this device."), not a bare empty list.
- The report SHALL show totals (requests, bytes) per destination.
- The user SHALL be able to export the report as JSON (client-side download, no network).
- Local-only answers (Private mode) SHALL appear in the totals as on-device events (0 bytes), clearly separated from egress.

### Universal search (F1 + ⌘K)

- Messages SHALL be indexed in FTS5 at insert time (and existing messages backfilled by migration).
- WHEN the user presses ⌘K (Ctrl+K) anywhere THEN a command palette SHALL open.
- Typing SHALL search, with snippets: chats (by title and message content) and documents (by name and content), each result navigating to its chat (message results) or opening the viewer at the passage (document results).
- The palette SHALL also expose commands: New chat, Documents, Privacy Report.
- Search SHALL be local-only (FTS5), with zero network requests.
- The app SHALL CONTINUE TO pass `bun run verify`; existing flows SHALL be unchanged.

## Out of scope

- Privacy badges per chat/document (P2/P3) and settings counters (P4) — trivial follow-ups once the report exists, but separate change.
- Semantic (vector) search over messages — FTS only, like the decision for F1.
- Command registry beyond the three navigation commands (Switch mode, Force offline arrive with their features).
- Relevance warnings (P8) and score display (P9).

## Open questions

(none)

## Verification

1. `bun run dev`; sidebar → Privacy Report: with a fresh profile shows the "nothing left" state; after an Assisted/My AI answer shows the event rows with destination and bytes; export downloads a JSON file with the same rows.
2. ⌘K opens the palette from any page; typing a word from a document surfaces the passage (click → viewer); a word from a chat message surfaces the chat (click → navigates); "New chat" command works.
3. `bun run verify` exits 0.

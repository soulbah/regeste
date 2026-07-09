# Plan 008 — Privacy Report + universal search

## Pieces

- **Local schema v3**: `CREATE VIRTUAL TABLE messages_fts USING fts5(content, content='messages', content_rowid='rowid')` + backfill `INSERT INTO messages_fts(rowid, content) SELECT rowid, content FROM messages WHERE role = 'user' OR mode != 'retrieval'`. Retrieval-preview turns store JSON, not prose — they are excluded at insert time too.
- **Worker**: index inserts in `insertMessage` (skip `mode = 'retrieval'`), de-index in `deleteChat` (FTS5 external-content delete requires per-row 'delete' commands before removing messages); `searchAll(query)` → `{ chats: [{chatId, title, snippet}], documents: [{documentId, chunkId, name, snippet, page, headingPath}] }` via two FTS queries (messages_fts join messages/chats; chunks_fts join chunks/documents, `snippet()` for context); `privacySummary()` → totals per destination.
- **Privacy Report** (`src/routes/privacy/+page.svelte`): header + per-destination totals + event list from `listPrivacyEvents` (raise limit param); export button serializes the same rows to a Blob download. Sidebar entry. Empty-egress state when every event has `bytesSent = 0`.
- **⌘K palette** (`components/command-palette.svelte`, shadcn `command` + `Command.Dialog`): global keydown in `+layout.svelte`; static commands (New chat, Documents, Privacy Report) + debounced `searchAll` results in Chats / Documents groups; document hits open `viewerStore.openHit`-equivalent (chunk → viewer), chat hits `goto(/chat/id)`.
- **State**: thin `search.svelte.ts` not needed — palette holds its own local state; privacy page queries the worker directly.

## Tradeoffs

- Message FTS excludes retrieval-preview JSON turns (noise, wrong "content").
- Chat delete de-indexes message rows explicitly — same pattern as chunks in `deleteDocument`.
- Export = plain JSON of the event rows (P1 wording), no PDF/CSV ceremony.

## Tests (no sugar)

- None new: FTS wiring is exercised end-to-end in verification; no new pure logic worth pinning.

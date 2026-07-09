# Plan 010 — Chat comfort

- **Schema v5**: `ALTER TABLE chats ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;` + `setChatPinned`; `deleteMessage(id)` (with messages_fts delete + its citations via cascade? citations reference message_id ON DELETE CASCADE — but FTS needs explicit delete with content); `documentHeadings(documentIds)` → distinct heading_path (first N, with page fallback none).
- **chats store**: `regenerate(chatId)` — delete last assistant message, re-run answer path with last user question (extract shared `answer()` helper from `send()`); `editLast(chatId, newText)` — delete last assistant + last user messages, then `send(chatId, newText)`; `exportMarkdown(chatId)` builds the .md text; `setPinned`.
- **Sidebar**: "Pinned" group above recency groups; pin/unpin in the chat dropdown; export there too.
- **Turn actions** (`private-turn` + retrieval turn wrapper): hover actions row — copy dropdown (plain / with sources), regenerate on the last assistant turn only (prop from page).
- **Edit**: pencil on the last user message → dialog with textarea → confirm calls `editLast`.
- **C7**: `ondrop`/`ondragover` on the thread container; `onpaste` on the Textarea (clipboardData.files) → existing `handleUpload`.
- **C8/C9** (`lib/suggestions.ts`): from `documentHeadings`, build questions "What does “X” say?" (locale-neutral English for now, i18n in 016); C8 rendered on empty thread, C9 under the last assistant turn using headings minus cited locators. Pure function + trivial worker query.
- **C10**: layout keydown adds ⇧⌘O → goto('/'), `/` → focus composer textarea unless typing in an input.

Tests: none (UI glue; suggestions derivation is trivial string mapping).

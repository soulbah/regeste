# Spec 010 — Chat comfort (C2-C4, C6-C10)

## Why

FEATURES "Chat moderne (attendus, tous petits)": table-stakes interactions users expect from any chatbot. All local, no new trust surface.

## What

- C2: WHEN the last turn is an assistant answer THEN the user SHALL be able to regenerate it (same question, previous answer replaced) and to edit the last question (edited text replaces the old question + answer and re-asks).
- C3: every assistant answer SHALL offer copy — plain text, or text with a sources list appended.
- C4: a chat SHALL be exportable as a Markdown file (question/answer turns + sources), client-side download.
- C6: chats SHALL be pinnable; pinned chats form a group at the top of the sidebar.
- C7: dropping files on the chat thread or pasting a file in the composer SHALL upload+attach like the paperclip.
- C8: WHEN a chat has ready documents with section structure THEN the empty thread SHALL suggest up to 3 questions derived from section headings — no LLM, no network.
- C9: after an answer, up to 3 "related" suggestions SHALL appear, derived from headings not already cited — local only, tap to ask.
- C10: ⌘K exists; add ⇧⌘O (new chat) and `/` (focus composer) shortcuts.
- The app SHALL CONTINUE TO pass `bun run verify`; nothing here touches the network.

## Out of scope

- Editing arbitrary older messages (last exchange only, like the FEATURES row intends).
- Custom reusable actions (R3 → spec 015 territory), streaming markdown rendering.

## Open questions

(none)

## Verification

1. Ask (retrieval turn ok) → Regenerate replaces the answer; Edit reopens the question, resend replaces both.
2. Copy / copy-with-sources put the right text on the clipboard.
3. Export downloads a readable .md with turns and sources.
4. Pin a chat → appears in "Pinned" group; unpin restores.
5. Drop a file on the thread and paste a file in the composer → both ingest+attach.
6. Empty chat with an MD/DOCX doc → heading-derived suggestions; clicking asks. After an answer → related suggestions.
7. ⇧⌘O opens a new chat; `/` focuses the composer.
8. `bun run verify` exits 0.

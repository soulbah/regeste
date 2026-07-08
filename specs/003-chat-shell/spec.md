# Spec 003 — Chat shell

## Why

The product experience is a modern chat (PRD §12, mockups). Spec 002 proved the pipeline; this spec builds the app around it: chats, messages, the document library with per-chat attachment (FEATURES §1: references, never copies), and the trust-boundary selector. Answer _generation_ is out of scope (specs 004/005) — a question runs retrieval and renders the retrieved passages, clearly labeled as such.

## What

- WHEN the app opens THEN it SHALL show a sidebar (new chat, chat list grouped by recency, Documents entry, guest account area) and an empty state matching the product identity.
- WHEN the user creates / renames / deletes a chat THEN the change SHALL persist locally (OPFS DB) and survive reload.
- WHEN the user adds a document from a chat THEN it SHALL land in the global library AND be attached to the chat (upload path), or be picked from the library ("Choose from your documents" — adaptive: hidden when the library is empty).
- WHEN the user adds a document from the Documents page THEN it SHALL be global only.
- WHEN a document is ingesting THEN its named state and progress SHALL be visible in the chat's documents panel and the library (reusing spec 002 states); a toast SHALL announce completion only if the document's panel is not visible.
- WHEN the user removes a document from a chat THEN only the attachment SHALL be removed; deleting from the library SHALL warn when the document is used in chats and then delete everything (chunks, embeddings, file).
- WHEN the user sends a question in a chat with ready documents THEN the app SHALL store the user message, run hybrid retrieval over the chat's enabled documents, and render a "retrieved passages" assistant turn (passage text, document name, page/heading locator, score) — explicitly labeled as retrieval-only until AI modes land.
- WHEN the user opens the mode selector THEN it SHALL show Private / Assisted / My AI with trust-boundary colors (green/amber/blue), honest state lines (Private: "coming soon" for now; Assisted: locked "Sign in required"; My AI: "Not configured"), and persist the choice per chat.
- The app SHALL CONTINUE TO pass `bun run verify` and keep `/dev/pipeline` working.

## Out of scope

- Answer generation (004 Private, 005 Assisted), citations rendering inside generated prose, What AI saw panel (needs generation), auth UI (005), command palette search results (universal search lands with its own task later in this spec series), document viewer with highlight (own spec).

## Open questions

None — UX decisions were frozen in FEATURES.md §5/5bis.

## Verification

1. `bun run verify` green.
2. In the browser: create two chats, rename one, reload → both persist with titles.
3. In a chat: upload a PDF → appears in panel with live states → ready; open Documents page → same document listed "In 1 chat"; second chat → attach the same document from the library → instant (no re-index).
4. Ask a question → user message + retrieval turn with correct passages; reload → conversation history intact.
5. Mode selector: three modes with colors and state lines; selection persists per chat after reload.
6. Delete document from library → warning mentions chat usage; after confirm, gone everywhere; console clean.

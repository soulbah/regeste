# Plan 003 — Chat shell

## Architecture

Extend the spec-002 foundation; no new heavy tech. All UI from shadcn-svelte components on the existing theme.

```
src/lib/state/
  chats.svelte.ts       — chat CRUD + active chat + messages + retrieval turns
  documents.svelte.ts   — (existing) + attach/detach + usage counts + library ops
src/lib/local-db/worker.ts — add chat/message/attachment SQL methods
src/routes/
  +layout.svelte        — app shell: Sidebar (shadcn sidebar) + <slot/> + Toaster
  +page.svelte          — redirect to newest chat or empty state
  chat/[id]/+page.svelte — chat view: header, thread, composer, right panel
  documents/+page.svelte — library page
src/lib/components/
  app-sidebar.svelte, chat-thread.svelte, message-bubble.svelte,
  retrieval-turn.svelte, composer.svelte, mode-selector.svelte,
  documents-panel.svelte, add-documents.svelte (popover, adaptive),
  document-card.svelte (shared: panel + library)
```

## Key decisions

- Messages table already exists (spec 002 schema). A retrieval-only assistant turn is stored as `role='assistant', mode='retrieval'` with content = JSON of hits — replaced by real generation in 004/005; render layer keys off `mode`.
- Mode per chat = `chats.mode` column (exists). Mode selector = Popover from the composer, colors via existing chart/status tokens mapped to semantic classes (green/amber/blue).
- Toast rules (FEATURES 5bis): sonner Toaster mounted once in layout; ingestion completion toasts only when the source panel is not in view (simple heuristic: toast only when the active chat doesn't contain the doc).
- Sidebar: shadcn `sidebar` component with groups Today/Yesterday/Previous, chat actions in a DropdownMenu (rename inline via Input, delete via AlertDialog).
- New-chat flow: creating a chat is lazy — "New chat" navigates to `/` (empty composer); the chat row is created on first message or first attach, avoiding empty-chat litter.
- Auto-title: first user message, truncated at word boundary ~40 chars (heuristic, no LLM), renameable.

## Tradeoffs

- Retrieval turn as JSON-in-content is transitional; acceptable because 004 replaces the writer, and the reader is isolated in `retrieval-turn.svelte`.
- No virtualized lists yet (fine below thousands of messages).

# Spec 019 — UI refonte (design system v2)

## Why

The current UI reads austere: mono-uppercase labels as the default register, square corners, a near-black dark mode without elevation, and the privacy promise repeated in text on every screen. Users are experienced chatbot users; the interface must follow the conventions ChatGPT/Claude/Perplexity/NotebookLM fixed, while keeping Regeste's paper-editorial identity. Full design rationale and research live in the owner-validated report (artifact "Refonte UI/UX", 2026-07-10); this spec freezes its decisions.

Owner-validated decisions: green is the single brand accent; mode colors are reduced (Private = no color, amber = the only egress signal for Assisted and My AI, blue removed — amends `.claude/rules/ui.md`).

## What

Phase 1 — tokens, primitives, theme setting:

- WHEN the app renders in light mode THEN surfaces SHALL use the v2 palette (background oklch 0.97/0.006/95, card 0.99, sidebar 0.95, ink foreground 0.27, green accent 0.55/0.07/155).
- WHEN the app renders in dark mode THEN surfaces SHALL show elevation by lightness (background 0.216, card 0.25, popover 0.28, sidebar 0.19, hue 80) instead of the near-black flat scale.
- WHEN a button renders THEN it SHALL use normal case, medium weight and rounded corners (no mono-uppercase, no rounded-none) on every variant.
- WHEN a status badge renders THEN it SHALL be a tinted pill; a colored dot appears ONLY on live states (indexing, active egress).
- WHEN the user opens Settings THEN they SHALL find an appearance control (System / Light / Dark, default System) whose choice persists across reloads.
- Contrast gate: body text pairs SHALL pass WCAG 4.5:1 and UI pairs 3:1 in both themes.

Phase 2 — shell and the three zones:

- WHEN the chat screen renders ≥1024px THEN the sidebar SHALL sit on the canvas and conversation + contextual panel SHALL share one rounded inset card, split by a hairline resize handle.
- WHEN the user drags the handle THEN the panel SHALL resize between ~320px min and 50% max (default 30%), snap-close below min, and its size SHALL persist across reloads.
- WHEN the panel is closed THEN a persistent toggle in the chat header, ⌘., and any event needing the panel (citation click, What AI saw, pre-send review) SHALL reopen it at its remembered size.
- WHEN the sidebar collapses THEN it SHALL become a 48px icon rail (⌘B); top actions and the account footer stay fixed, only the history scrolls.
- WHEN any screen renders THEN the redundant trust copy (header "Stored locally" chips, sidebar "Signed in · files stay local", stacked landing trust lines, account double mention, indexing toast tagline) SHALL be gone; the header egress pill (neutral when local, amber when data left) and What AI saw remain the proof surfaces.
- The app SHALL CONTINUE TO show the right contextual panel contents (Documents/Sources, pre-send review, What AI saw, viewer) with unchanged behavior, now under a constant panel header (name + close).
- WHEN the viewport is 768-1023px THEN the panel SHALL render as a right Sheet over the conversation; below 768px the existing mobile behavior (sidebar Sheet) SHALL remain.

Phase 3 — answer turn and composer:

- WHEN an AI answer has citations THEN a sources strip (numbered cards: document name + page/section anchor, max 3 visible + "+N" expander) SHALL render above the answer text, numbers matching the inline citation chips 1:1.
- WHEN the user hovers a citation chip THEN a preview card (document, page, 2-3 line excerpt) SHALL appear (~600ms delay, hoverable, Esc-dismissable); click/tap/Enter SHALL open the viewer at the highlighted passage. Touch never requires hover.
- WHEN an answer completes THEN one footer line SHALL show meta left ("Privé · 3 passages" — no destination when Private; "Assisté · 2 extraits · 1,3 Ko envoyés" when data left) and actions right (Copy and Try-again as icon buttons with tooltips, "What AI saw" as icon + text).
- WHEN the user edits a sent message THEN editing SHALL happen in place in the bubble (no dialog).
- WHEN the composer renders THEN it SHALL show one + menu (attach + preset actions merged), a ghost mode pill with a permanent chevron (amber dot only on egress modes), and a rounded-square green-accent send button (disabled-but-visible when empty, ■ Stop while generating); the positioning line + keyboard hints render below the card, outside it.
- The retrieval-preview turn SHALL use the same source-card language and turn footer as AI answers.
- User bubbles SHALL use a neutral (muted) background.

Phase 4 — copy and i18n:

- WHEN any surface names answer evidence THEN it SHALL say "Sources" (FR: «Sources»); "excerpts/extraits" stays only for egress surfaces (pre-send, What AI saw, quota). Key renames: "New chat"/«Nouvelle discussion», "Try again"/«Réessayer», follow-up placeholder "Ask a follow-up"/«Poser une question de suivi», in-chat panel named "Sources".
- Both dictionaries SHALL stay typed against each other and pass the copy rules sweep.

## Out of scope

- Related questions after answers (validated with guardrails; needs local generation → own spec).
- Quote-to-reply from text selection; version pagination after Try again; brand/logo; NotebookLM-style mobile tabs.
- Route reorganization under /chat/* (owner decision, after this spec).

## Open questions

None — all decisions arbitrated by the owner in the report session.

## Verification

- `bun run verify` green after each phase.
- Phase 1: open Settings → switch System/Light/Dark, reload, choice persists; sweep every screen in both themes; contrast audit of token pairs passes (4.5:1 text, 3:1 UI).
- Phase 2: on /chat/[id] ≥1024px drag the handle (resize, snap-close), reopen via header toggle and ⌘., click a citation with the panel closed (reopens on the passage), collapse sidebar to rail (⌘B), reload (sizes persist), shrink to 900px (panel becomes Sheet); grep the removed trust strings (no hits in Svelte files).
- Phase 3: ask a question on a doc chat; observe sources strip, chip hover preview, click-through highlight, footer line, in-place edit, empty-field send state, Stop while generating.
- Phase 4: full FR + EN screen sweep; dictionaries typecheck; banned-marker sweep clean.

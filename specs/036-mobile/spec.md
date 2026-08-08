# Spec 036 — Mobile

## Why

The app was built desktop-first on purpose (PROGRESS, spec 020: "anything mobile
— owner: desktop focus"), and the roadmap has carried a "mobile pass" row as
`later` ever since. The landing is the first thing a visitor meets and most of
them arrive on a phone, so a landing that reads well and an app that cannot be
operated with a thumb is the worst possible split.

Measured on the running dev server before writing this spec (Chromium, real
device metrics, 375/390/768/1440 px):

- No horizontal overflow anywhere. The document never scrolls sideways on any
  route at any of those widths — the `overflow-x-clip` and `flex-wrap` work done
  on the marketing layout holds. This spec must not undo it.
- The onboarding mode cards switch to three columns at `sm:` (640 px), so a
  768 px tablet renders three 130 px columns: the "Best for you" badge is clipped
  mid-word and the descriptions wrap one word per line.
- The settings modal is a fixed two-column grid (`grid-cols-[11.5rem_1fr]`,
  `h-[640px]`). At 390 px the dialog is 358 px wide and the rail eats 184 px of
  it, leaving 174 px for the panel: every control is cut off at the right edge.
- Interactive controls below the 44 px touch target that iOS and Android both
  recommend: 32 on the landing at 390 px, 13 on `/how-it-works`, 12 on
  `/privacy`, 10 on `/help`, 4 on `/chat`. The worst are the ones that do
  something destructive or navigational: the citation chip (16×16), the
  pre-send passage checkboxes (18×18), the answer action row (28×28), the
  sidebar trigger (32×32).
- The edit-question button and the sidebar row actions are revealed on hover
  only (`opacity-0 group-hover:opacity-100`), so on a touch device they are
  invisible and unreachable.
- `viewport-fit=cover` is set in `app.html` but no rule reads
  `env(safe-area-inset-*)`: on a notched phone the composer and the sidebar
  footer sit under the home indicator.
- The chat thread and the app shell already use `svh`, so the mobile
  browser-chrome trap is avoided. No `100vh` anywhere. This must stay true.

## What

Touch targets and reach:

- WHEN a control is displayed on a coarse pointer THEN the app SHALL give it a
  hit area of at least 44×44 CSS px, without changing its visual size on a fine
  pointer.
- WHEN a control is revealed on hover on a fine pointer THEN the app SHALL make
  it permanently visible on a coarse pointer.
- The app SHALL keep every existing keyboard shortcut and focus behaviour.

Layout:

- WHEN the viewport is narrower than 1024 px THEN the onboarding mode cards
  SHALL stack in one column, and each card SHALL show its full name, badge, cost
  line and button without clipping.
- WHEN the viewport is narrower than 768 px THEN the settings modal SHALL show
  one pane at a time: the tab list, or a tab's content with a way back.
- WHEN the viewport is narrower than 640 px THEN dialogs, sheets and the command
  palette SHALL fit the viewport with their actions reachable without a
  horizontal scroll.
- The app SHALL CONTINUE TO render the desktop three-zone shell unchanged at
  ≥1024 px (sidebar, main card, resizable contextual panel).
- The app SHALL CONTINUE TO have no horizontal document overflow at 375, 390,
  412, 768 and 1440 px on `/`, `/how-it-works`, `/privacy`, `/help`, `/chat`.

Safe areas and input:

- WHEN the device reports a safe-area inset THEN the composer, the sidebar
  footer and any bottom-anchored control SHALL sit above it.
- WHEN a text field is focused on iOS THEN the browser SHALL NOT zoom the page,
  i.e. the field's font size SHALL be at least 16 px on a coarse pointer.

## Out of scope

- Redesigning the landing's chapters for mobile art direction. The chapters
  already stack; this spec fixes what is broken, not what could be prettier.
- A mobile-specific navigation pattern (bottom tab bar). The sidebar sheet is
  the pattern; changing it is a design decision for the owner.
- PWA install and offline behaviour on mobile (spec 030 owns that).
- The document viewer's pinch-to-zoom on PDFs — it renders fit-to-width today,
  which is legible; gesture zoom is a feature, not a mobile-compat fix.
- Landscape phone layouts below 500 px of height.

## Open questions

None. Everything above is a compatibility defect measured on a real browser, not
a product decision.

## Verification

1. `bun run verify` exits 0.
2. `bun run dev`, then in a Chromium device-emulated context at 375, 390, 412,
   768 and 1440 px, on `/`, `/how-it-works`, `/privacy`, `/help`, `/chat`:
   - `document.documentElement.scrollWidth <= window.innerWidth + 1` everywhere;
   - no interactive element with a hit area under 44×44 px;
   - zero console errors beyond the known dev-only CSP inline-script warning.
3. At 390 px, drive the real flow: open the sidebar sheet, pick a mode, open the
   settings modal and reach every tab, open the command palette, open a chat and
   send a question, open a citation and the What-AI-saw panel.
4. At 1440 px, confirm the desktop shell is unchanged: sidebar collapse, the
   resizable panel, drag-to-resize, and the panel's ⌘. toggle.

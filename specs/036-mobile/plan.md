# Plan 036 — Mobile

## Shape of the change

Every fix is either a variant on an owned primitive in `src/lib/components/ui/`
or a breakpoint correction at a call site. No new dependency, no new abstraction,
no mobile-specific component tree — the shell already renders the panel as a
Sheet below 1024 px and the sidebar as a Sheet below 768 px.

Desktop safety is structural, not a promise: every rule added here is scoped to
a coarse pointer or to a `max-*` breakpoint, so at ≥1024 px with a mouse the
emitted CSS for existing elements is unchanged.

## Touch targets

Tailwind v4 ships the `pointer-coarse` variant (verified present in the
installed 4.3.2 build), which compiles to `@media (pointer: coarse)`. That is
the correct gate: it asks about the input device, not the viewport, so a small
laptop keeps its compact controls and a large tablet gets big ones.

Two mechanisms, chosen per case:

- Where the control can grow without moving anything, grow it: the size variants
  in `button.svelte` get a `pointer-coarse` minimum.
- Where growing it would break a tight layout (the citation chip sits inline in
  a paragraph, the pre-send checkbox sits in a dense list), keep the painted
  size and extend the hit area with a pseudo-element. A `::after` with
  `position:absolute; inset:-Npx` enlarges what a finger hits without touching
  layout or the visual rhythm. This is the same trick the shadcn sidebar already
  uses (`after:absolute after:-inset-2` in `sidebar-menu-action`), so it is the
  house pattern rather than an invention.

A `.touch-target` component class in `layout.css` carries the pseudo-element
recipe once, so call sites stay a single class.

## Hover-only affordances

`opacity-0 group-hover:opacity-100` becomes `max-pointer-coarse:opacity-0` +
the hover rule, i.e. transparent only where hover exists. Three call sites: the
edit-question button, the sidebar logo/trigger swap, the fingerprint copy hint.
The shadcn `sidebar-menu-action` already handles this correctly (`md:opacity-0`),
so it is left alone.

## Layout breakpoints

- `onboarding-modes.svelte`: `sm:grid-cols-3` → `lg:grid-cols-3`. Three cards
  need ~1024 px, not 640. Same for the two-card build.
- `settings-dialog.svelte`: below `md` the fixed `grid-cols-[11.5rem_1fr]`
  becomes a single column showing one pane at a time, driven by existing `tab`
  state plus a `showRail` flag. The dialog also drops to `h-[100svh]`-ish sizing
  on a phone so the panel has room. Desktop keeps the exact 880×640 grid.
- Dialog/Sheet/palette widths: the primitives already use
  `max-w-[calc(100%-2rem)]` and `w-3/4`, which hold; the palette's
  `max-h-[360px]` list is fine. Verified rather than assumed.

## Safe areas

`viewport-fit=cover` is already set. Add `env(safe-area-inset-*)` padding to the
three bottom-anchored surfaces: the composer wrapper, the sidebar footer, and
the sheet content when it is bottom- or side-anchored. Expressed with the CSS
`env()` fallback of `0px`, so nothing changes on a device without insets.

## iOS focus zoom

`input.svelte` and `textarea.svelte` already carry `text-base md:text-sm`
(16 px below `md`), which is the documented fix. The composer's textarea
overrides it with an explicit `text-sm`. That override is the one real offender
and gets a `max-md:text-base`.

## Tests

One unit test, on the only thing here with logic worth protecting: the settings
dialog's pane switching (`showRail`). Everything else is CSS, where a test would
assert the class string it just copied — a sugar test, banned by AGENTS.md. The
real proof is the spec's browser verification, run and reported.

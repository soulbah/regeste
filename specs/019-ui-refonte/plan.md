# Plan 019 — UI refonte (design system v2)

Reference: owner-validated design report (artifact, 2026-07-10). Values below are the frozen tokens.

## Phase 1 — tokens & primitives

- `src/routes/layout.css`: replace `:root`/`.dark` palettes.
  - Light: bg `oklch(0.9704 0.0058 95)`, card/popover `0.9902 0.0038 95`, fg `0.2698 0.0148 95`, secondary/muted/sidebar `0.9502 0.0078 95`, muted-fg `0.5602 0.0198 92`, border/input `0.8996 0.0082 95`, accent bg `0.9398 0.0208 155` / accent-fg `0.478 0.06 155`, ring `0.5502 0.0704 155`, destructive `0.5602 0.1204 32`.
  - Dark: bg `0.2162 0.0078 80`, card `0.2504 0.0082 80`, popover `0.2804 0.0088 80`, sidebar `0.1902 0.0072 80`, fg `0.9202 0.0088 95`, muted `0.2704 0.0084 80`, muted-fg `0.6802 0.012 90`, border/input `0.3204 0.0094 80`, accent `0.2902 0.0302 158` / accent-fg `0.7402 0.06 158`, ring `0.7002 0.0704 158`, destructive `0.6902 0.1104 32`.
  - `--radius: 0.75rem` (sm 8 / md 10 / lg 12 / xl 16). Shadows: keep scale, lower opacities in light, near-none in dark (elevation by lightness).
  - `--mode-private`/`--mode-myai` kept as deprecated aliases until phase 3 removes their usages; `--mode-assisted` (amber) becomes the egress color; `--highlight` unchanged (amber marker convention).
- `ui/button/button.svelte`: base → `text-sm font-medium normal-case rounded-[calc(var(--radius)-4px)]`, drop mono/uppercase/tracking/rounded-none; keep sizes, focus ring, `active:translate-y-px`.
- `ui/badge/badge.svelte`: pill (`rounded-full`, tinted bg + padding); variants: default (accent soft), secondary (muted), working (amber soft), destructive (tinted), outline. Dot is NOT part of the badge — callers add it only for live states.
- Theme setting: `mode-watcher` already installed. `+layout.svelte` `ModeWatcher` → `defaultMode="system"`. Settings page: appearance card with a 3-way control (shadcn Select or button group, match the language card idiom) calling `setMode()`; persisted by mode-watcher (localStorage). New i18n keys in both dictionaries.
- `.claude/rules/ui.md`: replace the trust-color invariant with: green = brand accent; amber = egress signal (Assisted/My AI); Private uncolored.
- Contrast audit: browser-side (canvas oklch → rgb → WCAG ratio) over token pairs, both themes.

## Phase 2 — shell & zones

- `+layout.svelte`: `Sidebar.Provider` + `AppSidebar collapsible="icon"` + inset main (`Sidebar.Inset`-like card on canvas). Canvas = `--sidebar` token background.
- `chat/[id]/+page.svelte`: keep `Resizable.PaneGroup` (paneforge), add `autoSaveId="regeste-main"`, panel Pane `collapsible collapsedSize={0} minSize≈22 maxSize=50 defaultSize=30` (percent equivalents at 1440px; conversation minSize≈35). Handle: widen hit area to 8px, hover/active highlight, dblclick → `resize(30)`. Header toggle button (PanelRight icon) + ⌘. global shortcut; `viewerStore`/presend/wais opens call `expand()` first.
- New `panel-header.svelte` (name + » close) wrapped around the four panel contents.
- `app-sidebar.svelte`: Header (logo, new chat, search, documents) / Content (history) / Footer (avatar + email only); drop mono-uppercase group styling; remove `sidebar.signedIn` line.
- Trust de-repetition: remove header chips on `/`, `/documents`, `/settings`; landing keeps one line; account keeps one; toast description dropped. Egress pill: neutral variant when 0 bytes, amber otherwise.
- 768-1023px: render panel as right `Sheet` (reuse existing global Sheet pattern); `hidden md:block` → `hidden lg:block` + Sheet trigger between md and lg.
- Sweep secondary chrome (⌘K palette, toasts, drop overlay, dialogs) — token inheritance should carry them; fix stragglers.

## Phase 3 — turn & composer

- `private-turn.svelte`: sources strip component (cards: n + name + anchor, cap 3 + "+N" expand state), superscript chips (Tooltip → HoverCard-style preview via existing Tooltip/Popover; tap/Enter → viewer), single footer row (meta left, actions right: Copy/Retry icon buttons + eye "What AI saw"), refusal in straight prose + collapsed closest passages.
- `retrieval-turn.svelte`: same source cards + footer.
- In-place edit: replace edit Dialog with inline textarea swap in the user bubble.
- `composer.svelte`: merge AddDocuments + Actions into one + menu (single Popover); mode pill ghost + chevron (amber dot only for Assisted/My AI); send button square-rounded `bg-mode-assisted`-free accent (green), disabled-visible, ■ while streaming; footer line moved below the card. Remove `--mode-private`/`--mode-myai` usages app-wide (mode-selector dots, meta dots), then delete the tokens.
- User bubble → `bg-muted`.

## Phase 4 — copy & i18n

- `src/lib/i18n/en.ts` + `fr.ts`: renames per spec §Phase 4, delete removed trust strings, add new keys introduced by phases 1-3 (already added along the way; this phase sweeps and reconciles), copy-rules sweep.

## Tradeoffs

- Deprecated mode tokens linger through phases 1-2 to keep each phase shippable; deleted in phase 3.
- Left sidebar deliberately NOT resizable (market convention; avoids paneforge/Sidebar sync hack).
- Panel percent bounds approximate px targets at common widths; exact px clamping via minSize percentages is acceptable (paneforge is %-based).

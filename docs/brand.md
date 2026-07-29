# Brand — the mark and the wordmark

## Concept

A _regeste_ is the chronological register in which a chancellery recorded its
acts, each entry a dated summary standing for the document it cites. The
product is that register, rebuilt: answers written from your documents, each
one citing its passages.

The identity draws one glyph from that: **the opening bracket**. It is the
citation — the most visible artifact in the product — and it is containment,
the boundary nothing crosses. It opens and never closes around the name,
because an entry in a register begins and the record stays open.

## Construction

Everything is set in **Newsreader**, the product's display face. The mark is
the font's own `[` and `R` at weight 600, outlines baked, bracket separated
from the letter by 130/2000 em. No drawn geometry, no pictogram: the mark and
the wordmark are the same typography at two sizes.

- The **bracket** carries the accent green (`--accent-foreground`).
- The **letter** carries ink (`currentColor`), so the mark follows any theme.
- The bracket overshoots the letter above and below, the way punctuation
  holds text. This is what keeps `[R` from reading as a slab-serif ligature.

The icon cut (favicon, OS icons) uses weight **700** with a 120/2000 em gap:
sturdier at 16 px, same construction.

## Files

| File                                   | Use                                                  |
| -------------------------------------- | ---------------------------------------------------- |
| `src/lib/components/brand-mark.svelte` | In-app mark, theme-aware (600)                       |
| `static/brand/mark.svg`                | Mono mark, inherits `currentColor` (600)             |
| `static/brand/mark-duotone.svg`        | Standalone duotone, light/dark via media query (600) |
| `static/favicon.svg`                   | Browser tab, light/dark via media query (700)        |
| `static/icons/*.png`                   | PWA / OS icons, paper background, sRGB (700)         |

PNG values baked in the icons: paper `#f6f5ef`, ink `#403c33`, green `#3d6b4f`.

## Wordmark

`[Regeste` — the name in Newsreader (the app's `font-display`), sentence case,
preceded by the bracket in accent green. In app code this is plain text:

```svelte
<span class="font-display tracking-tight">
	<span class="text-accent-foreground">[</span>Regeste
</span>
```

## Rules

- The name lives in the wordmark and the tab title only, never in copy
  (`.claude/rules/copy.md`).
- One bracket, always opening, never closed: `[R]` reads as ®, and a sealed
  pair contradicts an open-source product.
- The bracket is the only colored element. Never tint the letter, never add
  a second color, never put the mark on a colored plate.
- Do not regenerate assets by hand: the outlines come from the font file via
  the pipeline in the session scratchpad (fontkit → compose → resvg). Weight,
  gap and margins are the design; changing them is a redesign.

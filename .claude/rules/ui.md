---
paths:
  - 'src/**/*.svelte'
  - 'src/lib/components/**'
---

# UI rules

- **shadcn-svelte first, always.** Before any native HTML interactive element (`button`, `a`, `input`, `select`, `textarea`, `dialog`…), check `src/lib/components/ui/` — if the component exists, use it; if it exists in the registry but not locally, install it with the `add-component` skill. Raw interactive HTML in app code is a task failure. Plain semantic containers (`div`, `section`, `p`, headings) styled with Tailwind are fine.
- Never hardcode colors, radii or fonts — use theme tokens (`bg-background`, `text-muted-foreground`, `border-border`, `font-display`, `rounded-lg`…). Identity lives in `src/routes/layout.css` CSS variables, not in component-level overrides.
- Own the copied components: adapting variants inside `src/lib/components/ui/*` (via `tailwind-variants`) is the expected way to keep our identity — do it there, once, rather than sprinkling class overrides at call sites.
- Svelte 5 runes only (`$state`, `$derived`, `$props`, `$effect`). No `export let`, no `$:`, no legacy stores in new code.
- Shared client state: `.svelte.ts` modules in `src/lib/state/`. Web workers: plain TS in `src/lib/workers/` (runes don't work there), talk to them via Comlink.
- Trust-boundary colors are a product invariant: Private = green, Assisted = amber, My AI = blue.
- Text visible to users goes through i18n (once wired) — never hardcode user-facing French/English strings in components.

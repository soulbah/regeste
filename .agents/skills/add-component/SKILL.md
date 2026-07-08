---
name: add-component
description: Add a shadcn-svelte UI component to the project. Use whenever the UI needs an element not yet in src/lib/components/ui/.
---

# Add a shadcn-svelte component

1. Check `src/lib/components/ui/` — maybe it's already installed.
2. Check the registry list: https://www.shadcn-svelte.com/docs/components — find the component name.
3. `bunx shadcn-svelte add <name> -y` — files land in `src/lib/components/ui/<name>/`.
4. Import from the index: `import * as Dialog from '$lib/components/ui/dialog';` or named exports per the component's docs page.
5. `bun run check` to confirm types.

Rules:

- If no shadcn-svelte component exists for the need, only then use native HTML + Tailwind — and say so in your report.
- Identity tweaks (variants, sizes) go inside the copied component files via `tailwind-variants` — we own them. Never fork a second copy.
- Never re-run `shadcn-svelte init` — it can overwrite the theme in `src/routes/layout.css`.

# Tasks 030 — PWA

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [ ] 1. Reverse the "not a PWA" statements: `PROGRESS.md`, `docs/internal/FEATURES.md`
      (T5), `specs/009-trust-pack/spec.md`, `specs/025-retrieval-continuity/plan.md`, the
      comment at `src/routes/+layout.svelte`, and the stale `vite.config.ts` comment that
      points at `static/_headers` (the file is at the repo root).
      Done when: `rg -n "not a PWA|Not a PWA|PWA.*parked"` returns only spec 030.

- [ ] 2. [P] Icons and manifest. `static/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png`
      (maskable = its own file, logo inside the centred 80% circle; apple-touch = exactly
      180×180, no alpha) and `static/manifest.webmanifest` with `id`/`scope`/`start_url`
      `/chat/`, `display: standalone`, `launch_handler.client_mode: navigate-existing`,
      light `theme_color`/`background_color` `#f6f5f1`, `color_scheme_dark` `#1c1916`,
      shortcuts, screenshots.
      Done when: DevTools → Application → Manifest lists no errors on the deployed origin
      and the install affordance appears.

- [ ] 3. [P] `src/app.html`: manifest link, apple-touch-icon, `apple-mobile-web-app-title`,
      `color-scheme`, and the two `theme-color` metas with `prefers-color-scheme` media.
      Done when: the installed window chrome follows the OS theme on Chromium.

- [ ] 4. `src/lib/pwa/cache-names.ts` + fetch handler in `src/service-worker.ts`: the
      bail-out ladder, the fetched-shell navigation cache, tiered precache, and the
      `regeste-pwa` skip-waiting branch. Remove `skipWaiting()` from install, keep
      `clients.claim()`.
      Done when: offline reload of the deployed app boots, `crossOriginIsolated === true`,
      `SharedArrayBuffer` is defined, and the cache holds no `/cdn/*` or `workers/*` entry.

- [ ] 5. Dev exemption gate: unregister leftover workers and delete only `regeste-shell-*`
      caches when `dev`.
      Done when: `bun run dev` then DevTools shows zero service workers and the model
      caches are untouched.

- [ ] 6. `src/lib/state/pwa.svelte.ts`: install availability, deferred prompt, installed
      state, update-ready, offline flag, and the persistence calls (start-up retry,
      `appinstalled`, before a large download).
      Done when: `navigator.storage.persisted()` is true in the installed app on Chrome.

- [ ] 7. Install invitation before the AI download (contextual panel, once, dismissible,
      dismissal stored outside evictable storage) + Settings entry with the three states.
      Copy in both dictionaries, swept against the banned-marker list.
      Done when: the invitation appears once before the download and never again after
      dismissal.

- [ ] 8. Update affordance wired to the waiting worker, suppressed while a generation or
      download is in flight.
      Done when: deploying a new build with the app open shows the affordance and applies
      nothing until clicked.

- [ ] 9. Fix the two collateral bugs: hide shell caches from `models.svelte.ts`;
      unregister the worker before wiping caches in `settings.svelte.ts`. Fix the quota
      display to show usage only.
      Done when: the shell cache does not appear in the models list and a panic wipe
      completes cleanly.

- [ ] 10. `/chat/how-it-works` duplicate route sharing one content component, canonical on
      both copies, `Allow: /chat/how-it-works` in robots.txt, in-app links repointed.
      Done when: the in-app explainer never leaves the installed app window.

Completion checklist (all required before the spec is closed):

- [ ] All tasks checked with their Done-when verified
- [ ] spec.md "Verification" section executed end-to-end
- [ ] `bun run verify` passes
- [ ] PROGRESS.md updated

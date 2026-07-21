# Plan 030 — PWA

## No PWA framework

`$service-worker` (SvelteKit native) over `@vite-pwa/sveltekit` + Workbox. The plugin
would work (it delegates to `src/service-worker.ts` rather than replacing it), but it
buys only per-file revision hashes and a store-based update API, against three
dependencies inside an already 5.7 MB service worker and legacy Svelte stores that the
runes-only rule forbids. `$service-worker` gives `build`, `files`, `version`; `version`
changes every build (free cache busting) and `build` is `[]` in dev (free dev exemption).

## Decisions taken (researched, 2026-07-19)

| Question           | Decision                                                                                                                      | Reason                                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install invitation | Once, dismissible, in the panel, immediately before the AI download; plus a passive entry in Settings                         | `web.dev/persistent-storage`: ask when critical data is being saved, in a user gesture, never on load. iOS storage sandbox is separate from Safari, so the offer must precede the 2.4 GB download or it is paid twice |
| Offline contract   | Eager-precache the app shell **and** the SQLite engine (~9 MB)                                                                | The engine is needed by 100% of sessions; without it the app opens and then the database throws. Spec 014 T3 makes offline a demonstrated proof                                                                       |
| Update UX          | Explicit: the worker waits, the page offers "new version", `skipWaiting` only on click, never during generation or a download | Archibald: "if this might break things, don't use skipWaiting". Lazy chunk names change between builds; Cloudflare stops serving the old ones                                                                         |
| Manifest scope     | `/chat/`, manifest served at `/chat/manifest.webmanifest`, `id` pinned                                                        | The Google pattern on a shared origin (`docs.google.com/document/` → `scope: "/document/"`). Trailing slash is load-bearing: `/chat` would also match `/chatbot`                                                      |
| Explainer page     | Duplicate route `/chat/how-it-works`, canonical → `/how-it-works`, no `noindex`                                               | Google: intra-site duplication is a canonicalisation question, not a penalty; `noindex` is explicitly not recommended for it. `scope_extensions` does not apply (cross-origin only, no iOS)                           |
| Theme colour       | Manifest static light; `<meta name="theme-color" media>` for adaptive chrome; `color_scheme_dark` included for the future     | The splash paints from the manifest before any CSS exists, so it cannot adapt. Safari 26+ ignores the meta and samples the body background instead                                                                    |

Colours from `layout.css`: light background `#f6f5f1`, dark `#1c1916`.

## Service worker: one worker, two roles

`src/service-worker.ts` keeps its WebLLM message bridge and gains a `fetch` handler.
Never a second registration at scope `/` — it would silently replace the WebLLM
registration and kill Private mode with no build error.

Bail out (no `respondWith`, request goes to the network) when any of:
non-GET · cross-origin · carries `Range` · `/cdn/*` · `/api/*` · the worker script or
`_app/version.json`.

`/cdn/*` is excluded because the model weights are GB-scale and the libraries already
own their Cache API entries for those exact URLs; intercepting double-stores them and
inflates the quota that the eviction policy reads.

Navigations: serve a **fetched** Response stored at install. Never `new Response(html)`
— a synthesised document loses COOP/COEP, `crossOriginIsolated` goes false,
SharedArrayBuffer disappears and the wllama CPU tier dies. Only on the cached path, so
it never reproduces in dev. Install asserts both headers are present and fails loudly
otherwise.

Precache, eager: the shell HTML, `_app/immutable/entry|nodes|chunks`, CSS and fonts,
`/vendor/sqlite/sqlite3.{mjs,wasm}` (~9 MB, ~76 entries). Split into a failure-tolerant
step: an atomic `addAll` that fails leaves the user with **no** service worker at all,
including no WebLLM host. Never `[...build, ...files]` — 66 MB + 19 MB, of which 62 MB
is workers.

Runtime, opportunistic, same versioned cache: `_app/immutable/workers/**` and
`_app/immutable/assets/*.mjs`. The user stores only the ORT variant their device loads.

`skipWaiting()` is removed from `install`; `clients.claim()` stays (the WebLLM client
needs a controller). A `regeste-pwa` message branch triggers it on demand, declared before
the `regeste-llm` guard so the inference protocol is untouched.

## Dev exemption

Three existing gates stay verbatim: `vite.config.ts` `serviceWorker.register: false`,
the `if (dev) return` in `+layout.svelte`, and `waitForController` returning false in
dev. A fourth is added: in dev, unregister any leftover worker and delete **only**
`regeste-shell-*` caches — deleting the model caches would re-download gigabytes on every
dev boot.

## New/changed files

- `specs/030-pwa/*`, `PROGRESS.md`, `docs/internal/FEATURES.md` (T5), and the four places
  that currently assert "not a PWA".
- `static/manifest.webmanifest`, `static/icons/*`, `src/app.html`.
- `src/service-worker.ts` (fetch handler), `src/lib/pwa/cache-names.ts` (shared name).
- `src/lib/state/pwa.svelte.ts` (install, update, offline, persistence).
- `src/lib/state/settings.svelte.ts` (persistence call moves out; quota display fixed),
  `src/lib/state/models.svelte.ts` (hide the shell cache from the model list).
- `src/routes/chat/how-it-works/+page.svelte` + canonical on both copies.

## Two collateral bugs this must fix

`models.svelte.ts` lists every cache and labels unknown ones by raw name, so the shell
cache would appear in "models on this device" with a working Delete button.
`settings.svelte.ts` `wipeEverything()` deletes caches then navigates, which would run
against a worker whose cache was just destroyed; unregister first.

## Quota display is wrong today

Chrome's `estimate().quota` returns `usage + 10 GiB` whenever the disk is large enough,
regardless of free space. Preflighting "does 2.4 GB fit?" with `quota - usage` passes on
a disk with 200 MB free. Show usage only; gate large downloads on catching
`QuotaExceededError`.

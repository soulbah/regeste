# Spec 030 — PWA (installable, offline, eviction-resistant)

## Why

Everything a user owns in Folio lives in the browser: the SQLite index in OPFS, the
documents in OPFS, and up to 2.4 GB of model weights in the Cache API. Today that data
is best-effort storage a browser may evict, the app cannot open without the network,
and it cannot be installed. Installing materially changes all three: Chrome grants
persistent storage to installed apps, and on iOS an installed app gets a storage
sandbox that escapes Safari's 7-day cap on script-writable storage. This reverses the
"deliberately not a PWA" position recorded for T5 (FEATURES) now that the Cloudflare
deployment is treated as production.

## What

- WHEN the app is served from the deployed origin THEN the app SHALL expose a web app
  manifest and SHALL be installable in browsers that support installation.
- WHEN the user has loaded the app once online THEN the app SHALL open offline, and
  every document already added SHALL stay searchable and readable offline.
- WHEN the user is about to download the on-device AI THEN the app SHALL offer, once
  and dismissibly, to install the app, and SHALL request persistent storage in the same
  user gesture.
- WHEN the user dismisses that offer THEN the app SHALL NOT offer it again.
- WHEN persistent storage has been granted THEN Settings SHALL say so; when it has not,
  Settings SHALL offer the way to obtain it.
- WHEN a new version has been deployed THEN the app SHALL tell the user a new version is
  ready and SHALL apply it only on the user's action, never during generation or a
  download in progress.
- WHEN the operating system is in dark mode THEN the installed app's chrome SHALL follow
  it on engines that support it.
- WHEN the user opens the in-app explainer THEN it SHALL stay inside the installed app.
- The app SHALL CONTINUE TO be cross-origin isolated on every path, including pages
  served from the cache offline.
- The app SHALL CONTINUE TO run Private mode inference through the existing service
  worker.
- The app SHALL CONTINUE TO behave in local development exactly as it does today: no
  service worker, no caching, no install affordance.

## Out of scope

- `share_target` (receiving a shared file from the OS): needs a POST-intercepting route,
  which contradicts this spec's GET-only service worker rule. Its own spec.
- `window-controls-overlay`: needs a designed titlebar, so it goes through the
  frontend-design skill, not a manifest edit.
- Storage Buckets API: Chromium-only, and `persist()` covers only the default bucket.
- Offline OCR: the OCR models (12 MB) stay online-only.
- A real brand icon (see Open questions).

## Open questions

- [NEEDS CLARIFICATION: the repo has no brand mark — `src/lib/assets/favicon.svg` is the
  Svelte logo. Installability requires 192/512 icons, and the install dialog and home
  screen will show them. Ship a neutral wordmark placeholder now and replace it when the
  brand lands, or block this spec on the brand?]

## Verification

1. `bun run verify` exits 0.
2. `bun run dev`: DevTools → Application shows **zero** service workers and zero caches
   created by the app shell; HMR works as before.
3. Deployed origin, fresh profile: DevTools → Application → Manifest shows no errors and
   the install affordance appears. Install it.
4. In the installed app: `crossOriginIsolated === true` and `SharedArrayBuffer` is
   defined. Add a document, ask a question, get a cited answer.
5. Cache storage holds the shell (~9 MB, ~76 entries) and contains **no** `/cdn/*` entry
   and no `/_app/immutable/workers/*` entry. The shell entry's stored response carries
   both `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`.
6. Go offline, relaunch the installed app: it opens, the document list is intact, a
   question over an already-indexed document still answers.
7. `navigator.storage.persisted()` returns `true` in the installed app on Chrome.
8. Deploy a new build with the app open: a "new version" affordance appears and does
   nothing until clicked.

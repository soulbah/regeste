# Spec 030 — PWA capabilities in the browser (offline, eviction-resistant)

## Scope note (owner, 2026-07-19)

This is **not** about shipping a pseudo desktop app. Everything happens in the
browser tab. What is wanted are the platform capabilities a PWA unlocks — a
service worker, offline start-up, and storage the browser will not silently
evict. Installation is a browser-native option the user may take or ignore; the
app never promotes it.

## Why

Everything a user owns in Regeste lives in the browser: the SQLite index in OPFS, the
documents in OPFS, and up to 2.4 GB of model weights in the Cache API. Yet the app
could not open without the network, and that data was best-effort storage a browser
may evict to reclaim space — an app whose whole promise is "your documents stay here"
was one storage-pressure event away from losing them. A service worker fixes the
first, `navigator.storage.persist()` the second. This reverses the "deliberately not
a PWA" position recorded for T5 (FEATURES) now that the Cloudflare deployment is
treated as production.

## What

- WHEN the user has loaded the app once online THEN the app SHALL open offline in the
  browser, and every document already added SHALL stay searchable and readable offline.
- WHEN the app starts THEN it SHALL ask the browser to make its storage persistent, and
  SHALL keep asking on later starts while the answer is no.
- WHEN persistent storage has been granted THEN Settings SHALL say so; when it has not,
  Settings SHALL offer the way to obtain it.
- The app SHALL NOT promote installation anywhere in the interface.
- WHEN a new version has been deployed THEN the app SHALL tell the user a new version is
  ready and SHALL apply it only on the user's action, never during generation or a
  download in progress.
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

- [NEEDS CLARIFICATION: the repo has no brand mark — the favicon asset is still the
  Svelte logo. The manifest icons are a neutral placeholder; they surface only if a user
  chooses to install or bookmark. Replace when the brand lands.]

## Verification

1. `bun run verify` exits 0.
2. `bun run dev`: DevTools → Application shows **zero** service workers and zero caches
   created by the app shell; HMR works as before.
3. Deployed origin, fresh profile: DevTools → Application → Manifest shows no errors,
   and no install invitation appears anywhere in the interface.
4. In the browser tab: `crossOriginIsolated === true` and `SharedArrayBuffer` is
   defined. Add a document, ask a question, get a cited answer.
5. Cache storage holds the shell (~9 MB, ~76 entries) and contains **no** `/cdn/*` entry
   and no `/_app/immutable/workers/*` entry. The shell entry's stored response carries
   both `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`.
6. Go offline, reload the tab: it opens, the document list is intact, a
   question over an already-indexed document still answers.
7. `navigator.storage.persisted()` returns `true` after regular use on Chrome (site
   engagement is the grant path in a plain tab), or immediately after the Settings
   request in Firefox.
8. Deploy a new build with the app open: a "new version" affordance appears and does
   nothing until clicked.

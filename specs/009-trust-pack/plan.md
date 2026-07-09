# Plan 009 — Trust pack

## Pieces

- **Worker additions** (read-only SQL): `chatPrivacySummary(chatId)` → { cloudRequests, bytes }; `documentEgress()` → per-document last assisted/myai send date (privacy_events → messages → citations.document_name is snapshot-based; join via citations.chunk_id → chunks.document_id for live docs); `setChatPrivateOnly(id, on)`; `weekPrivacySummary()` (P4, 7-day window variant of privacySummary).
- **Settings state** (`state/settings.svelte.ts`): `forceOffline` persisted in local DB settings (`setting:force_offline`); storage estimate via `navigator.storage.estimate()` + `persisted()`; wipe = delete OPFS root entries + Cache API keys + `indexedDB.databases()` cleanup, then `location.reload()`. DB worker gets `close()`? No — wipe runs from main thread after `releaseDbLock()`; simplest robust order: close worker (terminate), clear OPFS via `navigator.storage.getDirectory()` recursive remove, `caches.keys()→delete`, reload.
- **Offline guard**: tiny `guardedFetch` in `lib/net.ts` — throws `OfflineError` when `settingsStore.forceOffline`; used by myai store, assisted send, session refresh/auth client stays (auth is account, still network → guard it too; honest message). Composer/mode selector show offline state line when forced.
- **Settings page** (`routes/settings/+page.svelte`): sections Storage / Privacy / Offline / Danger zone. Sidebar entry.
- **Data-flow page** (`routes/how-it-works/+page.svelte`): static 3-column per-mode explainer, links from settings + mode selector footer.
- **Badges**: chat header (chat page) uses `chatPrivacySummary`; library page rows use `documentEgress`; refresh after sends via existing store refreshes.
- **P7**: switch in documents panel header; `chats.privateOnly` guard in mode selector (disable cloud rows with reason when active chat locked) and in `send()` (belt-and-braces).
- **P8/P9**: `SearchHit.score` already returned. Threshold: RRF scores ~[0, ~0.033]; weak when top score < 0.02 (tune during verification). Warning line in retrieval-turn + presend-panel; score shown per excerpt in presend list (`(score × 1000).toFixed(1)` arbitrary units? no — show as percent of max in set: honest "match strength" relative).

## Tradeoffs

- Document egress via citations join only counts sends that produced citations; sends with zero citations aren't attributable to a document — acceptable (badge is per-document evidence, not accounting).
- Force offline guards app-level fetches (the promise is "no user content leaves"); it does not attempt to block the browser's own traffic (vite HMR, fonts already local).
- Wipe terminates the DB worker then clears OPFS: single-tab guarantee comes from the existing Web Lock.

## Tests (no sugar)

- None new — thresholds and wiring are exercised in verification; no new pure logic beyond trivial SQL.

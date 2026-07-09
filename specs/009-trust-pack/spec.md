# Spec 009 — Trust pack (privacy surfaces + guarantees)

## Why

FEATURES T1/T2/T4/T5/T6 (trust/sécurité — the audience is sensitive-documents users) and P2/P3/P4/P7/P8/P9 (privacy surfaces exploiting `privacy_events` and retrieval scores that already exist). This is the product's argument made visible: not just "we don't send your data", but controls and proofs.

## What

### Settings page (new, hosts several features)

- The app SHALL have a Settings page (sidebar entry): storage status (T6), global privacy counter (P4), force-offline toggle (T2), panic wipe (T1), data-flow explainer link (T4).
- T6: Settings SHALL show OPFS/storage usage estimate and whether persistent storage is granted, with a plain-language warning when not (Safari eviction).
- P4: Settings SHALL show data shared this week: requests and bytes per destination (from `privacy_events`).
- T2: a global "Force offline" toggle SHALL block every outgoing network request from app code (single guard in front of fetch for Assisted/My AI/session; Private generation and local pipeline unaffected). WHEN enabled, cloud modes show an honest "offline mode" state instead of failing obscurely.
- T1: a "Delete everything" action SHALL wipe OPFS (originals + SQLite), local caches (models) and reload — double confirmation, explicit list of what is destroyed and what survives (nothing local).

### Data-flow page (T4)

- A static page SHALL explain, per mode, what leaves the device, what stays, what the server retains. Linked from Settings and the mode selector.

### Privacy badges

- P2: the chat header SHALL show the chat's egress state: "0 bytes sent" (green) or "N cloud requests" (amber), from this chat's privacy events.
- P3: the library SHALL badge each document: "never sent" or "excerpts sent <last date>" (join privacy events ← citations ← chunks ← documents for assisted/myai messages).
- P7: each chat SHALL have a "Private only" lock (documents panel): when on, cloud modes are unselectable for this chat with an honest reason; persisted (`chats.private_only` already in schema).

### Retrieval honesty

- P8: WHEN all retrieval scores are below a threshold THEN retrieval-preview turns and the pre-send review SHALL show "weak matches — answer may be unreliable".
- P9: the pre-send review SHALL show each excerpt's relevance score (power-user detail, subtle).

### Invariants

- The app SHALL CONTINUE TO pass `bun run verify`; no server changes (all local data).

## Out of scope

- PWA/service worker (T5) — moved to its own later change: caching a WASM/model-heavy app needs care, not a checkbox.
- Model management screens (M1-M3 → spec 013), Assisted quota gauge (R5 → spec 015).

## Open questions

(none — FEATURES rows are explicit)

## Verification

1. Settings: storage numbers visible; persist status shown; privacy counter matches Privacy Report totals.
2. Force offline ON → Assisted/My AI sends show honest offline state, no fetch fired (network tab clean); OFF restores.
3. Panic wipe: after confirming twice, documents/chats/models gone, app restarts empty.
4. Chat with only private answers shows "0 bytes sent"; after an Assisted send, badge flips; document badge shows "excerpts sent".
5. Private-only chat: cloud modes locked with reason.
6. Low-relevance query (gibberish) → weak-match warning; review shows scores.
7. `bun run verify` exits 0.

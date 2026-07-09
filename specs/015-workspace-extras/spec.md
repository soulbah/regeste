# Spec 015 — Workspace export + Assisted quota gauge (R1, R5)

## Why

FEATURES R1: export workspace v0 (plain zip: JSON + original files) as the anti-eviction safety net — the encrypted version comes in V1.1. R5: a visible Assisted usage gauge is mandatory the moment a quota exists.

## What

- R1: Settings SHALL offer "Export my workspace": a zip containing `workspace.json` (chats, messages, citations, what-AI-saw records, privacy events, document metadata, settings) and every original file, built entirely client-side and downloaded — no network.
- WHEN some originals are missing from OPFS THEN the export SHALL still succeed and list them as missing in the JSON.
- R5: WHEN the user is signed in THEN Settings SHALL show this month's Assisted usage (used / limit) fetched from a read-only endpoint; guests see a sign-in hint instead.
- The new `/api/quota` endpoint SHALL require a session and never touch content.
- The app SHALL CONTINUE TO pass `bun run verify`.

## Out of scope

- Import/restore (arrives with the encrypted export, V1.1), encryption, scheduled backups.

## Verification

1. Settings → Export my workspace → a .zip downloads; its `workspace.json` contains the chats/messages/documents; originals present under `originals/`.
2. Signed in: Settings shows "X / 200 this month" matching the server value; `/api/quota` returns 401 without a session.
3. `bun run verify` exits 0.

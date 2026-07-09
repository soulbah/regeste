# Spec 017 — Preset actions (R3)

## Why

FEATURES R3: read-only prompt templates (Summarize, Find key dates, Find amounts, Find obligations) — the common document jobs, one click instead of typing the same question again. Custom actions come in V1.1.

## What

- The composer SHALL offer an Actions menu (next to Add) when the chat has at least one ready, enabled document.
- The four presets SHALL send a well-formed grounded question through the normal send path (mode rules, review, citations all apply).
- Presets SHALL be localized like any other string; the sent question is in the interface language.
- WHEN no ready document is enabled THEN the menu SHALL be absent (an action on nothing is noise).
- The app SHALL CONTINUE TO pass `bun run verify`.

## Out of scope

- Custom user actions (V1.1), per-document actions, chaining.

## Verification

1. Chat with a ready doc → Actions menu lists the four presets; clicking one sends the question and the pipeline answers as usual.
2. Chat without documents → no Actions menu.
3. FR locale → menu and sent questions in French.
4. `bun run verify` exits 0.

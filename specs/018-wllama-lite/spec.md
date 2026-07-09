# Spec 018 — Private Lite: wllama CPU fallback (cross-origin isolation)

## Why

15–25% of target desktops have no usable WebGPU (Firefox default-off, old drivers, VMs/VDI) and today they lose Private mode entirely — on a privacy product, that excludes the wrong people. The original blocker (COOP/COEP headers break OAuth popups) no longer applies: auth is OTP by fetch, and any future OAuth will use full-page redirects. Owner arbitrated (2026-07-09): enable the headers, ship the Lite tier. RESEARCH doc tier table already planned it (tier "Lite (WASM)", 2–5 tok/s).

## What

### Phase 1 — cross-origin isolation, no regression

- The app SHALL ship `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` on documents (dev + prod).
- Every existing flow SHALL keep working under isolation: ingest (pdf.js, embeddings download), local DB (opfs-sahpool), viewer, search, WebLLM weight download + generation path, Assisted/auth fetches.
- `crossOriginIsolated` SHALL be true at runtime (checkable in console).

### Phase 2 — Lite tier

- WHEN WebGPU is unavailable THEN capability detection SHALL offer a Lite tier (small GGUF via wllama, multithreaded) instead of "unavailable": same consent-first download card, honest size and "slower, but everything stays on this device" wording.
- Generation SHALL stream through the existing Private path (grounded prompt, [n] citation validation, stop, privacy event device·0 bytes, what-AI-saw records).
- WHEN multithreading is unavailable (no isolation) THEN Lite SHALL stay hidden (single-thread is not shippable).
- Download sizes and states use the existing zero-jargon rules.
- The app SHALL CONTINUE TO pass `bun run verify`.

## Out of scope

- Replacing WebLLM for GPU machines (wllama's WebGPU backend is not needed); GBNF grammar-forced citations (prompt + validation already proven); mobile.

## Verification

1. Dev + preview: `crossOriginIsolated === true`; full regression sweep: ingest PDF+MD, search, viewer highlight, ⌘K, Assisted 503 path, settings.
2. With WebGPU force-disabled (flag/override): selector shows the Lite download card; consent → download → ready; grounded question streams an answer with valid citations; stop works; privacy event device · 0 bytes.
3. On the WebGPU machine: Private (WebLLM) still selected normally, unchanged.
4. `bun run verify` exits 0.

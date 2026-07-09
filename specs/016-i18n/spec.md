# Spec 016 — Interface i18n FR/EN (R4)

## Why

FEATURES R4: FR/EN interface, "quasi gratuit maintenant, pénible à retrofit". The product docs are French, the audience starts French — the UI must speak both.

## What

- The app SHALL ship a locale system (EN + FR dictionaries, no network, no new framework): every user-facing string in app components/pages goes through it.
- The initial locale SHALL follow `navigator.language` (fr* → FR, else EN) and persist as a device setting once the user picks one in Settings.
- Settings SHALL offer the language switch (English / Français), effective immediately.
- Dynamic strings (counts, sizes, dates) SHALL interpolate through the dictionary, not concatenate raw.
- The app SHALL CONTINUE TO pass `bun run verify`; no visual regressions in either locale.

## Out of scope

- Translating user content, chat titles, or document names; RTL; other locales; server error strings (the client maps status codes to localized messages already).

## Verification

1. Fresh FR browser profile → UI in French; Settings switch to English → immediate, persisted across reload.
2. Sweep main surfaces in FR: home, sidebar, composer + mode selector, documents panel, library, settings, privacy report, how-it-works — no stray English.
3. `bun run verify` exits 0.

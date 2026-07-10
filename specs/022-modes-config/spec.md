# Spec 022 — AI modes: minimal picker, AI-tab cards, onboarding

Owner validated the proposal (artifact "Modes IA : proposition", 2026-07-10) and its two amendments: the placeholder only applies before the very first choice (the default-mode setting takes over afterwards), and download progress stays visible on the composer pill. One frozen decision stands from FEATURES §5: "Best for this device" stays capability-detected, never a static "Recommended".

## What

Picker (mode selector popover):

- WHEN the picker opens THEN it SHALL show exactly three rows (Private, Assisted, My AI): name, one static description line, and a state on the right (check when current, "Ready", "Set up →", "Sign in →", or a download percentage). No configuration form ever renders in the popover.
- WHEN the user clicks a ready mode THEN it SHALL become the chat's mode and the popover closes.
- WHEN the user clicks a mode that needs setup THEN the Settings modal SHALL open on the AI tab, scrolled to that mode's card (URL field focused for My AI), and the mode SHALL activate automatically once its setup completes (toast).
- Blocked rows (private-only chat, forced offline, unavailable device) stay inert with the reason in the description line.

Composer pill:

- WHEN no mode has ever been chosen on this device THEN the pill SHALL read as a placeholder ("Choose AI") and the send button SHALL be disabled with the reason tooltip.
- WHEN the private model is downloading THEN the pill SHALL show the percentage.
- Any successful mode selection marks the device as "mode chosen" (local DB setting).

Settings → AI tab (source of truth):

- The tab SHALL render one card per mode: header (name + amber dot for egress modes + state badge), configuration rows in the modal's row grammar, and the primary action (Download with progress / Sign in / endpoint + test + default model).
- A ready card SHALL offer "Use this mode", which closes the modal and selects the mode in the active composer.
- The old flat sections (My AI endpoint rows, Assisted quota row) fold into the cards; the local-models list and speed test live in the Private card.

## Done when

- `bun run verify` exits 0.
- Fresh profile: pill placeholder, send disabled with reason, clicking My AI in the picker lands on its card with the URL field focused, configuring it (stub) auto-selects the mode.
- Configured profile: picker switches modes in one click; no config UI in the popover.
- Both locales sweep clean; orphaned picker-config strings removed.

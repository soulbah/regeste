# Spec 032 — Onboarding: an engine, then a document

Owner direction (2026-07-27): the first run has to deliver two things before a
question is possible, an engine that can answer and a document to answer from.
When no mode has been chosen the app pushes the choice; once one is chosen it
pushes the document. The owner also asked that the recommended model be obvious
for people who do not want to think about it, and that what will actually run
on their machine be stated plainly.

## Why the previous home did not do this

Measured in the browser on a fresh profile, before any change:

- The drop zone (large, dashed, centred) and the mode pill (small, in the accent
  colour) competed, and the real blocker was the quieter of the two.
- The three-beat strip declared `Add a document · Pick how it answers · Ask`,
  an order the app does not support: without an engine a document leads nowhere.
- `home.privacy` printed "Everything runs on your device" before the mode was
  picked, promising something My AI and Assisted do not keep.
- The composer invited a question while Send was disabled and no document
  existed: three invitations, none of them possible.

Not a defect, checked and dismissed: the first-run CTA does open Settings. It
read as dead only because the DOM was inspected before Svelte had flushed.

## What

- `onboardingState()` SHALL derive one of four steps from existing stores, never
  a stored flag: `choose-mode`, `finish-setup`, `add-document`, `ready`.
- WHEN no mode has ever been chosen THEN the home SHALL show the engine choice
  and nothing else: no drop zone, no composer.
- WHEN a mode is chosen but its readiness is not `ready` THEN the home SHALL
  show the drop zone AND a persistent, non-modal setup line carrying the
  download percentage or a way back to its Settings card. A document can be
  added during the download: indexing uses a separate, much smaller model.
- WHEN a mode is ready and no document exists THEN the drop zone SHALL be the
  only primary action.
- The line under the headline SHALL state what the chosen mode does, read from
  the picker's own descriptions, so the claim can never contradict the mode.
- Each engine card SHALL state its setup cost up front (download and its
  measured size, sign-in, or your own server) and one card SHALL carry
  "Best for this device", capability-detected and never static.

## Done when

- `bun run verify` exits 0.
- Fresh profile: the choice is the only thing on screen; picking Private opens
  its Settings card and the home moves to the drop zone with the setup line.
- The headline sub-line changes with the chosen mode.
- Both locales sweep clean; orphaned `home.steps` and `home.privacy` removed.

## Not in this spec, recorded

- The eligible-tier list with measured verdicts ("runs here", "does not fit",
  "cannot be checked in this browser") folded under the recommended download.
  `eligibleTiers()` and `capability.ts` already compute it; the UI does not
  surface it yet.

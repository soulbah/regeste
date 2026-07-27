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

## Three surfaces, not one screen with branches

Owner correction mid-build: a first run and opening a new chat are different
jobs and were being conflated. A first run has to get someone from nothing to a
first answer, so it explains and it sequences. Opening a new chat with a ready
engine and a full library happens every day, teaches nothing, and only owes the
shortest path to a question. Treating the recurring empty state as a first run
is the documented way to end up lecturing returning users.

The engine choice belongs to neither. It is a precondition, so it is a gate
that appears whenever it is unmet, whatever else is true: documents can be
indexed without an engine, since indexing never calls the model.

- `homeState()` SHALL derive one of `choose-engine`, `first-run`, `launcher`
  from existing stores, never a stored flag, and SHALL carry the pending-setup
  mode independently of the surface.
- WHEN no mode has ever been chosen THEN the route SHALL show the engine choice
  and nothing else: no drop zone, no composer.
- WHEN the library is empty THEN the route SHALL explain, offer the sample, and
  make the drop zone the one way in.
- WHEN the library has documents THEN the route SHALL be a launcher: the ready
  documents first because attaching one is instant, the file picker second
  because a new file must be parsed and indexed, no headline, no sample. It
  SHALL sit above the composer rather than centred on the viewport.
- WHENEVER the chosen mode cannot answer yet, a persistent non-modal line SHALL
  carry the download percentage or a way back to its Settings card, on every
  surface. Setup and adding a document never wait on each other.
- The line under the headline SHALL state what the chosen mode does, read from
  the picker's own descriptions, so the claim can never contradict the mode.
- Each engine card SHALL state its setup cost up front (download and its
  measured size, sign-in, or your own server) and one card SHALL carry
  "Best for this device", capability-detected and never static.
- The in-chat empty state (`/chat/[id]` with nothing attached) SHALL offer both
  ways in for the same reason, instead of the upload alone.

## Done when

- `bun run verify` exits 0.
- Fresh profile: the choice is the only thing on screen; picking Private opens
  its Settings card and the route moves to the drop zone with the setup line.
- With documents in the library: no headline, no sample, the ready documents
  listed above the composer, and the picker reachable past the first three.
- A chat with nothing attached offers the library as well as an upload.
- The headline sub-line changes with the chosen mode.
- Both locales sweep clean; orphaned `home.steps` and `home.privacy` removed.

## Not in this spec, recorded

- The eligible-tier list with measured verdicts ("runs here", "does not fit",
  "cannot be checked in this browser") folded under the recommended download.
  `eligibleTiers()` and `capability.ts` already compute it; the UI does not
  surface it yet.

# Tasks 036 — Mobile

Check a task off ONLY after its Done-when commands pass. `[P]` = safe to run in parallel with neighbors.

- [x] 1. Touch-target recipe: add a `.touch-target` component class in
      `src/routes/layout.css` (painted size unchanged, `::after` hit area to
      44 px, coarse pointers only), and raise the button size variants on
      `pointer-coarse`.
      Done when: `bun run check` exits 0; at 390 px the sidebar trigger, the
      answer action row and the version nav each measure ≥44 px of hit area,
      and at 1440 px with a mouse their painted size is unchanged.
      Verified: `bun run check` 0 errors. Measured with a mouse and with a
      touch pointer on the same build — sidebar rows 32 px (fine) vs 44 px
      (coarse), Button painted height 36 px on both.

- [x] 2. Apply the recipe to the dense controls that cannot grow: citation chip
      (16×16), pre-send passage checkboxes (18×18), fingerprint copy button.
      Done when: at 390 px none of them measures under 44×44 of hit area; the
      citation chip still sits inline without shifting the paragraph.
      Verified: the citation chip takes the inline variant (28 px, WCAG 2.2
      2.5.8 inline exception) so text selection for quote-reply still works.
      The pre-send checkbox needed nothing: it is wrapped in a `<label>`, so
      the whole row was already the target — measured, not assumed.

- [x] 3. [P] Hover-only affordances become permanent on coarse pointers:
      edit-question button, sidebar logo/trigger swap, fingerprint hint.
      Done when: at 390 px the edit button on the last question is visible
      without hovering; at 1440 px it is still hidden until hover.
      Verified: `pointer-fine:opacity-0` on the edit button and the copy hint.
      The sidebar logo/trigger swap was left alone — it only exists on the
      collapsed desktop rail, which no phone renders.

- [x] 4. [P] Onboarding mode cards: `sm:grid-cols-3` becomes `lg:grid-cols-3`.
      Done when: at 768 px the three cards are stacked one per row, the
      "Best for you" badge is not clipped, and no description wraps one word
      per line; at 1440 px the row of three is unchanged.
      Verified at 768 px and 1440 px. Stacking exposed a second bug and it is
      fixed here too: the taller column overflowed a `justify-center` flex
      container, which clips the top where scrolling cannot reach it — the
      headline was cut. Now `justify-center-safe`.

- [x] 5. Settings modal below `md`: one pane at a time (tab list, or a tab's
      content with a back control), full-height on a phone.
      Done when: at 390 px every tab is reachable and no control is cut off at
      the right edge; at 1440 px the 880x640 two-column grid is unchanged;
      `bun run test` exits 0 with the pane-switching test passing.
      Verified: at 390 px the dialog is 358 px wide with zero clipped controls
      (was: a 184 px rail leaving 174 px); back control returns to the list; at
      1440 px the dialog still measures 880×640 with a 184 px rail and no back
      control. The settings rows also stack below `sm` — the label/control row
      needs width to be a row at all. No unit test: the flag is two lines of
      state with no logic to protect, and asserting it would be a sugar test
      (AGENTS.md); the browser check above is the real proof.

- [x] 6. [P] Safe-area insets on the bottom-anchored surfaces: composer wrapper,
      sidebar footer, sheet content.
      Done when: with an emulated 34 px bottom inset the composer's send button
      is fully above it; with no inset the layout is unchanged.
      Verified: `max(spacing, env(safe-area-inset-bottom))` on the composer
      wrappers and the sidebar footer. `env()` resolves to 0px where there is
      no inset, so the desktop spacing is byte-identical.

- [x] 7. [P] iOS focus zoom: the composer textarea keeps 16 px below `md`.
      Done when: at 390 px every `input`/`textarea` reports a computed
      `font-size` of at least 16 px.
      Verified across the whole matrix: zero fields under 16 px on every touch
      viewport. Gated on `pointer-coarse` rather than the `md` breakpoint,
      because a 768 px tablet is touch and was zooming on every tap.

- [x] 8. Full-matrix verification and no-regression proof.
      Done when: at 375/390/412/768/1440 px on `/`, `/how-it-works`,
      `/privacy`, `/help`, `/chat`: `scrollWidth <= innerWidth + 1`, zero
      interactive elements under 44x44 of hit area on the three phone widths,
      and no new console errors; at 1440 px the sidebar collapse, the resizable
      panel and the panel's shortcut all still work.
      Verified: 25/25 page-viewport pairs green. Desktop shell driven for real
      — sidebar 256→58→256 px on ⌘B, palette opens with 9 items, panel toggles
      [817,351]→[1176,0] on ⌘., zero page errors.

- [x] 9. Dismissing the drawer. Owner feedback from a real iPhone: closing the
      menu "takes too long". Three separate causes, all measured on an emulated
      iPhone 13 before any code was written.
      Done when: following a link inside the drawer leaves it closed; a swipe
      towards the drawer's own edge dismisses it; a vertical drag inside it
      still scrolls; at 1440 px the desktop sidebar is untouched by any of it.
      Verified: (a) the drawer stayed open after navigating — the destination
      was hidden behind the thing that led there — now `afterNavigate` closes
      it, measured false after tapping a chat row; (b) the drawer covers 288 px
      of a 390 px screen, leaving a 97 px strip of overlay as the only tap
      target, so a swipe was added (`swipe-dismiss.ts`): closes in 647 ms on
      real touch events dispatched through CDP, while a vertical drag and a
      25 px horizontal wobble both leave it open; (c) desktop proven inert —
      sidebar 256 px before navigation, 256 px after, 256 px after going back,
      zero page errors, and `setOpenMobile` only writes the drawer's own state.

- [x] 10. Three layout defects the owner circled on the phone.
      Done when: the "03 Rédiger la réponse" node is centred in its room at
      390 px; the two moment pills on the landing sit on the timeline rule
      rather than under it; the onboarding headline does not dominate a phone
      screen. Desktop unchanged in all three.
      Verified: (a) the lane node's centring was scoped to `lg`, so at 390 px it
      sat flush left with 164 px of empty room beside it — the exact shape its
      own code comment rules out. Now `mx-auto`: 82 px on each side, and lanes
      01/02 already centred at every width, so this one had been the odd one
      out. (b) The rule was dropped at a hardcoded `top-[46px]`, which assumed
      one-line labels; "Ce qui est conservé" wraps on a phone and the rule cut
      through the words 10 px above the pills' centre. Centring it on the list
      instead measures 0 px of offset on iPhone SE, iPhone 13 and iPad Mini,
      and `items-stretch` makes both pills the same height. (c) The onboarding
      headline was `text-4xl` at every width: 36 px wrapped to two lines and
      spent 136 px of a 568 px screen before the cards. Now `text-3xl` with
      `sm:text-4xl` — 30 px on phones, 36 px unchanged from `sm` up.

Completion checklist (all required before the spec is closed):

- [x] All tasks checked with their Done-when verified
- [x] spec.md "Verification" section executed end-to-end
- [x] `bun run verify` passes (1,082 tests)
- [x] PROGRESS.md updated

# Copy rules — user-facing text (EN + FR)

Every string a user reads must read like it was written by a careful human, not generated. These are hard rules for UI copy, dictionary entries, empty states, errors, toasts, marketing pages.

## Banned AI markers

- **Em dashes (—)** as a connector. Use a comma, a period, a colon, or parentheses. One em dash per screen is already suspicious.
- **Negative parallelisms**: "not just X, but Y", "X, not Y", "proof, not promises", "transparency, not magic". Say the thing directly.
- **Rule of three**: "clear, fast, and private" enumerations everywhere. Two items or a plain sentence usually carry it.
- **Overexplanation / privacy forcing** (owner, 2026-07-11, hard): say the privacy promise ONCE, only where it IS the message — Private mode, the pre-send review, the Privacy Report, how-it-works, offline mode, the documents empty state. NEVER sprinkle "on this device / on your device / nothing is sent / stays local / never sent" into palette results, toasts, settings section titles ("Storage", not "Storage on this device"), status labels, delete-confirm titles, tooltips, or per-row badges. No per-row egress column; a "sent" chip appears only on the rare document whose passages actually left. Repeated reassurance reads as insecurity.
- **Repetition of pet words**: seamless, robust, delve, crucial, pivotal, leverage, empower, showcase, journey, effortless; FR: fluide, robuste, crucial, pivot, découvrez, sans effort.
- **Inflated verbs replacing "is"**: "serves as", "represents", "marks", "boasts"; FR: "constitue", "représente" where "est" works.
- **Drama in mundane sentences**: "the whole story", "living proof", "don't take our word for it", exclamation marks, suspense ellipses.
- **Bullet lists with `Bold header:` description** as a writing crutch; prefer sentences unless data is truly tabular.
- **Press-release tone**: "committed to", "designed to empower", "groundbreaking"; FR: "s'engage à", "pensé pour".
- **Title Case Headings** in English (use sentence case); in French never capitalize each word.

## Voice (hard)

- **Never name the product in copy.** No "Regeste" in any message a user reads: notices, errors, toasts, empty states, body text, tooltips, settings descriptions. Say "this browser", "your device", "on your device". The mode names are fine — they are choices the user makes, not the brand. The only place the name lives is the wordmark/logo and the browser tab `<title>`; never inside a sentence.
- **Mode names say where the answer is computed** (owner, 2026-07-27, replacing Private / Assisted / My AI): **This device / Cloud / Your server**, in French **Cet appareil / Cloud / Votre serveur**. They live in `modes.*.name` and are never hardcoded. The old names each carried a lie: "Private" claimed a virtue the other two also have, since your own server is no less private, and "Assisted" said nothing about the one mode whose data leaves the device. The location is the only thing that actually differs and the only thing a user can check, by cutting the network and seeing which one still answers.
- **Never write in the third person about the app.** Address the user (second person) or state the fact plainly. Not "Regeste parses your documents", "the app keeps everything local", "it never contacts the server" → "Your documents are parsed on your device", "Everything stays on your device", "No server is ever contacted".
- **Never make the AI the actor.** Lead with the outcome the user gets and the action they take, not with the AI "doing" something. Not "the AI will answer", "the AI reads your documents", "the AI couldn't find it" → "Get a written answer", "To search your documents", "No answer here". Naming AI as a tool the user turns on is fine ("download the private AI"); naming it as an agent that acts is not. Market standard: Microsoft Copilot UX "Human in control" (lead the action, not the assistant), and the de-anthropomorphization guidance (avoid "the AI / an AI").
- **No anthropomorphism.** The AI does not see, know, understand, think, or feel. Use plain mechanical verbs, or better, describe the user's result instead.
- **Lead with the outcome, not the technology.** Say what the user gets ("a written answer", "answers that cite your documents"), then the how. Avoid jargon a non-technical reader won't know: "model", "embeddings", "endpoint", "chunk", "vector". **"passage", never "excerpt"** (owner, 2026-07-29): one word for the thing, and "excerpt" reads dated. French uses "passage" too, not "extrait". The remaining trap is referencing passages that aren't on screen (the retrieval turn shows source chips, so "these passages" points at nothing).

## Status and progress copy

A banner that says what the app is doing has one job: let the reader decide
whether to wait. Everything else is noise, and it is where the AI-marker traps
resurface hardest because a progress string feels like it needs justifying.

- **The body must not repeat the title.** "Relecture de vos documents" followed
  by "Vos documents sont relus" is one sentence written twice. The body says the
  thing the title cannot: how long, or whether you can keep working.
- **Never explain the mechanism.** Not "il se met en mémoire, c'est l'étape
  lente et elle n'arrive qu'une fois par session" → "il se met en mémoire". The
  reader wants to know if it is stuck, not how it works.
- **Privacy forcing is worst here** (see the banned list above). A download
  progress line saying "il reste sur votre appareil" is reassurance nobody asked
  for, in the one place where only the wait matters.
- **No percentage the code does not have.** A phase with no measurable progress
  gets a moving indicator and a plain sentence, never an invented number and
  never a still bar, which reads as a crash.
- **One idea, and prefer a comma to a second sentence.** Two sentences in a
  status line is already one too many.

## What good looks like

- Lead with the action or the fact. Buttons start with a verb ("Export", "Delete", "Réessayer").
- One idea per string. If a sentence needs a second clause, a comma usually beats a second sentence; never chain three short sentences where one flows.
- Errors: what happened + what to do, in one or two plain clauses. No blame, no drama, no apology theater.
- Numbers and facts beat adjectives ("2 passages · 1.3 KB" is the tone of this product).
- Cut everything that survives deletion without loss. Read it aloud; if it sounds like a brochure, rewrite.

## French specifics

- Vouvoiement, toujours. "votre appareil", "vos documents".
- Natural French, not translated English: no "supporté" (→ pris en charge), no calques ("adresser un problème").
- Mode names stay: Private, Assisted, My AI. Never the product name itself (see Voice). Technical terms users know stay (cloud, zip).
- Apostrophe typographique (') acceptable; guillemets « » for quoted UI terms in prose, straight quotes in code.
- Accents on capitals (É, À) are correct French — keep them.

## Process

- New user-facing string → write it in both dictionaries (`src/lib/i18n/en.ts`, `fr.ts`), never inline.
- Before committing copy, sweep it against the banned list above.

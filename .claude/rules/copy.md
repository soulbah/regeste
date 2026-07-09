# Copy rules — user-facing text (EN + FR)

Every string a user reads must read like it was written by a careful human, not generated. These are hard rules for UI copy, dictionary entries, empty states, errors, toasts, marketing pages.

## Banned AI markers

- **Em dashes (—)** as a connector. Use a comma, a period, a colon, or parentheses. One em dash per screen is already suspicious.
- **Negative parallelisms**: "not just X, but Y", "X, not Y", "proof, not promises", "transparency, not magic". Say the thing directly.
- **Rule of three**: "clear, fast, and private" enumerations everywhere. Two items or a plain sentence usually carry it.
- **Overexplanation**: don't restate the privacy promise in every sentence. Say it once, where it matters; trust the reader's memory.
- **Repetition of pet words**: seamless, robust, delve, crucial, pivotal, leverage, empower, showcase, journey, effortless; FR: fluide, robuste, crucial, pivot, découvrez, sans effort.
- **Inflated verbs replacing "is"**: "serves as", "represents", "marks", "boasts"; FR: "constitue", "représente" where "est" works.
- **Drama in mundane sentences**: "the whole story", "living proof", "don't take our word for it", exclamation marks, suspense ellipses.
- **Bullet lists with `Bold header:` description** as a writing crutch; prefer sentences unless data is truly tabular.
- **Press-release tone**: "committed to", "designed to empower", "groundbreaking"; FR: "s'engage à", "pensé pour".
- **Title Case Headings** in English (use sentence case); in French never capitalize each word.

## What good looks like

- Lead with the action or the fact. Buttons start with a verb ("Export", "Delete", "Réessayer").
- One idea per string. If a sentence needs a second clause, a comma usually beats a second sentence; never chain three short sentences where one flows.
- Errors: what happened + what to do, in one or two plain clauses. No blame, no drama, no apology theater.
- Numbers and facts beat adjectives ("2 excerpts · 1.3 KB" is the tone of this product).
- Cut everything that survives deletion without loss. Read it aloud; if it sounds like a brochure, rewrite.

## French specifics

- Vouvoiement, toujours. "votre appareil", "vos documents".
- Natural French, not translated English: no "supporté" (→ pris en charge), no calques ("adresser un problème").
- Product names stay: Private, Assisted, My AI, Folio. Technical terms users know stay (cloud, zip).
- Apostrophe typographique (') acceptable; guillemets « » for quoted UI terms in prose, straight quotes in code.
- Accents on capitals (É, À) are correct French — keep them.

## Process

- New user-facing string → write it in both dictionaries (`src/lib/i18n/en.ts`, `fr.ts`), never inline.
- Before committing copy, sweep it against the banned list above.

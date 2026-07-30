// The two outward addresses, in one place, because they appear on several
// surfaces and a stale one is invisible until someone tries it.

/** The address these pages are indexed under.
 *
 * Declared rather than read from the request, because it has to be right in a
 * build: prerendering renders under the placeholder origin
 * http://sveltekit-prerender, and a canonical or an hreflang built from that
 * points every crawler at a host nobody can reach. */
export const CANONICAL_ORIGIN = 'https://regeste.com';

export const GITHUB = 'https://github.com/soulbah/regeste';

/** What AGPL-3.0 lets a reader do, in plain language.
 *
 * The licence text itself is the legal object, not an explanation: someone who
 * clicks a licence name in a footer wants to know what they may do with the
 * code, and four screens of clauses is not that answer. This page is a table of
 * permissions, conditions and limits, which is. */
export const LICENSE_DOC = 'https://choosealicense.com/licenses/agpl-3.0/';

/** The one human channel. No contact page and no form: every open-source tool
 * surveyed (Obsidian, Jan, AnythingLLM) ships neither, routing to a community
 * and to GitHub instead, and the one that does have a contact page — Cryptomator
 * — uses it to push people to the forum first. We have no forum, so an address
 * in the footer is the whole answer, and a form would mean a backend collecting
 * what this product exists not to collect. */
export const CONTACT_EMAIL = 'contact@regeste.com';

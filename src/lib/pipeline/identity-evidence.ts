export type PartyRole = 'buyer' | 'seller';

export const PARTY_ROLE_ALIASES: Record<PartyRole, readonly string[]> = {
	buyer: ['acheteur', 'acquereur', 'buyer', 'purchaser'],
	seller: ['vendeur', 'vendeurs', 'cedant', 'cedants', 'seller', 'sellers', 'vendor']
};

function normalized(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLocaleLowerCase()
		.replace(/[’']/g, ' ')
		.replace(/\s+/g, ' ');
}

export function isIdentityQuestion(question: string): boolean {
	const query = normalized(question).trim();
	return (
		/^(?:qui est|qui sont|who is|who are|identifie|identifier|nomme|nommer|identify|name)\b/.test(
			query
		) ||
		/^(?:quel(?:le)?|which)\s+(?:souscripteur|assure|assuree|cohabitant|compagnon|compagne|subscriber|insured|companion)\b/.test(
			query
		) ||
		/^(?:donne|donner|give)\b.*\b(?:nom|name)\b/.test(query)
	);
}

export function requestedPartyRoles(question: string): PartyRole[] {
	const query = normalized(question);
	return (Object.entries(PARTY_ROLE_ALIASES) as Array<[PartyRole, readonly string[]]>)
		.filter(([, aliases]) => aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(query)))
		.map(([role]) => role);
}

const PERSON_TITLE = String.raw`(?:monsieur|madame|mademoiselle|mr|mrs|ms|mme|mlle)`;
const PERSON_NAME = String.raw`[a-z]{2,}(?:[ -]+[a-z]{2,})+`;
// A role is bound to its named party only through punctuation, a copula, or a
// deed designation — never through an arbitrary verb phrase. This keeps
// "le vendeur est Monsieur X" / "le vendeur, X," while rejecting
// "le vendeur s'engage à payer Monsieur X, huissier" (X is not the seller).
const ROLE_NAME_LINK = String.raw`(?:\s*[,:;—-]\s*|\s+(?:est|sont|is|are|denomme\w*|designe\w*|appele\w*|nomme\w*)\s+)`;
const DESIGNATION = String.raw`ci-?apres\s+(?:denomme|designe|appele|nomme)\w*\s+(?:l[ae]?\s+)?`;

/** A role occurrence is not an identity answer. Require a named party bound to
 * the role: role→name (apposition/copula/designation) or the French deed
 * name-before-role form ("Monsieur X … ci-après dénommé le vendeur"). */
export function hasNamedPartyRoleEvidence(text: string, role: PartyRole): boolean {
	const candidate = normalized(text);
	const alias = `(?:${PARTY_ROLE_ALIASES[role].join('|')})`;
	// role [article] title name  (title immediately after the role: "Vendeurs
	// Monsieur X"). Adjacency keeps out a person named after a verb phrase.
	if (
		new RegExp(`\\b${alias}\\b\\s+(?:l[ae]?\\s+)?${PERSON_TITLE}\\s+${PERSON_NAME}`, 'u').test(
			candidate
		)
	)
		return true;
	// role → [title] name  (apposition, copula or designation)
	if (
		new RegExp(`\\b${alias}\\b${ROLE_NAME_LINK}(?:${PERSON_TITLE}\\s+)?${PERSON_NAME}`, 'u').test(
			candidate
		)
	)
		return true;
	// title name … ci-après dénommé … role  (name before role, deed form)
	if (
		new RegExp(
			`${PERSON_TITLE}\\s+${PERSON_NAME}[\\s\\S]{0,80}?${DESIGNATION}${alias}\\b`,
			'u'
		).test(candidate)
	)
		return true;
	// title name, [le] role  (named party immediately apposed to the role)
	if (
		new RegExp(`${PERSON_TITLE}\\s+${PERSON_NAME}\\s*,\\s*(?:l[ae]?\\s+)?${alias}\\b`, 'u').test(
			candidate
		)
	)
		return true;
	return false;
}

/** Multi-role questions may use several passages; each named role earns its
 * fraction of the passage-level reranking bonus. */
export function partyIdentityCoverage(question: string, text: string): number {
	if (!isIdentityQuestion(question)) return 0;
	const roles = requestedPartyRoles(question);
	if (!roles.length) return 0;
	return roles.filter((role) => hasNamedPartyRoleEvidence(text, role)).length / roles.length;
}

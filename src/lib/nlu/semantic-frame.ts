import type { QuestionRoute } from '$lib/types';
import { damerauLevenshtein, extractIdentifiers } from '$lib/pipeline/fuzzy';

export type AggregateOperation = 'sum' | 'average' | 'minimum' | 'maximum' | 'count' | 'list';
export type FinancialRole =
	'sent' | 'received' | 'fee' | 'debited' | 'total_ttc' | 'subtotal' | 'tax';
export type QueryScopeKind = 'collection' | 'record' | 'page' | 'temporal' | 'unspecified';
export type ClarificationKind =
	'scope' | 'financial_role' | 'intent' | 'time' | 'document' | 'unit_currency';

export interface TemporalScope {
	start: string | null;
	end: string | null;
	month: number | null;
	year: number | null;
}

export interface SemanticFrame {
	route: QuestionRoute;
	operation: AggregateOperation | null;
	moneyRole: FinancialRole | null;
	temporal: TemporalScope | null;
	identifiers: string[];
	scope: { kind: QueryScopeKind; explicit: boolean };
	locale: 'fr' | 'en';
	referencesPrevious: boolean;
	exhaustive: boolean;
	answerShape: 'fact' | 'explanation';
	confidence: 'high' | 'medium' | 'low';
	decisionScore: number;
	decisionMargin: number | null;
	source: 'rules' | 'fused';
	clarification: ClarificationKind | null;
	evidence: string[];
}

export type QuestionAnalysis = SemanticFrame;

const MONTHS: Record<string, number> = {
	janvier: 1,
	jan: 1,
	january: 1,
	february: 2,
	feb: 2,
	fevrier: 2,
	fevr: 2,
	mars: 3,
	march: 3,
	mar: 3,
	avril: 4,
	avr: 4,
	april: 4,
	apr: 4,
	mai: 5,
	may: 5,
	juin: 6,
	june: 6,
	juillet: 7,
	juil: 7,
	july: 7,
	aout: 8,
	august: 8,
	aug: 8,
	septembre: 9,
	sept: 9,
	september: 9,
	sep: 9,
	octobre: 10,
	oct: 10,
	october: 10,
	novembre: 11,
	nov: 11,
	november: 11,
	decembre: 12,
	dec: 12,
	december: 12
};

const OPERATION_CONCEPTS: Record<AggregateOperation, string[]> = {
	sum: ['somme', 'total', 'additionne', 'additionnez', 'additionner', 'sum', 'add up'],
	average: ['moyen', 'moyenne', 'average', 'mean'],
	minimum: ['minimum', 'minimale', 'plus petit', 'plus faible', 'lowest', 'smallest'],
	maximum: ['maximum', 'maximale', 'plus grand', 'plus eleve', 'highest', 'largest'],
	count: ['combien de', 'nombre de', 'how many', 'count'],
	list: [
		'recapitule',
		'resume',
		'liste',
		'lister',
		'detaille',
		'detaillez',
		'quels sont',
		'quelles sont',
		'list',
		'each',
		'what are',
		'what were'
	]
};

const ROLE_CONCEPTS: Record<FinancialRole, string[]> = {
	received: ['montant recu', 'recu', 'beneficiaire', 'received', 'beneficiary'],
	fee: ['frais', 'commission', 'fee', 'fees', 'charges'],
	debited: [
		'debite',
		'debitee',
		'preleve',
		'avec les frais',
		'total paye',
		'total charged',
		'debited',
		'including fees'
	],
	sent: ['envoye', 'envoyee', 'transfere', 'sent', 'send', 'transferred'],
	total_ttc: ['ttc', 'net a payer', 'amount due', 'total due', 'grand total'],
	subtotal: ['hors taxe', 'total ht', 'subtotal', 'before tax'],
	tax: ['tva', 'vat', 'taxe', 'tax']
};

// Evidence that a question measures money (matched on normalized text, so no
// accents). Deliberately excludes operation words ("total", "somme") and
// generic caps ("plafond", "limite"): those describe the asked shape, not the
// measured thing, and would drag duration/count fact questions into money math.
const MONEY_CONTEXT =
	/\b(?:montant|montants|prix|cout|couts|frais|commission|commissions|eur|euro|euros|usd|gbp|chf|gnf|dollar|dollars|amount|amounts|price|prices|cost|costs|fee|fees|paye|payes|payee|payees|paid|charge|charged|charges|facture|factures|invoice|invoices|transaction|transactions|transfert|transferts|transfer|transfers|franchise|franchises|prime|primes|premium|premiums|indemnite|indemnites|remboursement|remboursements|deductible|reimbursement)\b|[€$£]/u;

const SYNTHESIS_CONCEPTS = [
	'compare',
	'comparaison',
	'difference',
	'differences',
	'synthese',
	'en commun',
	'contradiction',
	'contradictions',
	'identique',
	'identiques',
	'cite separement',
	'portrait complet',
	'plusieurs sources',
	'comparison',
	'synthesize',
	'overall summary',
	'separate citations',
	'complete profile',
	'across sources',
	'que sait on',
	'toutes les informations',
	'what do we know'
];

const COLLECTION_CONCEPTS = [
	'tous',
	'toutes',
	'ensemble',
	'chaque',
	'documents',
	'factures',
	'transactions',
	'transferts',
	'jointes',
	'all',
	'across',
	'each',
	'every',
	'invoices',
	'transfers',
	'attached'
];

const FR_LANGUAGE = new Set(
	'que quel quelle quels quelles qui combien où dans pour avec les des du une tous toutes envoyé reçus frais somme moyenne facture factures mois juin mai et est sont'.split(
		' '
	)
);
const EN_LANGUAGE = new Set(
	'what which who how where in for with the a an all every sent received fees sum average invoice invoices month june may and is are'.split(
		' '
	)
);

const REFERENCE_CONCEPTS = new Set(
	'son sa ses leur leurs lui elle il eux elles ce cet cette ces celui celle ceux celles dernier derniere their his her hers its him them they he she this that former latter'.split(
		' '
	)
);

export function normalizeQuestion(text: string): string {
	return text
		.replace(/[œŒ]/g, 'oe')
		.replace(/[æÆ]/g, 'ae')
		.replace(/\u00ad/g, '')
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLocaleLowerCase()
		.replace(/[’']/g, ' ')
		.replace(/(?<=\p{L})-(?=\p{L})/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function words(text: string): string[] {
	return normalizeQuestion(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function phraseMatches(q: string, phrase: string, fuzzyLimit = 2): boolean {
	if (phrase.includes(' ')) return q.includes(phrase);
	return words(q).some((token) => {
		if (token === phrase) return true;
		if (
			phrase.length >= 4 &&
			token.startsWith(phrase) &&
			/^(?:e|es|s|ee|ees)$/.test(token.slice(phrase.length))
		)
			return true;
		const max = Math.min(fuzzyLimit, Math.floor(phrase.length / 5));
		// Short words are collision-prone across languages (`coût` -> `cout`
		// versus English `count`). A token *shorter* than a short concept is
		// likely a different, shorter word reached by deletion — reject it. A
		// *longer* token (`frais` -> `farais`) is a typo of the concept; keep it.
		if (phrase.length <= 5 && token.length < phrase.length) return false;
		// On a short concept the whole fuzzy budget is one edit, so a common word
		// one substitution away is indistinguishable from a typo. "comme" is one
		// edit from "somme", and "qui est le directeur et comme s'appelle le
		// cabinet ?" parsed as a request to add money up — the app answered a
		// question about names with "one record or all selected documents?".
		// Requiring the first letter to survive separates the two without a list
		// of forbidden words: typists transpose and drop letters inside a word far
		// more often than they miss its first one, so "sonme" and "sommme" still
		// reach "somme" while "comme" no longer does.
		if (phrase.length <= 5 && token[0] !== phrase[0]) return false;
		return max > 0 && token.length >= 4 && damerauLevenshtein(token, phrase, max) <= max;
	});
}

function matchingConcepts<T extends string>(
	q: string,
	concepts: Record<T, string[]>,
	fuzzyLimit = 2
): T[] {
	return (Object.entries(concepts) as Array<[T, string[]]>)
		.filter(([, aliases]) => aliases.some((alias) => phraseMatches(q, alias, fuzzyLimit)))
		.map(([label]) => label);
}

function isoDate(day: string, month: string, year: string): string | null {
	const d = Number(day);
	const m = Number(month);
	const y = Number(year);
	if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
	return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseNumericDate(value: string): string | null {
	const match = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(value);
	return match ? isoDate(match[1], match[2], match[3]) : null;
}

/** Parse bounded calendar scopes only. Relative dates would be wrong for old documents. */
export function parseTemporalScope(question: string): TemporalScope | null {
	const q = normalizeQuestion(question);
	const range =
		/(?:du|from)\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\s+(?:au|to)\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/.exec(
			q
		);
	if (range) {
		const start = parseNumericDate(range[1]);
		const end = parseNumericDate(range[2]);
		if (start && end) return { start, end, month: null, year: null };
	}
	const exact = parseNumericDate(q);
	if (exact) return { start: exact, end: exact, month: null, year: null };
	const monthMatches = Object.entries(MONTHS)
		.map(([name, month]) => {
			const match = new RegExp(`\\b${name}\\b(?:\\s+(\\d{4}))?`).exec(q);
			return match ? { index: match.index, month, year: match[1] ? Number(match[1]) : null } : null;
		})
		.filter(
			(match): match is { index: number; month: number; year: number | null } => match !== null
		)
		.sort((a, b) => a.index - b.index);
	if (monthMatches[0]) {
		return { start: null, end: null, month: monthMatches[0].month, year: monthMatches[0].year };
	}
	const year = /\b(20\d{2})\b/.exec(q);
	return year ? { start: null, end: null, month: null, year: Number(year[1]) } : null;
}

function detectLocale(question: string): 'fr' | 'en' {
	const tokens = words(question);
	let fr = 0;
	let en = 0;
	for (const token of tokens) {
		if (FR_LANGUAGE.has(token)) fr++;
		if (EN_LANGUAGE.has(token)) en++;
	}
	if (/[àâçéèêëîïôùûüÿœ]/iu.test(question)) fr += 2;
	return fr >= en ? 'fr' : 'en';
}

function referencesPrevious(question: string): boolean {
	// A self-contained multi-part question may use a possessive in its second
	// part ("who owns X and what is its number?"). Its explicit first part is the
	// antecedent; dialogue history must not replace it.
	if (hasCoordinatedFactQuestions(question)) return false;
	// French subject-verb inversion writes its clitic with a hyphen
	// ("AWP accuse-t-il…", "répond-il") — the pronoun is grammar, not an
	// anaphor, whatever the verb. The verb-list rewrite below only covers
	// auxiliaries/modals whose inversion survives normalization unhyphenated.
	const withoutHyphenInversions = question.replace(/-(?:t-)?(?:il|elle|ils|elles|on)\b/giu, ' ');
	const normalized = normalizeQuestion(withoutHyphenInversions);
	const withoutInversion = normalized.replace(
		/\b(?:est|sont|a|ont|avait|etaient|peut|peuvent|doit|doivent|sera|seront|fait|font)\s+(?:t\s+)?(?:il|elle|ils|elles)\b/gu,
		''
	);
	return (
		words(withoutInversion).some((token) => REFERENCE_CONCEPTS.has(token)) ||
		/^(?:et\b|and\b|qu en est il\b|what about\b)/u.test(normalized)
	);
}

function targetsSingleRecord(q: string, identifiers: string[]): boolean {
	const record = '(?:facture|transaction|transfert|operation|recu|invoice|transfer|receipt)';
	const tokens = words(q);
	const fuzzyRecord = [
		'facture',
		'transaction',
		'transfert',
		'invoice',
		'transfer',
		'receipt'
	].some((concept) => phraseMatches(q, concept));
	return (
		identifiers.length > 0 ||
		new RegExp(
			`\\b(?:ce|cet|cette|la|le|du|de la|pour la|pour le|sur la|sur le|the|this|that|of the|for the)\\s+${record}\\b`
		).test(q) ||
		new RegExp(`\\b${record}\\s+(?:n(?:o|umero)?\\s*)?[#a-z]*[-_/]?\\d[\\w./-]*\\b`).test(q) ||
		(fuzzyRecord && tokens.some((token) => ['ce', 'cet', 'cette', 'this', 'that'].includes(token)))
	);
}

/** Detect questions that explicitly request several independent facts.
 * This is structural on purpose: route breadth must not depend on a growing
 * list of document-domain words. */
export function hasCoordinatedFactQuestions(question: string): boolean {
	const q = normalizeQuestion(question);
	// Two explicit question boundaries in one message are already two requested
	// facts. This also gives a pronoun in the second sentence an in-turn
	// antecedent instead of borrowing an unrelated previous chat answer.
	const currentTurn = question.split(/\nPrevious question:/u, 1)[0];
	if ((currentTurn.match(/\?/gu)?.length ?? 0) >= 2) return true;
	const hasCoordinator = /(?:,|;|\b(?:et|and)\b)/u.test(q);
	if (!hasCoordinator) return false;
	const interrogatives =
		q.match(
			/\b(?:qui|quel|quelle|quels|quelles|ou|quand|combien|comment|who|what|which|where|when|how)\b/gu
		) ?? [];
	if (interrogatives.length >= 2) return true;
	const coordinatedSegments = q
		.split(/\s*(?:,|;|\b(?:et|and)\b)\s*/u)
		.filter((segment) => words(segment).length >= 1);
	return coordinatedSegments.length >= 3;
}

export function analyzeQuestion(question: string): SemanticFrame {
	const q = normalizeQuestion(question);
	const temporal = parseTemporalScope(q);
	const identifiers = extractIdentifiers(question).filter(
		(value) => !/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(value)
	);
	const page = /\bpage\s+\d+\b/.test(q);
	const answerShape: SemanticFrame['answerShape'] =
		/^(?:qui|quel|quelle|quels|quelles|combien|ou|quand|who|what|which|how many|how much|where|when)\b/.test(
			q
		) || /\b(?:numero|number|date|montant|amount|destinataire|recipient)\b/.test(q)
			? 'fact'
			: 'explanation';
	let operations = matchingConcepts(q, OPERATION_CONCEPTS);
	// “How long” asks for a duration value. Treating it as “how many” routes a
	// single fact to arithmetic aggregation and loses the answer-bearing page.
	if (/\b(?:combien de temps|how long)\b/u.test(q)) {
		operations = operations.filter((operation) => operation !== 'count');
	}
	let roles = matchingConcepts(q, ROLE_CONCEPTS, 1);
	// "transfer(s)" names a record, not the direction of money. Its one-edit
	// proximity to French "transféré" must not create a sent-role conflict.
	if (
		roles.includes('sent') &&
		/\b(?:transfer|transfers|transfert|transferts)\b/.test(q) &&
		!/(?:\benvoye(?:e|es|s)?\b|\bsend\b|\bsent\b|\btransfere(?:e|es|s)?\b)/.test(q)
	) {
		roles = roles.filter((role) => role !== 'sent');
	}
	const coordinatedFacts = hasCoordinatedFactQuestions(question);
	const synthesis =
		coordinatedFacts || SYNTHESIS_CONCEPTS.some((concept) => phraseMatches(q, concept));
	const collection = COLLECTION_CONCEPTS.some((concept) => phraseMatches(q, concept));
	const operationPriority: AggregateOperation[] = [
		'average',
		'minimum',
		'maximum',
		'count',
		'list',
		'sum'
	];
	let operation = operationPriority.find((candidate) => operations.includes(candidate)) ?? null;
	// Plural interrogatives express an answer shape, independently of the
	// document domain: "Quels droits…", "Quelles garanties…", "Qui sont les…".
	// Keep this structural instead of growing a vocabulary of listable nouns.
	if (!operation && /^(?:quels|quelles|qui sont les|who are the)\b/u.test(q)) operation = 'list';
	// The imperative "Cite/Citez les X" is an exhaustive-list request; the noun
	// "cité" (city) is not — it is preceded by a determiner ("la cité …").
	if (
		!operation &&
		(/\bcitez\b/u.test(q) ||
			(/\bcite\b/u.test(q) &&
				!/\b(?:la|une|cette|leur|votre|notre|sa|ma|ta|des|de la) cite\b/u.test(q)))
	)
		operation = 'list';
	const moneyRole = roles.length === 1 ? roles[0] : null;
	// Quantity questions over one recognized measure are sums, not counts.
	if (!operation && moneyRole && /\b(?:combien|how much)\b/.test(q)) operation = 'sum';
	const singleRecord = targetsSingleRecord(q, identifiers);
	const scopeKind: QueryScopeKind = page
		? 'page'
		: singleRecord
			? 'record'
			: collection
				? 'collection'
				: temporal
					? 'temporal'
					: 'unspecified';
	// Min/max/count/average enter the money-aggregation pipeline only when the
	// question actually measures money. "Quelle est sa durée maximale ?" or a
	// limit "en nombre de nuits" are fact lookups: routing them to financial
	// aggregation answers with an unrelated money total.
	const monetary = moneyRole !== null || MONEY_CONTEXT.test(q);
	const financiallyAggregate =
		((operation === 'average' ||
			operation === 'minimum' ||
			operation === 'maximum' ||
			operation === 'count') &&
			monetary) ||
		(operation === 'list' && moneyRole !== null) ||
		(operation === 'sum' && moneyRole !== null && !singleRecord && !page);
	// A list over the whole document is exhaustive only when it isn't already
	// scoped to one record or page ("résumé de la facture F-102" stays targeted).
	const exhaustiveDocumentList =
		operation === 'list' && moneyRole === null && !singleRecord && !page;
	const route: QuestionRoute =
		synthesis || exhaustiveDocumentList
			? 'synthesis'
			: operation && !singleRecord && !page && (collection || !!temporal || financiallyAggregate)
				? 'aggregate'
				: 'targeted';
	const clarification: ClarificationKind | null =
		roles.length > 1 && !synthesis
			? 'financial_role'
			: operation === 'sum' && moneyRole === null && !singleRecord && !page
				? scopeKind === 'unspecified'
					? 'scope'
					: 'financial_role'
				: null;
	const evidence = [
		...(synthesis ? ['route:synthesis'] : []),
		...(coordinatedFacts ? ['structure:coordinated-facts'] : []),
		...operations.map((value) => `operation:${value}`),
		...roles.map((value) => `role:${value}`),
		...(scopeKind !== 'unspecified' ? [`scope:${scopeKind}`] : []),
		...identifiers.map((value) => `identifier:${value}`)
	];
	const decisionScore = Math.min(
		1,
		(synthesis ? 0.9 : 0) +
			(operation ? 0.32 : 0) +
			(moneyRole ? 0.32 : 0) +
			(scopeKind !== 'unspecified' ? 0.24 : 0) +
			(identifiers.length ? 0.2 : 0)
	);
	const confidence: SemanticFrame['confidence'] = clarification
		? 'low'
		: decisionScore >= 0.75
			? 'high'
			: decisionScore >= 0.4
				? 'medium'
				: 'low';
	return {
		route,
		operation,
		moneyRole,
		temporal,
		identifiers,
		scope: { kind: scopeKind, explicit: scopeKind !== 'unspecified' },
		locale: detectLocale(question),
		referencesPrevious: referencesPrevious(question),
		exhaustive: collection || !!temporal || financiallyAggregate || exhaustiveDocumentList,
		answerShape,
		confidence,
		decisionScore,
		decisionMargin: null,
		source: 'rules',
		clarification,
		evidence
	};
}

export function routeQuestion(question: string): QuestionRoute {
	return analyzeQuestion(question).route;
}

export function questionLocale(question: string): 'fr' | 'en' {
	return analyzeQuestion(question).locale;
}

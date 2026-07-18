import { questionLocale } from '$lib/nlu/semantic-frame';
import {
	normalizeForFuzzy,
	significantQueryTokens,
	stemmedQueryCoverage
} from '$lib/pipeline/fuzzy';
import { hasAnswerBearingEvidence, isWeakMatch } from '$lib/pipeline/relevance';
import { splitQueryClauses } from '$lib/pipeline/retrieval';
import type { SearchHit } from '$lib/types';

export type QueryTranslator = (
	messages: Array<{ role: 'system' | 'user'; content: string }>
) => Promise<string>;

const TRANSLATION_PREFIX = /^(?:english(?: translation)?|translation|query)\s*:\s*/iu;
const RETRIEVAL_PREFIX = /^(?:query|search|rewrite|alternative|english(?: translation)?)\s*:\s*/iu;

// A candidate that is the model answering or refusing instead of writing a
// search query. Match explicit refusal phrases and a leading "Réponse:/Answer:"
// label only — not the bare words "réponse"/"answer", which are ordinary
// insurance search vocabulary ("délai de réponse de l'assureur").
const NON_QUERY_CANDIDATE = /\b(?:je ne peux|i cannot)\b|^\s*(?:réponse|answer)\s*[:.]/iu;

const NON_CONCEPT_CLAUSE_TERMS = new Set([
	'combien',
	'comment',
	'jusqu',
	'limite',
	'maximum',
	'montant',
	'pendant',
	'quelle',
	'temps',
	'when',
	'which',
	'vous'
]);

const NEGATION = /\b(?:aucun|aucune|jamais|non|not|no|pas|sans|without)\b|\bn['’]\b/iu;
const CONSTRAINT_GROUPS: RegExp[][] = [
	[/\b(?:avant|before)\b/iu],
	[/\b(?:apr[eè]s|after)\b/iu],
	[/\b(?:plus de|more than|over)\b/iu],
	[/\b(?:moins de|less than|under)\b/iu],
	[/\b(?:au moins|at least)\b/iu],
	[/\b(?:au plus|at most)\b/iu],
	[/\b(?:exact|exacte|exactly)\b/iu],
	[/\b(?:chaque|each|per)\b/iu]
];

/** Model-written search views may add vocabulary, never weaken user scope. */
export function preservesQueryConstraints(original: string, candidate: string): boolean {
	const normalizedCandidate = normalizeForFuzzy(candidate);
	const originalNumbers = normalizeForFuzzy(original).match(/\b\d+(?:[.,]\d+)?\b/gu) ?? [];
	if (
		originalNumbers.some(
			(number) =>
				!normalizedCandidate.includes(normalizeForFuzzy(number).replace(',', '.')) &&
				!normalizedCandidate.includes(normalizeForFuzzy(number))
		)
	)
		return false;
	if (NEGATION.test(original) && !NEGATION.test(candidate)) return false;
	for (const alternatives of CONSTRAINT_GROUPS) {
		if (
			alternatives.some((pattern) => pattern.test(original)) &&
			!alternatives.some((pattern) => pattern.test(candidate))
		)
			return false;
	}
	return true;
}

/** Multi-part questions need direct evidence for every substantive clause
 * before skipping the local rewrite. Time/amount slots are excluded: their
 * document wording is commonly a value rather than the user's interrogative. */
export function hasClauseLevelLexicalEvidence(query: string, hits: SearchHit[]): boolean {
	const clauses = splitQueryClauses(query);
	if (clauses.length <= 1) return true;
	return clauses.every((clause) => {
		const concepts = significantQueryTokens(clause, 4).filter(
			(term) => !NON_CONCEPT_CLAUSE_TERMS.has(term)
		);
		if (!concepts.length) return true;
		return hits.some((hit) => {
			const available = new Set(
				normalizeForFuzzy(`${hit.documentName}\n${hit.headingPath ?? ''}\n${hit.text}`).split(' ')
			);
			const matched = concepts.filter((term) =>
				[...available].some(
					(candidate) =>
						candidate === term ||
						(term.length >= 7 &&
							candidate.length >= 7 &&
							candidate.slice(0, 6) === term.slice(0, 6))
				)
			).length;
			return matched >= Math.ceil(concepts.length / 2);
		});
	});
}

/** A topically plausible passage is insufficient when it drops the user's
 * concrete scenario terms. Trigger query expansion before a generic exclusion
 * or definition can suppress the exact fact. */
export function hasDistinctiveLexicalEvidence(query: string, hits: SearchHit[]): boolean {
	if (significantQueryTokens(query, 4).length < 3) return true;
	return (
		stemmedQueryCoverage(
			query,
			hits.map((hit) => `${hit.headingPath ?? ''}\n${hit.text}`).join('\n')
		) >= 0.85
	);
}

export function cleanTranslatedQuery(raw: string, original: string): string | null {
	const candidate = raw
		.replace(/<think>[\s\S]*?<\/think>/giu, '')
		.trim()
		.split(/\r?\n/, 1)[0]
		.replace(TRANSLATION_PREFIX, '')
		.replace(/^["“”']|["“”']$/gu, '')
		.trim();
	if (!candidate || candidate.length > 400 || candidate === original.trim()) return null;
	if (NON_QUERY_CANDIDATE.test(candidate)) return null;
	return candidate;
}

export function cleanRetrievalQueryVariants(raw: string, original: string): string[] {
	const normalizedOriginal = original.trim().toLocaleLowerCase();
	return [
		...new Set(
			raw
				.replace(/<think>[\s\S]*?<\/think>/giu, '')
				.split(/\r?\n/)
				.map((line) =>
					line
						.replace(/^\s*(?:[-*]|\d+[.)])\s*/u, '')
						.replace(RETRIEVAL_PREFIX, '')
						.trim()
				)
				.filter(
					(candidate) =>
						candidate.length >= 3 &&
						candidate.length <= 400 &&
						candidate.toLocaleLowerCase() !== normalizedOriginal &&
						!NON_QUERY_CANDIDATE.test(candidate)
				)
		)
	].slice(0, 2);
}

/** Preserve the original query and add model-written search views. The model
 * never sees document text: it only expands user wording into likely labels,
 * synonyms and independent sub-questions. Retrieval fuses every view by rank. */
export async function localRetrievalQueryVariants(
	query: string,
	documentLanguages: Array<string | null>,
	rewrite: QueryTranslator
): Promise<string[]> {
	const locale = questionLocale(query);
	const needsEnglish = locale === 'fr' && documentLanguages.includes('en');
	const raw = await rewrite([
		{
			role: 'system',
			content: `Rewrite the user's question into up to two concise document-search queries in ${locale === 'fr' ? 'French' : 'English'}.
Use likely form labels, formal contract vocabulary and close synonyms for every sub-question. Do not write a hypothetical answer or source sentence and do not add facts.
Silently correct misspellings. Preserve every user-supplied name, identifier, number, negation, strict comparison and scope.${needsEnglish ? ' One query may be an English translation when useful.' : ''} Output search queries only, one per line.`
		},
		{ role: 'user', content: query }
	]);
	return cleanRetrievalQueryVariants(raw, query).filter((candidate) =>
		preservesQueryConstraints(query, candidate)
	);
}

/** Keep the user's wording authoritative. Model-written variants are a retry,
 * never extra RRF votes that can drown an already-good exact retrieval. */
export async function retrieveWithLocalQueryFallback(input: {
	query: string;
	/** The current question alone. A follow-up retrieves with the composed
	 * conversation query, but evidence gates must judge the current question:
	 * the previous turn's words otherwise satisfy every check while the actual
	 * question goes unserved and the rewrite never gets to win. */
	refinementQuery?: string;
	documentLanguages: Array<string | null>;
	rewrite: QueryTranslator;
	retrieve: (alternateQueries: string[]) => Promise<SearchHit[]>;
}): Promise<{ hits: SearchHit[]; alternateQueries: string[] }> {
	const question = input.refinementQuery ?? input.query;
	const primaryHits = await input.retrieve([]);
	if (
		!isWeakMatch(primaryHits) &&
		hasAnswerBearingEvidence(question, primaryHits) &&
		hasClauseLevelLexicalEvidence(question, primaryHits) &&
		hasDistinctiveLexicalEvidence(question, primaryHits)
	) {
		return { hits: primaryHits, alternateQueries: [] };
	}

	// The rewrite still sees the composed query: a pronoun question needs the
	// referenced entity to produce useful search views.
	const alternateQueries = await localRetrievalQueryVariants(
		input.query,
		input.documentLanguages,
		input.rewrite
	);
	if (!alternateQueries.length) return { hits: primaryHits, alternateQueries: [] };

	const fallbackHits = await input.retrieve(alternateQueries);
	if (
		isWeakMatch(fallbackHits) ||
		!hasAnswerBearingEvidence(question, fallbackHits, alternateQueries) ||
		!hasClauseLevelLexicalEvidence(question, fallbackHits)
	) {
		return { hits: primaryHits, alternateQueries: [] };
	}
	// A rewrite may find useful vocabulary while losing a precise structured
	// declaration already recalled by user wording. Compare evidence quality;
	// never replace a stronger primary result merely because retry is valid.
	const evidenceScore = (hits: SearchHit[], alternates: string[]) =>
		Number(!isWeakMatch(hits)) +
		2 * Number(hasAnswerBearingEvidence(question, hits, alternates)) +
		Number(hasClauseLevelLexicalEvidence(question, hits)) +
		Number(hasDistinctiveLexicalEvidence(question, hits)) +
		stemmedQueryCoverage(
			question,
			hits.map((hit) => `${hit.headingPath ?? ''}\n${hit.text}`).join('\n')
		);
	if (evidenceScore(primaryHits, []) >= evidenceScore(fallbackHits, alternateQueries)) {
		return { hits: primaryHits, alternateQueries: [] };
	}
	return { hits: fallbackHits, alternateQueries };
}

/** Translate only when a French query searches at least one English document.
 * The existing local answer model is reused: no document text leaves the device
 * and no benchmark/domain vocabulary is embedded in application rules. */
export async function crossLingualQueryVariants(
	query: string,
	documentLanguages: Array<string | null>,
	translate: QueryTranslator
): Promise<string[]> {
	if (questionLocale(query) !== 'fr' || !documentLanguages.includes('en')) return [];
	const raw = await translate([
		{
			role: 'system',
			content:
				'Translate the search query from French to English for document retrieval. The input may contain misspellings or missing accents: silently correct them from context before translating. Choose the context-appropriate meaning, not a word-by-word cognate. Preserve every name, identifier, number, negation and requested scope. For a yes/no question, append concise English search terms for both possible sides of the claim without choosing an answer. Output one line only. Do not answer the question.'
		},
		{ role: 'user', content: query }
	]);
	const translated = cleanTranslatedQuery(raw, query);
	return translated ? [translated] : [];
}

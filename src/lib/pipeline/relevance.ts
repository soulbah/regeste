// P8 (spec 009): honest low-relevance signal. RRF scores (k=60) top out at
// ~0.033 (rank 1 in both lists); a hit found by only one retriever at rank 1
// scores ~0.016. Below the threshold we warn instead of pretending.

import type { SearchHit } from '$lib/types';
import { damerauLevenshtein, extractIdentifiers, normalizeForFuzzy } from '$lib/pipeline/fuzzy';

export const WEAK_SCORE_THRESHOLD = 0.018;
const MAX_REFINED_SCORE = 2 / 61 + 0.008;

export function isWeakMatch(hits: SearchHit[]): boolean {
	return hits.length > 0 && Math.max(...hits.map((h) => h.score)) < WEAK_SCORE_THRESHOLD;
}

const QUESTION_FILLER = new Set([
	'quel',
	'quelle',
	'quels',
	'quelles',
	'quoi',
	'comment',
	'combien',
	'donne',
	'donner',
	'document',
	'documents',
	'reponse',
	'resoudre',
	'savoir',
	'who',
	'what',
	'which',
	'where',
	'when',
	'how',
	'tell',
	'answer',
	'document',
	'documents',
	'about',
	'avec',
	'artificiellement',
	'dans',
	'pour',
	'sans',
	'est',
	'etait',
	'sont',
	'etre',
	'has',
	'have',
	'that',
	'this',
	'the',
	'les',
	'le',
	'la',
	'leur',
	'leurs',
	'des',
	'de',
	'du',
	'une',
	'tout',
	'tous',
	'toute',
	'toutes',
	'and',
	'et',
	'elle'
]);

const ATTRIBUTE_ALIASES = [
	['commentaire', 'commentaires', 'comment', 'comments'],
	['attendu', 'attendus', 'expected', 'due'],
	['contenu', 'content'],
	['reponse', 'response'],
	['negatif', 'negative'],
	['transfere', 'transfer', 'transfers'],
	['entree', 'effective'],
	['vigueur', 'effective'],
	['signifie', 'means'],
	['effet', 'effect'],
	['planification', 'planning'],
	['vehicule', 'vehicules', 'vehicle', 'vehicles'],
	['horaire', 'hourly', 'hour'],
	['information'],
	['augmente', 'increase', 'increases'],
	['description', 'descriptions', 'decrit', 'describes'],
	['divergence', 'divergent', 'diverge']
];

const REQUIRED_ATTRIBUTE_GROUPS = [
	['passeport', 'passport'],
	['telephone', 'phone', 'mobile'],
	['email', 'courriel'],
	['securite', 'social', 'ssn'],
	['iban', 'bic']
];

function normalizedTokens(value: string): string[] {
	return (
		value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.match(/[a-z0-9]+/g) ?? []
	);
}

function tokenMatches(term: string, candidates: Set<string>): boolean {
	if (candidates.has(term)) return true;
	const alternatives = ATTRIBUTE_ALIASES.find((group) =>
		group.some((alias) => damerauLevenshtein(term, alias, 2) <= 2)
	) ?? [term];
	return alternatives.some((alternative) =>
		[...candidates].some((candidate) => {
			if (alternative.length >= 6 && candidate.startsWith(alternative.slice(0, 5))) return true;
			const minimumLength = Math.min(alternative.length, candidate.length);
			return (
				minimumLength >= 4 &&
				damerauLevenshtein(alternative, candidate, minimumLength === 4 ? 1 : 2) <=
					(minimumLength === 4 ? 1 : 2)
			);
		})
	);
}

/**
 * Entity-only overlap is not answer evidence. Example: a profile mentioning
 * CR-204 must not support a passport-number question when no passage mentions
 * passports or numbers. Kept deliberately conservative: identity questions
 * may be answered from the entity itself, other questions need one non-filler,
 * non-identifier attribute term (with a small morphology prefix allowance).
 */
export function hasAnswerBearingEvidence(query: string, hits: SearchHit[]): boolean {
	if (!hits.length) return false;
	const normalizedQuery = normalizedTokens(query);
	const normalized = normalizedQuery.join(' ');
	const identifiers = extractIdentifiers(query);
	const eligibleHits = identifiers.length
		? hits.filter((hit) => {
				const candidate = normalizeForFuzzy(`${hit.documentName}\n${hit.text}`).replaceAll(' ', '');
				return identifiers.some((identifier) =>
					candidate.includes(normalizeForFuzzy(identifier).replaceAll(' ', ''))
				);
			})
		: hits;
	if (!eligibleHits.length) return false;
	const candidateText = eligibleHits.map((hit) => `${hit.documentName}\n${hit.text}`).join(' ');
	const joined = new Set(normalizedTokens(candidateText));
	if (/^(qui est|qui sont|who is|who are)\b/.test(normalized)) {
		return normalizedQuery.some((term) => term.length >= 3 && joined.has(term));
	}
	for (const group of REQUIRED_ATTRIBUTE_GROUPS) {
		if (
			group.some((term) => normalizedQuery.includes(term)) &&
			!group.some((term) => joined.has(term))
		) {
			return false;
		}
	}
	if (
		/\b(?:mot de passe|password)\b/.test(normalized) &&
		!eligibleHits.some((hit) => {
			const hitTokens = new Set(normalizedTokens(`${hit.documentName}\n${hit.text}`));
			const hasPassword = ['password', 'passwd', 'passe'].some((term) => hitTokens.has(term));
			const asksRecommendation = /\b(?:recommand\w*|recommend\w*)\b/.test(normalized);
			const hasRecommendation = [...hitTokens].some((term) =>
				/^(?:recommand|recommend)/.test(term)
			);
			return hasPassword && (!asksRecommendation || hasRecommendation);
		})
	)
		return false;
	if (/^(?:quel.*mot de passe|what.*password)\b/.test(normalized)) {
		const labeledValue = /(?:mot de passe|password)\s*(?:recommand[\p{L}]*\s*)?[:=]\s*\S{3,}/iu;
		const structuredCopulaValue =
			/(?:mot de passe|password)\s*(?:recommand[\p{L}]*\s*)?(?:est|is)\s+\S*(?:\d|[._@#$%!?-])\S*/iu;
		if (
			!eligibleHits.some(
				(hit) => labeledValue.test(hit.text) || structuredCopulaValue.test(hit.text)
			)
		)
			return false;
	}
	if (
		/\b(?:groupe sangu\w*|blood type)\b/.test(normalized) &&
		!/(?:groupe sangu\w*|blood type)/.test(normalizeForFuzzy(candidateText))
	)
		return false;
	if (
		identifiers.length > 0 &&
		identifiers.some((identifier) =>
			normalizeForFuzzy(candidateText).includes(normalizeForFuzzy(identifier))
		)
	)
		return true;
	const attributes = normalizedQuery.filter(
		(term) =>
			term.length >= 4 &&
			!QUESTION_FILLER.has(term) &&
			!/^\d+$/.test(term) &&
			!/[a-z]+\d|\d+[a-z]+/.test(term)
	);
	const requestedPhrase = normalized.split(/\b(?:de|du|des)\b/, 1)[0];
	const requestedAttributes = normalizedTokens(requestedPhrase).filter(
		(term) => term.length >= 4 && !QUESTION_FILLER.has(term)
	);
	if (/^(quel|quelle|quels|quelles)\b/.test(normalized) && requestedAttributes.length) {
		return requestedAttributes.some((term) => tokenMatches(term, joined));
	}
	const matched = attributes.filter((term) => tokenMatches(term, joined)).length;
	return matched > 0 && matched / Math.max(attributes.length, 1) >= 0.5;
}

/** Absolute calibration: never call the best item 100% merely because others are worse. */
export function relevancePercent(hit: SearchHit): number {
	return Math.round(Math.max(0, Math.min(1, hit.score / MAX_REFINED_SCORE)) * 100);
}

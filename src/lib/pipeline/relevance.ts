// P8 (spec 009): honest low-relevance signal. RRF scores (k=60) top out at
// ~0.033 (rank 1 in both lists); a hit found by only one retriever at rank 1
// scores ~0.016. Below the threshold we warn instead of pretending.

import type { SearchHit } from '$lib/types';
import { damerauLevenshtein, extractIdentifiers, normalizeForFuzzy } from '$lib/pipeline/fuzzy';
import {
	hasNamedPartyRoleEvidence,
	isIdentityQuestion,
	PARTY_ROLE_ALIASES,
	requestedPartyRoles
} from '$lib/pipeline/identity-evidence';

const WEAK_SCORE_THRESHOLD = 0.018;
const MAX_REFINED_SCORE = 2 / 61 + 0.008;

/**
 * The cross-encoder's margin between the best passage and the runner-up.
 *
 * Measured, and deliberately NOT used as a gate. The idea was sound — a
 * comparable per-candidate score means the gap between the first two should say
 * how much the evidence settles the question — and the gap does not separate
 * the two populations. On 113 grounded cases, reranking a pool of 32, the
 * margin when the top passage was on a gold page had a median of 0.50; when it
 * was not, 0.29. Sweeping every threshold:
 *
 *   t=0.30  flags 38 of 113, of which 16% are actually wrong, catching 60%
 *   t=0.75  flags 74 of 113, of which 14% are actually wrong, catching 100%
 *
 * Refusing at 0.30 would suppress 32 correct answers to catch 6 wrong ones, and
 * no threshold in the sweep reaches 27% precision. The 0.3 borrowed from a
 * product-catalogue search does not transfer: a catalogue has one right row per
 * query, a policy document has a dozen passages that all legitimately touch the
 * question, so near-ties are normal there and mean nothing.
 *
 * Kept because the number is honest and worth showing in "how this result was
 * built". It must not decide whether the reader gets an answer.
 */
export function rerankMargin(hits: SearchHit[]): number | null {
	const scored = hits
		.map((hit) => hit.rerankScore)
		.filter((score): score is number => typeof score === 'number');
	return scored.length >= 2 ? scored[0] - scored[1] : null;
}

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

// Words that describe the requested presentation rather than an evidence
// attribute. Applied only to the preposition-leading “quel X de Y” slot.
const ATTRIBUTE_REQUEST_WRAPPERS = new Set([
	'historique',
	'history',
	'liste',
	'list',
	'resume',
	'summary',
	'synthese',
	'synthesis',
	'information',
	'informations',
	'detail',
	'details',
	'overview'
]);

const ATTRIBUTE_ALIASES = [
	['cout', 'coute', 'cost', 'prix', 'price'],
	['superficie', 'surface', 'contenance', 'area'],
	['maison', 'bien', 'immeuble', 'logement', 'house', 'home', 'property'],
	['pret', 'emprunt', 'financement', 'loan', 'mortgage'],
	[...PARTY_ROLE_ALIASES.buyer],
	[...PARTY_ROLE_ALIASES.seller],
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
	['iban', 'bic'],
	['pdg', 'ceo'],
	['directeur', 'directrice', 'manager', 'director'],
	[...PARTY_ROLE_ALIASES.buyer],
	[...PARTY_ROLE_ALIASES.seller]
];

// French writes the first of the month as "1er" and spells it "premier"; both
// are ordinary calendar dates that the digit-only day pattern could not see.
const EXPLICIT_DATE =
	/\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2}|(?:premier|\d{1,2}(?:er|re|e|ème|eme)?)\s+(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})\b/iu;
const EXPLICIT_TIME = /\b(?:[01]?\d|2[0-3])(?::|h)[0-5]\d\b/iu;
const EXPLICIT_DURATION =
	/\b(?:(?:\d+|(?:un|une|one|a|an)|\p{L}+\s*\(\d+\))\s*(?:ans?|ann[eé]es?|jours?|mois|heures?|minutes?|years?|months?|days?|hours?|minutes?))\b/iu;
const EXPLICIT_SCHEDULE =
	/\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu;
const QUANTIFIED_ATTRIBUTE_QUESTION =
	/\b(?:combien|how much|how many|plafond|limit|limite|montant|amount|prix|price|cost|cout|prime|premium|cotisation|franchise|deductible|superficie|surface|area|duree|duration|taux|rate|pourcentage|percentage|nombre|count)\b/iu;
const EXPLICIT_QUANTIFIED_VALUE =
	/(?:\d[\d\s.,]*\s*(?:€|eur\b|euros?\b|usd\b|dollars?\b|%|m2\b|m²\b|ca\b|ans?\b|ann[eé]es?\b|jours?\b|mois\b|heures?\b|minutes?\b|years?\b|months?\b|days?\b|hours?\b))|(?:(?:€|eur\b|usd\b)\s*\d)/iu;
const PERSON_NAME = /\b\p{Lu}[\p{L}'’-]{1,}(?:\s+\p{Lu}[\p{L}'’-]{1,})+\b/u;
const COMPANION_ROLE =
	/\b(?:partenaire|conjoint|conjointe|epoux|epouse|compagnon|compagne|partner|spouse|husband|wife)\b/iu;
const EXACT_VALUE_QUESTION =
	/^(?:quel(?:le)? est|quels? sont|what is|what are).*\b(?:numero|number|telephone|phone|mobile|email|courriel|iban|bic)\b/iu;
const LABELED_EXACT_VALUE =
	/\b(?:numero|number|telephone|phone|mobile|email|courriel|iban|bic)[^\n:]{0,80}(?::|=|n[°o]|\b(?:est|is)\b)\s*(?:[+A-Z0-9][A-Z0-9@+._/ -]{2,})/iu;

/** Function words that are capitalised for emphasis, never acronyms. */
const NON_ACRONYMS = new Set([
	'le',
	'la',
	'les',
	'de',
	'du',
	'des',
	'un',
	'une',
	'et',
	'ou',
	'au',
	'aux',
	'en',
	'ce',
	'ces',
	'sur',
	'par',
	'pour',
	'the',
	'and',
	'or',
	'of',
	'in',
	'on',
	'for',
	'to'
]);

/** An acronym in the question is evidence the answer must carry. Case is the
 * only signal that a token IS one, so a question typed in capitals carries no
 * signal at all: treating every word in it as mandatory refused answers that
 * were present. */
function requiredAcronyms(query: string): string[] {
	const letters = query.replace(/[^\p{L}]/gu, '');
	if (!letters || letters === letters.toLocaleUpperCase()) return [];
	return [...new Set(query.match(/\b[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9-]{1,9}\b/gu) ?? [])].filter(
		(token) => !NON_ACRONYMS.has(token.toLocaleLowerCase())
	);
}

/** Exact identifiers need a value bound to their label and requested entity,
 * not a nearby instruction saying that such a value should be supplied. */
function hasBoundExactValue(query: string, hits: SearchHit[]): boolean {
	const normalizedQuery = normalizeForFuzzy(query);
	const entityTerms = normalizedTokens(
		normalizedQuery.match(/\b(?:du|de la|de l|of the)\s+(.+?)(?:\?|$)/u)?.[1] ?? ''
	).filter(
		(term) =>
			term.length >= 5 &&
			!['assurance', 'contrat', 'contract', 'exact', 'exacte', 'personnel'].includes(term)
	);
	return hits.some((hit) => {
		const accentFolded = `${hit.headingPath ?? ''}\n${hit.text}`
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
		const boundValue = LABELED_EXACT_VALUE.exec(accentFolded);
		if (!boundValue) return false;
		if (!entityTerms.length) return true;
		// An assistance phone elsewhere in a long passage is not a subscriber's
		// personal phone. Bind requested entity to same local label/value window.
		const start = Math.max(0, (boundValue.index ?? 0) - 180);
		const end = Math.min(accentFolded.length, (boundValue.index ?? 0) + boundValue[0].length + 180);
		const localTokens = new Set(normalizedTokens(accentFolded.slice(start, end)));
		return entityTerms.some((term) => tokenMatches(term, localTokens));
	});
}

/** A structured yes/no row can invalidate the premise of an exact-detail
 * question (for example “alarm system: no”). That is useful evidence for a
 * qualified answer, even though the requested brand cannot exist. */
function hasStructuredPremiseEvidence(query: string, hits: SearchHit[]): boolean {
	const normalizedQuery = normalizeForFuzzy(query);
	if (!/\b(?:exact|exacte|precis|precise|marque|brand|specific)\b/u.test(normalizedQuery))
		return false;
	const queryNumbers =
		normalizedQuery.match(/\b\d[\d ]*\b/g)?.map((value) => value.replace(/\D/g, '')) ?? [];
	const queryTerms = normalizedTokens(normalizedQuery).filter(
		(term) =>
			term.length >= 5 &&
			!QUESTION_FILLER.has(term) &&
			!['exact', 'exacte', 'precis', 'precise', 'marque', 'brand', 'specific'].includes(term)
	);
	return hits.some((hit) => {
		if (!/(?:^|\n)[^\n:]{2,100}:\s*(?:oui|non|yes|no|aucun|aucune|none)\b/iu.test(hit.text))
			return false;
		const hitTokens = new Set(normalizedTokens(hit.text));
		const termMatches = queryTerms.filter((term) => tokenMatches(term, hitTokens)).length;
		const numberMatches = queryNumbers.some((number) =>
			hit.text.replace(/\D/g, '').includes(number)
		);
		return termMatches >= 2 || (termMatches >= 1 && numberMatches);
	});
}

/** Exact-value evidence for temporal questions. A page merely discussing a
 * start date must not outrank the passage containing every requested value. */
export function temporalEvidenceCoverage(query: string, text: string): number {
	const normalizedQuery = normalizeForFuzzy(query);
	const asksForDate = /\b(?:date|jour exact|calendar date)\b/iu.test(normalizedQuery);
	const asksForTime = /\b(?:heure|horaire|time)\b/iu.test(normalizedQuery);
	const asksWhen = /\b(?:quand|when)\b/iu.test(normalizedQuery);
	if (!asksForDate && !asksForTime && !asksWhen) return 0;
	const normalizedText = normalizeForFuzzy(text);
	const hasExplicitDate = EXPLICIT_DATE.test(text) || EXPLICIT_DATE.test(normalizedText);
	const hasRequestedShape =
		(!asksForDate || hasExplicitDate) && (!asksForTime || EXPLICIT_TIME.test(text));
	if (asksForDate || asksForTime) return hasRequestedShape ? 1 : 0;
	return hasExplicitDate ||
		EXPLICIT_TIME.test(text) ||
		EXPLICIT_DURATION.test(normalizedText) ||
		EXPLICIT_SCHEDULE.test(normalizedText)
		? 1
		: 0;
}

/** A quantitative slot can be answered by a value bound to its subject even
 * when the source uses “jusqu’à” instead of repeating the user's label
 * (“plafond”, “amount”, etc.). The slot vocabulary stays bounded; document
 * domain terms come only from the user's scope. */
function hasBoundQuantifiedEvidence(query: string, hits: SearchHit[]): boolean {
	const normalizedQuery = normalizeForFuzzy(query);
	if (!QUANTIFIED_ATTRIBUTE_QUESTION.test(normalizedQuery)) return false;
	const scope =
		normalizedQuery.match(/\b(?:du|de la|de l|des|of(?: the)?)\s+(.+?)(?:\?|$)/u)?.[1] ?? '';
	const scopeTerms = normalizedTokens(scope).filter(
		(term) => term.length >= 4 && !QUESTION_FILLER.has(term) && !/^exacte?s?$/.test(term)
	);
	return hits.some((hit) => {
		if (!EXPLICIT_QUANTIFIED_VALUE.test(hit.text)) return false;
		if (!scopeTerms.length) return true;
		const hitTokens = new Set(normalizedTokens(`${hit.headingPath ?? ''}\n${hit.text}`));
		const matched = scopeTerms.filter((term) => tokenMatches(term, hitTokens)).length;
		return matched >= Math.min(2, scopeTerms.length);
	});
}

/** Completeness signal for open identity slots that party-role matching does
 * not cover (for example an insured person and their unnamed partner). */
export function identityEvidenceCoverage(query: string, text: string): number {
	if (!isIdentityQuestion(query)) return 0;
	const normalizedQuery = normalizeForFuzzy(query);
	const wantsCompanion =
		/\b(?:avec qui|with whom|cohabitant|compagnon|compagne|partenaire|companion|partner)\b/iu.test(
			normalizedQuery
		);
	const wantsNamedPerson =
		!wantsCompanion ||
		/\b(?:qui est|who is|souscripteur|assure|assuree|subscriber|insured|nom|name|nomme|named)\b/iu.test(
			normalizedQuery
		);
	const requested = Number(wantsNamedPerson) + Number(wantsCompanion);
	if (!requested) return 0;
	const matched =
		Number(wantsNamedPerson && PERSON_NAME.test(text)) +
		Number(wantsCompanion && COMPANION_ROLE.test(normalizeForFuzzy(text)));
	return matched / requested;
}

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
export function hasAnswerBearingEvidence(
	query: string,
	hits: SearchHit[],
	alternateQueries: string[] = []
): boolean {
	if (
		alternateQueries.length &&
		[query, ...alternateQueries].some((variant) => hasAnswerBearingEvidence(variant, hits))
	)
		return true;
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
	const acronyms = requiredAcronyms(query);
	if (
		acronyms.length &&
		// A document that writes "Ipid" or "iban" still carries the acronym.
		!acronyms.every((acronym) =>
			eligibleHits.some((hit) => new RegExp(`\\b${acronym}\\b`, 'iu').test(hit.text))
		)
	)
		return false;
	if (EXACT_VALUE_QUESTION.test(normalized) && !hasBoundExactValue(query, eligibleHits))
		return false;
	const asksForDate = /\b(?:date|jour exact|calendar date)\b/iu.test(normalized);
	const asksForTime = /\b(?:heure|horaire|time)\b/iu.test(normalized);
	const asksWhen = /\b(?:quand|when)\b/iu.test(normalized);
	if (
		(asksForDate || asksForTime || asksWhen) &&
		!eligibleHits.some((hit) => temporalEvidenceCoverage(query, hit.text) === 1)
	)
		return false;
	if (hasStructuredPremiseEvidence(query, eligibleHits)) return true;
	if (hasBoundQuantifiedEvidence(query, eligibleHits)) return true;
	const candidateText = eligibleHits.map((hit) => `${hit.documentName}\n${hit.text}`).join(' ');
	const joined = new Set(normalizedTokens(candidateText));
	const perHitTokens = eligibleHits.map(
		(hit) => new Set(normalizedTokens(`${hit.documentName}\n${hit.headingPath ?? ''}\n${hit.text}`))
	);
	// The required-attribute gate must see the same tokens as the quel/quelle
	// branch below (which uses perHitTokens): a role or attribute that appears
	// only in a heading is still evidence, so it must not trigger a refusal.
	const joinedWithHeadings = new Set(perHitTokens.flatMap((tokens) => [...tokens]));
	for (const group of REQUIRED_ATTRIBUTE_GROUPS) {
		// “phone” is also an ordinary insured object. Require it as a labeled
		// contact value only for an exact-value question, not for phone damage.
		if (group.includes('telephone') && !EXACT_VALUE_QUESTION.test(normalized)) continue;
		if (
			group.some((term) => normalizedQuery.includes(term)) &&
			!group.some((term) => joinedWithHeadings.has(term))
		) {
			return false;
		}
	}
	if (isIdentityQuestion(query)) {
		const roles = requestedPartyRoles(query);
		if (roles.length) {
			return roles.every((role) =>
				eligibleHits.some((hit) =>
					hasNamedPartyRoleEvidence(`${hit.headingPath ?? ''}\n${hit.text}`, role)
				)
			);
		}
		if (
			/\b(?:avec qui|with whom|cohabitant|compagnon|compagne|partenaire|companion|partner)\b/iu.test(
				normalized
			)
		) {
			return identityEvidenceCoverage(query, eligibleHits.map((hit) => hit.text).join('\n')) === 1;
		}
		if (/\b(?:devis|contrat|police|quote|policy)\b/iu.test(normalized)) {
			return eligibleHits.some((hit) => PERSON_NAME.test(hit.text));
		}
		return normalizedQuery.some((term) => term.length >= 3 && joined.has(term));
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
		/\b(?:groupe sangu\w*|blood (?:type|group))\b/.test(normalized) &&
		!/(?:groupe sangu\w*|blood (?:type|group))/.test(normalizeForFuzzy(candidateText))
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
		(term) =>
			term.length >= 4 && !QUESTION_FILLER.has(term) && !ATTRIBUTE_REQUEST_WRAPPERS.has(term)
	);
	if (/^(quel|quelle|quels|quelles)\b/.test(normalized) && requestedAttributes.length) {
		const scope = /\b(?:du|de la|de l|des|of the)\s+(.+?)(?:\?|$)/.exec(normalized)?.[1] ?? '';
		const scopeTerms = normalizedTokens(scope).filter(
			(term) => term.length >= 4 && !QUESTION_FILLER.has(term) && !/^exacte?s?$/.test(term)
		);
		return perHitTokens.some(
			(hitTokens) =>
				requestedAttributes.some((term) => tokenMatches(term, hitTokens)) &&
				(scopeTerms.length === 0 || scopeTerms.some((term) => tokenMatches(term, hitTokens)))
		);
	}
	const matched = attributes.filter((term) => tokenMatches(term, joined)).length;
	return matched > 0 && matched / Math.max(attributes.length, 1) >= 0.5;
}

/** Absolute calibration: never call the best item 100% merely because others are worse. */
export function relevancePercent(hit: SearchHit): number {
	return Math.round(Math.max(0, Math.min(1, hit.score / MAX_REFINED_SCORE)) * 100);
}

import type { QuestionRoute, SearchHit } from '$lib/types';
import { analyzeQuestion } from '$lib/analysis/query-router';
import {
	damerauLevenshtein,
	fuzzyQueryCoverage,
	identifierCompatibility,
	normalizeForFuzzy,
	phraseQueryCoverage,
	significantQueryTokens,
	stemmedQueryCoverage
} from '$lib/pipeline/fuzzy';
import { partyIdentityCoverage } from '$lib/pipeline/identity-evidence';
import { identityEvidenceCoverage, temporalEvidenceCoverage } from '$lib/pipeline/relevance';

const RRF_K = 60;
const RERANK_CANDIDATE_LIMIT = 96;
export const MAX_EVIDENCE_CHARS = 10000;
/** Query/ranking behavior fingerprint. Unlike RETRIEVAL_VERSION this does not
 * require re-indexing documents; it invalidates benchmark/result caches only. */
export const RETRIEVAL_PIPELINE_VERSION = 48;

/** A batched DB read may return the union of several requests' neighbors.
 * Restore per-request isolation before ranking so batching cannot change a
 * question's candidates. */
export function neighborsForAnchors(
	neighbors: SearchHit[],
	anchors: SearchHit[],
	maxDistance = 1
): SearchHit[] {
	return neighbors.filter(
		(neighbor) =>
			neighbor.seq !== undefined &&
			anchors.some(
				(anchor) =>
					anchor.documentId === neighbor.documentId &&
					anchor.seq !== undefined &&
					Math.abs(anchor.seq - neighbor.seq!) <= maxDistance
			)
	);
}

/** Merge query-variant rankings without comparing cosine values from different queries. */
export function mergeRankedCandidateLists(lists: SearchHit[][], limit = 60): SearchHit[] {
	const byChunk = new Map<number, { hit: SearchHit; rankScore: number }>();
	for (let listIndex = 0; listIndex < lists.length; listIndex++) {
		const hits = lists[listIndex];
		// The FIRST list is the user's actual question; the rest are rewrites and
		// typo/translation variants. Rank-only fusion lets several variants each
		// pulling near-duplicates of one theme outvote the original query's unique
		// hit (measured: an enumeration question lost two named perils that the
		// plain query retrieves). Weighted RRF, the Elasticsearch/Azure pattern:
		// the original counts double, variants still contribute recall.
		const weight = listIndex === 0 ? 2 : 1;
		for (let index = 0; index < hits.length; index++) {
			const hit = hits[index];
			const previous = byChunk.get(hit.chunkId);
			byChunk.set(hit.chunkId, {
				hit: !previous || hit.score > previous.hit.score ? hit : previous.hit,
				rankScore: (previous?.rankScore ?? 0) + weight / (RRF_K + index + 1)
			});
		}
	}
	return [...byChunk.values()]
		.sort((left, right) => right.rankScore - left.rankScore || right.hit.score - left.hit.score)
		.slice(0, limit)
		.map((item) => item.hit);
}

/** Keep useful immediate context inside each broad retrieval branch before
 * cross-channel fusion. This is bounded candidate expansion, not recursive
 * graph traversal: one document-local neighbor hop around the leading anchors. */
export function expandChannelCandidatesWithNeighbors(
	ranked: SearchHit[],
	neighbors: SearchHit[],
	query: string,
	anchorLimit = 48,
	limit = 60,
	neighborLimit = 24
): SearchHit[] {
	const byLocation = new Map<string, SearchHit[]>();
	for (const neighbor of neighbors) {
		if (neighbor.seq === undefined) continue;
		const key = `${neighbor.documentId}:${neighbor.seq}`;
		const existing = byLocation.get(key) ?? [];
		existing.push(neighbor);
		byLocation.set(key, existing);
	}

	const expanded: SearchHit[] = [];
	const seen = new Set<number>();
	// Context and candidates draw on separate budgets. Sharing one meant each
	// anchor's two neighbours ate two candidate slots, so the list filled after
	// about twenty anchors and ranks 21-60 of every channel were dropped before
	// fusion ever saw them — added context cost recall.
	let anchorCount = 0;
	let neighborCount = 0;
	const add = (hit: SearchHit, isNeighbor: boolean) => {
		if (seen.has(hit.chunkId)) return;
		if (isNeighbor ? neighborCount >= neighborLimit : anchorCount >= limit) return;
		seen.add(hit.chunkId);
		if (isNeighbor) neighborCount++;
		else anchorCount++;
		expanded.push(hit);
	};

	for (let index = 0; index < ranked.length && anchorCount < limit; index++) {
		const anchor = ranked[index];
		add(anchor, false);
		if (index >= anchorLimit || anchor.seq === undefined) continue;

		const contextual = [anchor.seq - 1, anchor.seq + 1]
			.flatMap((seq) => byLocation.get(`${anchor.documentId}:${seq}`) ?? [])
			.map((neighbor) => {
				const candidate = `${neighbor.headingPath ?? ''}\n${neighbor.text}`;
				const utility = Math.max(
					queryCoverage(query, candidate),
					fuzzyQueryCoverage(query, candidate),
					stemmedQueryCoverage(query, candidate),
					numericAnswerEvidenceCoverage(query, candidate),
					numericLabelEvidenceCoverage(query, candidate),
					numericConstraintEvidenceCoverage(query, candidate)
				);
				return { neighbor, utility };
			})
			.filter(({ utility }) => utility > 0)
			.sort(
				(left, right) =>
					right.utility - left.utility || left.neighbor.chunkId - right.neighbor.chunkId
			);

		for (const { neighbor, utility } of contextual) {
			add(
				{
					...neighbor,
					score: anchor.score * 0.45 + utility * 0.02
				},
				true
			);
		}
	}
	return expanded;
}

const STOPWORDS = new Set([
	'que',
	'qui',
	'avec',
	'cette',
	'comment',
	'dans',
	'des',
	'est',
	'leur',
	'pour',
	'quel',
	'quelle',
	'quels',
	'quelles',
	'son',
	'sont',
	'their',
	'what',
	'when',
	'where',
	'which',
	'with'
]);

function properNameCoverage(query: string, text: string): number {
	const names = (query.match(/\b\p{Lu}[\p{L}'’.-]{2,}/gu) ?? [])
		.map(normalizeForFuzzy)
		.filter((term) => term.length >= 3 && !STOPWORDS.has(term));
	if (names.length < 2) return 0;
	const candidates = terms(text);
	const matched = names.filter((name) => {
		const maxDistance = Math.min(2, Math.max(1, Math.floor(name.length / 4)));
		return candidates.some(
			(candidate) =>
				Math.abs(candidate.length - name.length) <= maxDistance &&
				damerauLevenshtein(candidate, name, maxDistance) <= maxDistance
		);
	}).length;
	return matched / names.length;
}

function terms(text: string): string[] {
	return [...new Set(significantQueryTokens(text, 3))];
}

/**
 * The query, unchanged.
 *
 * This appended document vocabulary drawn from a hand-kept table of concepts:
 * "prix" also searched "vente montant euros", and so on. A word list is not a
 * retrieval strategy — it settles one gap and breaks at the next, and every
 * entry is a new way to be wrong. Adding "combien" to it once pulled cost
 * vocabulary into "combien de temps", a question about duration.
 *
 * Measured on 113 grounded cases before removing it. Without a reranker it
 * improved the gold passage's rank 4 times and worsened it 10, for a mean rank
 * of 5.6 against 5.3 with no expansion at all. With the cross-encoder ranking
 * the pool, the two arms are indistinguishable where it counts: the gold page
 * came first 103 times of 113 either way, and reached the top five 108 times
 * either way.
 *
 * Kept as a function so the call sites still read as "this is the retrieval
 * query"; deciding what the words mean is the reranker's job now.
 */
export function expandRetrievalQuery(query: string): string {
	return query;
}

/** Independent query views prevent long natural questions from consuming the
 * bounded FTS token budget before structural vocabulary is reached. */
export function splitQueryClauses(query: string): string[] {
	const clauses = query
		.split(/(?:;|,\s+|\b(?:et|and)\b)/iu)
		.map((clause) => clause.trim())
		.filter((clause) => terms(clause).length >= 1);
	return clauses.length > 1 ? clauses : [];
}

/** Elliptical measurement fragments have no subject of their own. Searching
 * them independently retrieves any nearby duration/amount in the corpus and
 * adds noise; the complete query still carries the requested slot and scope. */
function retrievalClauses(query: string): string[] {
	return splitQueryClauses(query).filter((clause) => {
		const normalized = normalizeForFuzzy(clause);
		return !/^(?:(?:pendant|for)\s+)?(?:combien de temps|how long|quelle duree|what duration|jusqu a quel montant|how much|a quelle date|when)$/u.test(
			normalized
		);
	});
}

export function retrievalQueryVariants(query: string): string[] {
	const clauses = retrievalClauses(query);
	const normalized = normalizeForFuzzy(query);
	const scenarioWindows =
		!isNumericAnswerQuestion(query) &&
		/\b(?:couvert\w*|assure\w*|eligible|autorise\w*|permis|covered|insured|allowed)\b/u.test(
			normalized
		)
			? significantQueryTokens(query, 4)
					.slice(0, 8)
					.map((_, index, tokens) => tokens.slice(index, index + 3))
					.filter((tokens) => tokens.length === 3)
					.map((tokens) => tokens.join(' '))
					.slice(0, 4)
			: [];
	return [...new Set([query, ...(clauses.length > 1 ? clauses : []), ...scenarioWindows])];
}

/** Dense retrieval receives natural-language questions, never sparse keyword
 * expansions. Independent clauses are useful only when the route must gather
 * several facts; targeted questions keep one semantic vector. */
export function denseRetrievalQueryVariants(
	query: string,
	route: QuestionRoute | undefined,
	alternateQueries: string[] = []
): string[] {
	return [query, ...alternateQueries]
		.flatMap((variant) => {
			const clauses = route === 'targeted' ? [] : retrievalClauses(variant);
			return [variant, ...(clauses.length > 1 ? clauses : [])];
		})
		.filter((variant, index, all) => all.indexOf(variant) === index);
}

export function queryCoverage(query: string, text: string): number {
	const wanted = terms(query);
	if (!wanted.length) return 0;
	const haystack = new Set(terms(text));
	const weighted = wanted.map((term) => ({
		term,
		weight: /\d/.test(term) || term.length >= 6 ? 2 : 1
	}));
	const total = weighted.reduce((sum, item) => sum + item.weight, 0);
	return (
		weighted.reduce((sum, item) => sum + (haystack.has(item.term) ? item.weight : 0), 0) / total
	);
}

/** Structural evidence for exhaustive questions. Numbered/bulleted lists are
 * a generic document signal; no document-domain vocabulary is encoded here. */
export function enumerationEvidenceCoverage(query: string, text: string): number {
	if (analyzeQuestion(query).operation !== 'list') return 0;
	const numbered = new Set(
		[...text.matchAll(/(?:^|\n)\s*(\d{1,2})\s*[.)-]\s*\p{L}/gmu)].map((match) => Number(match[1]))
	);
	const bullets = [...text.matchAll(/(?:^|\n)\s*[-•✓!✗]\s*\p{L}/gmu)].length;
	const distinctItems = Math.max(numbered.size, bullets);
	return distinctItems >= 3 ? Math.min(1, distinctItems / 8) : 0;
}

type NumericAnswerKind = 'duration' | 'money' | 'percentage' | 'area' | 'count' | 'generic';

function approximatelyMatchesToken(query: string, alternatives: string[]): boolean {
	const tokens = normalizeForFuzzy(query).split(' ').filter(Boolean);
	return alternatives.some((alternative) =>
		tokens.some((token) => {
			if (alternative.length <= 4) return token === alternative;
			const limit = Math.min(2, Math.floor(alternative.length / 4));
			return (
				limit > 0 &&
				Math.abs(token.length - alternative.length) <= limit &&
				damerauLevenshtein(token, alternative, limit) <= limit
			);
		})
	);
}

/** Infer only the unit family requested by a numeric question. A duration
 * must not be “answered” by an unrelated price, and vice versa. */
function requestedNumericKinds(query: string): NumericAnswerKind[] {
	const normalized = normalizeForFuzzy(query);
	const kinds: NumericAnswerKind[] = [];
	const datePhrase =
		/\b(?:date d effet|prise d effet|entree en vigueur|effective date|entry into force)\b/u.test(
			normalized
		);
	const malformedHowLong =
		/\bcombien de [a-z]{2,6}\s+(?:gard|conserv|dur|rest|maint)/u.test(normalized) ||
		/\bhow [a-z]{2,6}\s+(?:keep|retain|last|remain)/u.test(normalized);
	if (
		/\b(?:combien de temps|pendant combien|how long|duree|duration|delai|deadline|prescription)\b/u.test(
			normalized
		) ||
		approximatelyMatchesToken(normalized, ['temps', 'duree', 'duration']) ||
		malformedHowLong
	)
		kinds.push('duration');
	// A polar (yes/no) question mentioning a money noun asks for a decision, not
	// an amount: "Un recours est-il exercé si le dommage est inférieur à la
	// franchise ?" must keep its conditional passage first, not the price line.
	const polar =
		/\b(?:est|sont|peut|peuvent|doit|dois|a-t|suis|ai)[ -](?:il|elle|ils|elles|on|je|tu|nous|vous)\b|^(?:est ce que|is|are|does|do|can|did)\b/u.test(
			normalized
		);
	if (
		/\b(?:prime|cotisation|premium|prix|price|cost|cout|montant|amount|honoraire|fee)\b/u.test(
			normalized
		) ||
		// plafond/franchise ask "how much" on their own: a clause like "les trois
		// grands plafonds biens" carries no other money word, and its carrier
		// chunk ("…jusqu'à 40 000 €…") shares no vocabulary with it — the typed
		// signal is the only bridge (measured on the 117: three multi-part cases).
		(!polar && /\b(?:plafonds?|franchises?|deductible)\b/u.test(normalized)) ||
		/\b(?:combien|montant|valeur|quelle? est|what is)\b.{0,32}\b(?:franchise|deductible)\b/u.test(
			normalized
		) ||
		(!datePhrase &&
			approximatelyMatchesToken(normalized, [
				'prime',
				'cotisation',
				'premium',
				'prix',
				'montant',
				'mensuel',
				'mensuelle',
				'monthly'
			]))
	)
		kinds.push('money');
	if (/\b(?:taux|rate|pourcentage|percentage)\b/u.test(normalized)) kinds.push('percentage');
	if (/\b(?:superficie|surface|area)\b/u.test(normalized)) kinds.push('area');
	if (
		/\b(?:combien de (?!temps\b)|how many|nombre de|count)\b/u.test(normalized) &&
		!kinds.includes('duration')
	)
		kinds.push('count');
	if (!kinds.length && /\b(?:combien|how much|plafond|limit|limite)\b/u.test(normalized))
		kinds.push('generic');
	return [...new Set(kinds)];
}

export function isNumericAnswerQuestion(query: string): boolean {
	return requestedNumericKinds(query).length > 0;
}

const MONEY_LABEL_GROUPS = [
	['cotisation', 'prime', 'premium', 'paiement', 'payment'],
	['mensuel', 'mensuelle', 'monthly', 'mois'],
	['prix', 'price', 'cost', 'cout', 'montant', 'amount'],
	['franchise', 'deductible']
];

/** Bind a monetary value to the requested label family. The groups are a
 * compact slot ontology, not document vocabulary or a general classifier. */
export function numericLabelEvidenceCoverage(query: string, text: string): number {
	if (!requestedNumericKinds(query).includes('money')) return 0;
	const requestedGroups = MONEY_LABEL_GROUPS.filter((group) =>
		approximatelyMatchesToken(query, group)
	);
	if (!requestedGroups.length) return 0;
	const matched = requestedGroups.filter((group) => approximatelyMatchesToken(text, group)).length;
	return matched / requestedGroups.length;
}

/** Bind the requested monetary slot to a nearby explicit value. Whole-chunk
 * co-occurrence is too weak: a policy section can mention a monthly payment
 * and an unrelated deductible several sentences later. */
export function numericLabelValueProximityCoverage(query: string, text: string): number {
	if (!requestedNumericKinds(query).includes('money')) return 0;
	const moneyPattern =
		/(?:\d[\d\s.,]*\s*(?:€|eur\b|euros?\b|usd\b|dollars?\b))|(?:(?:€|eur\b|usd\b)\s*\d)/giu;
	let best = 0;
	for (const match of text.matchAll(moneyPattern)) {
		const index = match.index ?? 0;
		const window = text.slice(Math.max(0, index - 96), index + match[0].length + 96);
		best = Math.max(best, numericLabelEvidenceCoverage(query, window));
	}
	return best;
}

// A question asking for a way to reach someone wants a literal identifier, and
// a passage that merely REPEATS the question's words without carrying one is a
// non-answer ("the email address used for this request"). Structural like the
// numeric shapes above: a token kind, not document vocabulary.
// The `asked` patterns must name the identifier, never merely brush past a word
// that happens to share its spelling. `tel` is French for "such" (*tel
// qu'indiqué*), `lien` is any connection, `site` is any physical site, `mobile`
// is an adjective — each of those matched ordinary questions, and since a phone
// number or a URL sits in the letterhead of nearly every real document, the
// `value` half filtered nothing. A question about an amount was answered with a
// phone number. Require the identifier to be named, not alluded to.
const CONTACT_SHAPES = [
	{
		asked: /\b(?:mail|e-?mail|courriel|email)\b/u,
		value: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/u
	},
	{
		asked:
			/\b(?:telephone|numero (?:de |du )?(?:telephone|portable|mobile|fixe)|phone number|mobile number)\b/u,
		value: /(?:\+\d[\d\s.-]{6,}\d)|(?:\b0\d(?:[\s.-]?\d{2}){4}\b)/u
	},
	{
		asked: /\b(?:url|site (?:web|internet)|adresse (?:du site|web)|lien vers|website)\b/u,
		value: /https?:\/\/[^\s)]+|\bwww\.[^\s)]+/u
	},
	// Reference identifiers: "numéro de demande / de dossier / de référence".
	// Measured failure: both documents carried the requested numbers
	// (réf. REF4XK20260031425), but passages dense in the WORD "demande" — a
	// numbered list of requests to make — crowded every carrier out of the 16
	// excerpts, and the model dutifully enumerated the list ordinals. Same
	// structure as the email case: the carrier shares almost no vocabulary with
	// the question beyond the one noun. The value is an alphanumeric reference
	// (letters AND digits, 8+) or a long plain number (6+ digits).
	{
		asked:
			/\b(?:num[ée]ros? d(?:e la |e |u )?(?:demandes?|dossiers?|r[ée]f[ée]rences?)|r[ée]f[ée]rences? d(?:e la |e |u )?(?:demandes?|dossiers?)|(?:request|application|file|reference) numbers?)\b/u,
		value: /\b(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{8,}\b|\b\d{6,}\b/u
	}
] as const;

/** 1 when the question asks for a contact identifier and the passage actually
 * carries one, 0 otherwise. Reranking feature only. */
export function contactAnswerEvidenceCoverage(query: string, text: string): number {
	const normalizedQuery = normalizeForFuzzy(query);
	const asked = CONTACT_SHAPES.filter((shape) => shape.asked.test(normalizedQuery));
	if (!asked.length) return 0;
	return asked.some((shape) => shape.value.test(text)) ? 1 : 0;
}

/** The identifiers a passage carries for the type the question asked about.
 * Same table as the coverage signal above, returning what it matched: a draft
 * that omits the value can then be corrected against the literal string rather
 * than a description of it. */
export function contactAnswerValues(query: string, text: string): string[] {
	const normalizedQuery = normalizeForFuzzy(query);
	return CONTACT_SHAPES.filter((shape) => shape.asked.test(normalizedQuery)).flatMap((shape) => {
		const found = text.match(shape.value);
		return found ? [found[0]] : [];
	});
}

// Word numerals a duration clause can spell out ("dix (10) jours ouvrables").
const NUMBER_WORDS: Record<string, number> = {
	un: 1,
	une: 1,
	deux: 2,
	trois: 3,
	quatre: 4,
	cinq: 5,
	six: 6,
	sept: 7,
	huit: 8,
	neuf: 9,
	dix: 10,
	onze: 11,
	douze: 12,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12
};

const DURATION_MENTION_PATTERN =
	/\b(\d{1,4}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|one|two|three|four|five|seven|eight|nine|ten|eleven|twelve)\s*(?:\(\s*\d{1,4}\s*\))?\s+(ans?\b|ann[eé]es?\b|jours?\b|mois\b|semaines?\b|heures?\b|years?\b|months?\b|weeks?\b|days?\b|hours?\b)(\s+ouvrables?|\s+ouvr[eé]s?|\s+calendaires?|\s+francs?)?/giu;

const DURATION_UNIT_KEYS: Array<[RegExp, string]> = [
	[/^an|^ann|^year/iu, 'an'],
	[/^jour|^day/iu, 'jour'],
	[/^mois|^month/iu, 'mois'],
	[/^semaine|^week/iu, 'semaine'],
	[/^heure|^hour/iu, 'heure']
];

/** Every distinct duration value a text states, as `{ key, literal }`:
 * the key normalizes numeral spelling and unit language ("dix (10) jours
 * ouvrables" and "10 days" are both `10 jour`), the literal is the exact
 * wording so a correction can hand the model the string to state. */
export function durationValueMentions(text: string): Array<{ key: string; literal: string }> {
	const seen = new Map<string, string>();
	for (const match of text.matchAll(DURATION_MENTION_PATTERN)) {
		const rawNumber = match[1].toLowerCase();
		const value = /^\d+$/.test(rawNumber) ? Number(rawNumber) : NUMBER_WORDS[rawNumber];
		if (value === undefined) continue;
		const unit = DURATION_UNIT_KEYS.find(([pattern]) => pattern.test(match[2]))?.[1];
		if (!unit) continue;
		const key = `${value} ${unit}`;
		if (!seen.has(key)) seen.set(key, match[0].trim());
	}
	return [...seen.entries()].map(([key, literal]) => ({ key, literal }));
}

/** How many distinct deadlines a question asks for. One per clause that
 * requests a duration; a bare verb-echo clause ("… et répond-il ?") has no
 * vocabulary of its own and inherits the question's duration request — the
 * plural interrogative distributes over the coordinated verbs. Questions
 * that ask a single deadline (or none) return 0 or 1 and gate nothing. */
export function requestedDurationCount(query: string): number {
	// The global kind classifier matches "délai" but not the plural "délais";
	// widening it there would change ranking for every délais question, so the
	// plural is recognized here only — this gate is generation-side and inert
	// for retrieval.
	const asksDelay = (clause: string) =>
		requestedNumericKinds(clause).includes('duration') ||
		/\bdelais\b/u.test(normalizeForFuzzy(clause));
	if (!asksDelay(query)) return 0;
	const clauses = splitQueryClauses(query.split('\n', 1)[0]);
	if (clauses.length < 2) return 1;
	const asksDuration = clauses.map(asksDelay);
	let count = 0;
	for (let index = 0; index < clauses.length; index++) {
		if (asksDuration[index]) {
			count++;
			continue;
		}
		// Elliptical continuation: at most two significant tokens, no numeric
		// request of its own ("répond-il", "y répond-il"). A full clause with its
		// own subject ("Mes biens restent-ils couverts pendant un voyage…") never
		// inherits: it asks its own, non-numeric question.
		if (
			terms(clauses[index]).length <= 2 &&
			!requestedNumericKinds(clauses[index]).length &&
			count > 0
		)
			count++;
	}
	return count;
}

/** The excerpt able to repair a draft that answered fewer deadlines than the
 * question asked: the best question-covering excerpt carrying a duration value
 * the draft does not state. Null when the draft is complete or nothing
 * carries a missing value — the gate then stays inert. */
export function missingDurationCarrier(
	query: string,
	draft: string,
	hits: Array<{ text: string; headingPath?: string | null }>
): { index: number; literal: string } | null {
	const expected = requestedDurationCount(query);
	if (expected < 2) return null;
	const stated = new Set(durationValueMentions(draft).map((mention) => mention.key));
	if (stated.size >= expected) return null;
	let best: { index: number; literal: string; coverage: number } | null = null;
	for (let index = 0; index < hits.length; index++) {
		const missing = durationValueMentions(hits[index].text).filter(
			(mention) => !stated.has(mention.key)
		);
		if (!missing.length) continue;
		const candidate = `${hits[index].headingPath ?? ''}\n${hits[index].text}`;
		const coverage = Math.max(
			queryCoverage(query, candidate),
			fuzzyQueryCoverage(query, candidate),
			stemmedQueryCoverage(query, candidate)
		);
		if (!best || coverage > best.coverage) {
			best = { index, literal: missing[0].literal, coverage };
		}
	}
	return best ? { index: best.index, literal: best.literal } : null;
}

/** "Première mensualité / last installment": an ordinal over a dated payment
 * series. Every chunk of an amortization schedule looks alike to lexical and
 * dense features — the row that answers is the one carrying the series'
 * extreme date, which only a list-level comparison can find. */
export function ordinalPaymentDirection(query: string): 'first' | 'last' | null {
	const normalized = normalizeForFuzzy(query);
	if (
		!/\b(?:mensualites?|echeances?|versements?|paiements?|remboursements?|prelevements?|annuites?|trimestrialites?|installments?|payments?|instalments?)\b/u.test(
			normalized
		)
	)
		return null;
	if (/\b(?:premiere?s?|first)\b/u.test(normalized)) return 'first';
	if (/\b(?:derniere?s?|last|finale?)\b/u.test(normalized)) return 'last';
	return null;
}

const TEXT_DATE_PATTERN = /\b(\d{2})[./](\d{2})[./](\d{4})\b/gu;

/** The extreme (min or max) date a passage's payment SERIES carries, as a
 * sortable number. A date only counts with a decimal amount within a few
 * dozen characters, and a passage needs at least two such dates: a schedule
 * chunk has many, while the document's issue date stamped in every page
 * header ("13.10.2025 · A ARCHIVER") has no adjacent amount and must never
 * outrank the true first installment row. */
export function extremeSeriesDate(text: string, direction: 'first' | 'last'): number | null {
	let extreme: number | null = null;
	let qualified = 0;
	for (const match of text.matchAll(TEXT_DATE_PATTERN)) {
		const index = match.index ?? 0;
		const window = text.slice(Math.max(0, index - 40), index + match[0].length + 60);
		if (!/\d[\d\u202f\u00a0 ]*,\d{2}\b/u.test(window.replace(match[0], ' '))) continue;
		qualified++;
		const value = Number(match[3]) * 10000 + Number(match[2]) * 100 + Number(match[1]);
		if (extreme === null || (direction === 'first' ? value < extreme : value > extreme))
			extreme = value;
	}
	return qualified >= 2 ? extreme : null;
}

const SCHEDULE_ROW_PATTERN =
	/^\s*(\d{1,3})\s+(\d{2}[./]\d{2}[./]\d{4})\s+((?:\d[\d  ]*,\d{2}\s*)+)$/u;

/** The installment amount an ordinal question asks for, read from a schedule
 * passage the deterministic way: rows are `rank date amount…`, and among the
 * amount positions the installment column is the one whose value repeats
 * across rows (a constant payment plan) while balances and interest drift
 * row by row. The answer is the extreme row's value at that position — which
 * is exactly the cell a fixed-rate schedule's first, catch-up or final row
 * changes, so the mode itself is never blindly returned. Null whenever the
 * passage is not a parseable schedule or no column clearly repeats. */
export interface ScheduleRow {
	date: number;
	dateIso: string;
	amounts: string[];
}

/** Parse `rank date amount…` schedule rows out of a passage. */
export function parseScheduleRows(text: string): ScheduleRow[] {
	const rows: ScheduleRow[] = [];
	for (const line of text.split('\n')) {
		const match = SCHEDULE_ROW_PATTERN.exec(line);
		if (!match) continue;
		const [, , date, amountBlob] = match;
		const dateMatch = /(\d{2})[./](\d{2})[./](\d{4})/u.exec(date)!;
		rows.push({
			date: Number(dateMatch[3]) * 10000 + Number(dateMatch[2]) * 100 + Number(dateMatch[1]),
			dateIso: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
			// Amount-shaped tokenization: French thousands are space-separated
			// ("12 345,67"), so splitting on spaces would shear every large value.
			amounts: [...amountBlob.matchAll(/\d[\d  ]*,\d{2}/gu)].map((value) => value[0])
		});
	}
	return rows;
}

/** The installment column of a schedule: the one whose value repeats across
 * rows (a constant payment plan), while balances and interest drift row by
 * row. Null when rows disagree on width or no column clearly repeats. */
export function scheduleInstallmentColumn(rows: ScheduleRow[]): number | null {
	if (rows.length < 3) return null;
	const width = rows[0].amounts.length;
	if (width < 2 || !rows.every((row) => row.amounts.length === width)) return null;
	let installmentColumn = -1;
	let bestRepetition = 0;
	for (let column = 0; column < width; column++) {
		const counts = new Map<string, number>();
		for (const row of rows) {
			counts.set(row.amounts[column], (counts.get(row.amounts[column]) ?? 0) + 1);
		}
		const mode = Math.max(...counts.values());
		if (mode > bestRepetition) {
			bestRepetition = mode;
			installmentColumn = column;
		}
	}
	// The installment column must actually repeat; balances never do.
	if (bestRepetition < Math.ceil(rows.length * 0.6)) return null;
	return installmentColumn;
}

export function ordinalScheduleValue(query: string, text: string): { literal: string } | null {
	const direction = ordinalPaymentDirection(query);
	if (!direction) return null;
	const rows = parseScheduleRows(text);
	const installmentColumn = scheduleInstallmentColumn(rows);
	if (installmentColumn === null) return null;
	const extremeRow = rows.reduce((best, row) =>
		direction === 'first' ? (row.date < best.date ? row : best) : row.date > best.date ? row : best
	);
	return { literal: extremeRow.amounts[installmentColumn] };
}

// --- who holds a role -----------------------------------------------------
//
// "Qui est le directeur d'agence ?" is answered by a person, and the letter
// that answers it is built to defeat overlap scoring: the letterhead and the
// legal footer both carry the role's own words ("Agence", "Directeur"), while
// the signature block writes a bare name above a bare role line and shares
// nothing with the question. Vocabulary below is French/English company forms
// and interrogatives — never a document's own strings.

const PERSON_ROLE_ASKED =
	/\b(?:qui\s+(?:est|sont|sera|serait|occupe|dirige|signe)|who\s+(?:is|are|heads|leads|signs))\b/iu;

/** Words that mark an organisation rather than a person. */
const ORGANISATION_TOKEN =
	/\b(?:societe|caisse|banque|credit|mutuel(?:le)?|assurances?|groupe|agence|cabinet|etablissement|sarl|selarl|sasu?|eurl|sci|scp|rcs|siren|siret|france)\b/iu;

/** Corporate boilerplate openers: where a letter's legal footer begins when the
 * parser glued it onto the line above ("Votre Directeur d'Agence Caisse
 * Régionale de …"). */
const CORPORATE_BOILERPLATE =
	/\b(?:soci[eé]t[eé]|caisse|banque|s\.?\s?a\.?\s?r\.?\s?l|selarl|s\.?\s?a\.?\s?s|e\.?\s?u\.?\s?r\.?\s?l|s\.?\s?c\.?\s?i|rcs|siren|siret|capital|immatricul\w*|si[eè]ge\s+social)\b/iu;

/** The short head of a line whose tail is corporate boilerplate, or null when
 * the line does not divide that way. */
export function roleHeadOf(line: string): string | null {
	const match = CORPORATE_BOILERPLATE.exec(line);
	if (!match || match.index < 4) return null;
	const head = line
		.slice(0, match.index)
		.replace(/[\s,;·–—-]+$/u, '')
		.trim();
	const words = head.split(/\s+/u).filter(Boolean);
	if (words.length < 2 || words.length > 8) return null;
	if (/\d/u.test(head) || /[.!?»:]\s*$/u.test(head)) return null;
	return head;
}

/** Honorifics a letter puts before a name; part of the name's shape, not of
 * the name itself. */
const HONORIFIC = /^(?:m\.|mr\.?|mme|mlle|dr\.?|me|ma[iî]tre|monsieur|madame|mademoiselle)\s+/iu;

/** Does this line read as a person's name? An optional honorific, then two to
 * four capitalised words, no digits or punctuation, none of them a
 * company-form word. Particles stay lowercase in French names, so they are
 * allowed through unchanged. */
function isPersonNameLine(line: string): boolean {
	const text = line.trim().replace(HONORIFIC, '');
	if (/\d|[:;,!?()«»]/u.test(text)) return false;
	const words = text.split(/\s+/u).filter(Boolean);
	if (words.length < 2 || words.length > 4) return false;
	if (ORGANISATION_TOKEN.test(normalizeForFuzzy(text))) return false;
	return words.every(
		(word) =>
			/^(?:d'|l'|d’|l’)?\p{Lu}[\p{L}'’-]*$/u.test(word) || /^(?:de|du|des|le|la)$/iu.test(word)
	);
}

/** Content words of the role the question asks about ("directeur", "agence"),
 * or [] when the question does not ask who holds a role. */
function requestedRoleTokens(query: string): string[] {
	const normalized = normalizeForFuzzy(query);
	const asked = PERSON_ROLE_ASKED.exec(normalized);
	if (!asked) return [];
	const tail = normalized
		.slice(asked.index + asked[0].length)
		.split(/\bet\b|[?.]/u, 1)[0]
		.trim();
	return tail.split(/\s+/u).filter((word) => word.length >= 4);
}

/** Capitalised runs of a line that read as person names — an honorific, then
 * two to four capitalised words. */
function personRunsIn(line: string): string[] {
	const runs =
		line.match(
			/(?:\p{Lu}[\p{L}'’-]+|\p{Lu}{2,})(?:\s+(?:(?:de|du|des|le|la)\s+)?(?:\p{Lu}[\p{L}'’-]+|\p{Lu}{2,})){1,3}/gu
		) ?? [];
	return runs.filter((run) => isPersonNameLine(run));
}

/**
 * The person a passage names directly beside the requested role, or null.
 *
 * One recogniser for the whole signature-block family rather than the one
 * letter that surfaced it: name above the role, role above the name, both on
 * one line joined by a comma, a colon or a copula ("AMELIE ROUSSEAU, Votre
 * Directeur d'Agence", "Directeur d'agence : Paul Vasseur", "Le directeur est
 * Paul Vasseur"), a role line the parser glued onto the legal footer, and an
 * honorific before the name. The same shapes identity-evidence.ts binds for
 * deed parties, generalised to any role the question names.
 *
 * A run overlapping the role's own words ("Votre Directeur") is never a
 * person: the role names the seat, the carrier must name who sits in it. Used
 * as the trigger for a targeted correction, so it must only ever fire on a
 * demonstrated carrier.
 */
export function personRoleCarrier(query: string, text: string): string | null {
	const roleTokens = requestedRoleTokens(query);
	if (!roleTokens.length) return null;
	const lines = text
		.split(/\n+/u)
		.map((line) => line.trim())
		.filter(Boolean);
	const isRoleLine = (line: string): boolean => {
		const candidate =
			line.split(/\s+/u).filter(Boolean).length > 8 ? (roleHeadOf(line) ?? line) : line;
		const normalized = normalizeForFuzzy(candidate);
		return roleTokens.every((token) => normalized.includes(token));
	};
	const outsideRole = (run: string): boolean => {
		const words = normalizeForFuzzy(run).split(/\s+/u);
		return !words.some((word) => roleTokens.includes(word));
	};
	for (const [index, line] of lines.entries()) {
		if (!isRoleLine(line)) continue;
		// The name on the role's own line, whatever joins them.
		const inline = personRunsIn(line).find(outsideRole);
		if (inline) return inline.trim();
		for (const neighbour of [lines[index - 1], lines[index + 1]]) {
			if (!neighbour) continue;
			if (isPersonNameLine(neighbour)) return neighbour.trim();
			// A neighbour carrying an honorific plus trailing matter ("M. Paul
			// Vasseur, par délégation") still names its person.
			const run = personRunsIn(neighbour).find(outsideRole);
			if (run) return run.trim();
		}
	}
	return null;
}

/** Person-shaped names an answer states. Empty when the draft answered a
 * who-question with an organisation, a branch or a letterhead. */
export function personAnswerNames(text: string): string[] {
	const runs =
		text.match(
			/(?:\p{Lu}[\p{L}'’-]+|\p{Lu}{2,})(?:\s+(?:(?:de|du|des|le|la)\s+)?(?:\p{Lu}[\p{L}'’-]+|\p{Lu}{2,})){1,3}/gu
		) ?? [];
	return runs.filter((run) => isPersonNameLine(run));
}

/** Deterministic answer-shape signal, deliberately limited to explicit numeric
 * structure. It is a reranking feature, not a domain or intent classifier. */
export function numericAnswerEvidenceCoverage(query: string, text: string): number {
	const normalizedQuery = normalizeForFuzzy(query);
	const kinds = requestedNumericKinds(normalizedQuery);
	if (!kinds.length) return 0;
	const normalizedText = normalizeForFuzzy(text);
	const valuePatterns: Record<NumericAnswerKind, RegExp> = {
		duration:
			/(?:(?:\d[\d\s.,]*\)?\s*(?:\([^)]*\)\s*)?)|(?:un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+)(?:ans?\b|ann[eé]es?\b|jours?\b|mois\b|years?\b|months?\b|days?\b|hours?\b|heures?\b)/iu,
		money: /(?:\d[\d\s.,]*\s*(?:€|eur\b|euros?\b|usd\b|dollars?\b))|(?:(?:€|eur\b|usd\b)\s*\d)/iu,
		percentage: /\d[\d\s.,]*\s*%/u,
		area: /\d[\d\s.,]*\s*(?:m2\b|m²\b|ca\b|hectares?\b|sq\.?\s*ft\b)/iu,
		count: /\b\d[\d\s.,]*\b/u,
		generic:
			/(?:\d[\d\s.,]*\s*(?:€|eur\b|%|m2\b|m²\b|km\b|cv\b|ans?\b|ann[eé]es?\b|jours?\b|mois\b|years?\b|months?\b|days?\b))|(?:(?:€|eur\b)\s*\d)/iu
	};
	const matchedKinds = kinds.filter((kind) => valuePatterns[kind].test(text));
	if (!matchedKinds.length) return 0;
	const queryNumbers = normalizedQuery.match(/\b\d[\d ]*\b/g) ?? [];
	const kindCoverage = matchedKinds.length / kinds.length;
	if (!queryNumbers.length) return kindCoverage;
	const textDigits = normalizedText.replace(/\D/g, '');
	return (
		kindCoverage *
		(queryNumbers.some((value) => textDigits.includes(value.replace(/\D/g, ''))) ? 1 : 0.6)
	);
}

/** Remove only interrogative/measurement scaffolding before comparing the
 * requested slot subject with a passage. This prevents a heading such as
 * “how long do we retain data?” from winning a question about how long an old
 * address remains insured merely because both contain “how long”. */
function numericScopeCoverage(query: string, text: string): number {
	const scopeQuery = normalizeForFuzzy(query)
		.replace(/\b(?:combien de temps|pendant combien|how long|duree|duration)\b/gu, ' ')
		.replace(/\b(?:jusqu a quel montant|quel montant|how much|amount)\b/gu, ' ')
		.replace(/\b(?:combien|quelle?|quels?|quelles?|what|how|many|much|long)\b/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!scopeQuery) return 0;
	return Math.max(
		queryCoverage(scopeQuery, text),
		fuzzyQueryCoverage(scopeQuery, text),
		stemmedQueryCoverage(scopeQuery, text)
	);
}

const CONSTRAINT_MARKERS: RegExp[][] = [
	[/\b(?:plus de|more than|over)\b/u],
	[/\b(?:moins de|less than|under)\b/u],
	[/\b(?:au moins|at least)\b/u],
	[/\b(?:au plus|at most)\b/u],
	[/\b(?:avant|before)\b/u],
	[/\b(?:apres|after)\b/u]
];

/** Exact user-supplied numbers are constraints, not ordinary bag-of-words.
 * Preserve them even when a neighboring passage has stronger generic prose. */
export function numericConstraintEvidenceCoverage(query: string, text: string): number {
	const normalizedQuery = normalizeForFuzzy(query);
	const queryNumbers = normalizedQuery.match(/\b\d+(?:[.,]\d+)?\b/gu) ?? [];
	if (!queryNumbers.length) return 0;
	const normalizedText = normalizeForFuzzy(text);
	if (!queryNumbers.every((number) => normalizedText.includes(number))) return 0;
	const requestedMarkers = CONSTRAINT_MARKERS.filter((alternatives) =>
		alternatives.some((pattern) => pattern.test(normalizedQuery))
	);
	if (!requestedMarkers.length) return 1;
	const matchedMarkers = requestedMarkers.filter((alternatives) =>
		alternatives.some((pattern) => pattern.test(normalizedText))
	).length;
	return 0.7 + (matchedMarkers / requestedMarkers.length) * 0.3;
}

/** Reward evidence that covers several independent clauses in one coherent
 * window. This is query-compositional and does not depend on document domains. */
export function multiClauseEvidenceCoverage(
	query: string,
	text: string,
	route = analyzeQuestion(query.split('\n', 1)[0]).route
): number {
	const originalQuery = query.split('\n', 1)[0];
	if (route !== 'synthesis') return 0;
	const clauses = splitQueryClauses(originalQuery);
	if (clauses.length <= 1) return 0;
	const covered = clauses.filter(
		(clause) =>
			Math.max(
				queryCoverage(clause, text),
				fuzzyQueryCoverage(clause, text),
				stemmedQueryCoverage(clause, text)
			) >= 0.2
	).length;
	return covered / clauses.length;
}

function textSimilarity(a: string, b: string): number {
	const left = new Set(terms(a));
	const right = new Set(terms(b));
	if (!left.size || !right.size) return 0;
	let overlap = 0;
	for (const term of left) if (right.has(term)) overlap++;
	return overlap / Math.min(left.size, right.size);
}

/** Fuse already-scoped candidates while preserving raw component scores. */
export function fuseCandidates(
	semantic: SearchHit[],
	lexical: SearchHit[],
	topK = 8,
	fuzzy: SearchHit[] = []
): SearchHit[] {
	const fused = new Map<number, SearchHit>();
	for (const [source, hits] of [
		['semantic', semantic],
		['lexical', lexical],
		['fuzzy', fuzzy]
	] as const) {
		for (let i = 0; i < hits.length; i++) {
			const hit = hits[i];
			const current = fused.get(hit.chunkId) ?? {
				...hit,
				score: 0,
				semanticScore: null,
				lexicalScore: null,
				fuzzyScore: null
			};
			current.score += 1 / (RRF_K + i + 1);
			if (source === 'semantic') current.semanticScore = hit.semanticScore ?? hit.score;
			else if (source === 'lexical') current.lexicalScore = hit.lexicalScore ?? hit.score;
			else current.fuzzyScore = hit.fuzzyScore ?? hit.score;
			fused.set(hit.chunkId, current);
		}
	}
	return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

/** Rank broad hybrid candidates using evidence already available in-browser. */
export function refineCandidates(
	semantic: SearchHit[],
	lexical: SearchHit[],
	query: string,
	topK = 16,
	fuzzy: SearchHit[] = [],
	route = analyzeQuestion(query.split('\n', 1)[0]).route
): SearchHit[] {
	const fused = fuseCandidates(semantic, lexical, Math.max(RERANK_CANDIDATE_LIMIT, topK), fuzzy);
	const scopeCoverageFor = (hit: SearchHit) => {
		const candidate = `${hit.documentName}\n${hit.headingPath ?? ''}\n${hit.text}`;
		return Math.max(
			queryCoverage(query, candidate),
			fuzzyQueryCoverage(query, candidate),
			stemmedQueryCoverage(query, candidate)
		);
	};
	const scored = fused
		.map((hit) => {
			const candidate = `${hit.documentName}\n${hit.headingPath ?? ''}\n${hit.text}`;
			const exactCoverage = queryCoverage(query, candidate);
			const approximateCoverage = fuzzyQueryCoverage(query, candidate);
			const phraseCoverage = phraseQueryCoverage(query, candidate);
			const scopeCoverage = scopeCoverageFor(hit);
			const headingCoverage = hit.headingPath ? queryCoverage(query, hit.headingPath) : 0;
			const identityCoverage = partyIdentityCoverage(query, candidate);
			const openIdentityCoverage = identityEvidenceCoverage(query, hit.text);
			const entityCoverage = properNameCoverage(query, candidate);
			const temporalCoverage = temporalEvidenceCoverage(query, hit.text);
			const enumerationCoverage = enumerationEvidenceCoverage(query, hit.text);
			const numericCoverage = numericAnswerEvidenceCoverage(query, hit.text);
			const numericLabelCoverage = numericLabelEvidenceCoverage(query, candidate);
			const numericRelationCoverage = numericLabelValueProximityCoverage(query, candidate);
			const constraintCoverage = numericConstraintEvidenceCoverage(query, candidate);
			const multiClauseCoverage = multiClauseEvidenceCoverage(query, candidate, route);
			return {
				...hit,
				evidenceUtility: Math.max(
					scopeCoverage,
					phraseCoverage,
					entityCoverage,
					identityCoverage,
					openIdentityCoverage,
					temporalCoverage,
					enumerationCoverage * scopeCoverage,
					numericCoverage * Math.max(scopeCoverage, 0.2),
					numericRelationCoverage,
					constraintCoverage,
					multiClauseCoverage
				),
				score:
					(hit.score +
						exactCoverage * 0.008 +
						phraseCoverage * 0.04 +
						headingCoverage * 0.02 +
						approximateCoverage * 0.03 +
						entityCoverage * 0.08 +
						identityCoverage * 0.04 +
						openIdentityCoverage * 0.08 +
						temporalCoverage * 0.08 +
						enumerationCoverage * scopeCoverage * 0.1 +
						numericCoverage * 0.08 +
						numericLabelCoverage * 0.08 +
						numericRelationCoverage * 0.16 +
						constraintCoverage * 0.12 +
						multiClauseCoverage * 0.08) *
					identifierCompatibility(query, candidate)
			};
		})
		.sort((a, b) => b.score - a.score);
	const scoredByChunk = new Map(scored.map((hit) => [hit.chunkId, hit]));
	// RRF agreement is valuable, but it must not erase a passage that one
	// independent retriever ranks as the best grounded evidence. Preserve at
	// most one high-utility leader per channel, then let the common reranker and
	// evidence budget apply normally. This is analogous to candidate-pool union
	// before a second-stage ranker, not a channel-specific answer rule.
	const evidenceLeaderUtilities = new Map(
		[semantic, lexical, fuzzy].flatMap((channel) => {
			const leader = channel
				.map((hit) => scoredByChunk.get(hit.chunkId))
				.filter(
					(hit): hit is (typeof scored)[number] => hit !== undefined && hit.evidenceUtility >= 0.35
				)
				.sort(
					(left, right) => right.evidenceUtility - left.evidenceUtility || right.score - left.score
				)[0];
			return leader ? [[leader.chunkId, leader.evidenceUtility] as const] : [];
		})
	);
	const rescored = scored
		.map((hit) => {
			const leaderUtility = evidenceLeaderUtilities.get(hit.chunkId);
			return leaderUtility === undefined
				? hit
				: { ...hit, score: hit.score + leaderUtility * 0.16 };
		})
		.sort((left, right) => right.score - left.score);
	const rescoredByChunk = new Map(rescored.map((hit) => [hit.chunkId, hit]));
	const numericScopeByChunk = new Map(
		rescored.map((hit) => [
			hit.chunkId,
			Math.max(
				numericScopeCoverage(query, `${hit.headingPath ?? ''}\n${hit.text}`),
				numericLabelValueProximityCoverage(query, hit.text)
			)
		])
	);
	const numericEvidenceByChunk = new Map(
		rescored.map((hit) => [hit.chunkId, numericAnswerEvidenceCoverage(query, hit.text)])
	);
	const numericScopeCoverageFor = (hit: SearchHit) => numericScopeByChunk.get(hit.chunkId) ?? 0;
	const channelNumericLeaders = isNumericAnswerQuestion(query)
		? [semantic, lexical, fuzzy]
				.flatMap((channel) => {
					const typed = channel
						.map((hit) => rescoredByChunk.get(hit.chunkId))
						.filter(
							(hit): hit is (typeof rescored)[number] =>
								hit !== undefined && (numericEvidenceByChunk.get(hit.chunkId) ?? 0) > 0
						)
						.sort(
							(left, right) =>
								numericScopeCoverageFor(right) - numericScopeCoverageFor(left) ||
								right.score - left.score
						);
					return typed.slice(0, 1);
				})
				.filter(
					(hit, index, all) =>
						all.findIndex((candidate) => candidate.chunkId === hit.chunkId) === index
				)
				.sort(
					(left, right) =>
						numericScopeCoverageFor(right) - numericScopeCoverageFor(left) ||
						right.score - left.score
				)
		: [];
	// Expected-answer-type restriction for contact atoms, the same partition the
	// numeric leaders above apply. A question naming an email, phone or URL is
	// answered by a passage that CARRIES one; a passage that merely echoes the
	// question's wording ("the email address used for this request") maximises
	// every overlap feature while containing no answer, and term-overlap scoring
	// is monotone in that overlap, so no reweighting can invert the pair.
	// Fails safe: when nothing carries the type this list is empty and the
	// ordinary ranking stands, so a mis-typed question is never made worse.
	// Capped like the numeric leaders above: the point is to put a carrier where
	// the ranking would have buried it, not to hand the whole head of the list to
	// every chunk whose footer happens to hold a phone number.
	const contactLeaders = rescored
		.filter((hit) => contactAnswerEvidenceCoverage(query, hit.text) > 0)
		.sort((left, right) => right.score - left.score)
		.slice(0, 3);
	return [...contactLeaders, ...channelNumericLeaders, ...rescored]
		.filter(
			(hit, index, all) => all.findIndex((candidate) => candidate.chunkId === hit.chunkId) === index
		)
		.slice(0, topK);
}

/** Parents improve coarse recall for split forms/tables, then disappear. Their
 * score promotes precise children from the same structural section. */
export function expandStructuralParents(
	ranked: SearchHit[],
	children: SearchHit[],
	query: string,
	limit = 24
): SearchHit[] {
	const parents = new Map(
		ranked.filter((hit) => hit.paraIndex === -1).map((hit) => [hit.chunkId, hit])
	);
	const candidates = new Map<number, SearchHit>();
	for (const hit of ranked) {
		if (hit.paraIndex !== -1) candidates.set(hit.chunkId, hit);
	}
	for (const child of children) {
		const parent = child.parentChunkId === undefined ? undefined : parents.get(child.parentChunkId);
		if (!parent) continue;
		const candidate = `${child.headingPath ?? ''}\n${child.text}`;
		const promoted = {
			...child,
			score:
				parent.score * 0.9 +
				queryCoverage(query, candidate) * 0.008 +
				fuzzyQueryCoverage(query, candidate) * 0.03
		};
		const previous = candidates.get(child.chunkId);
		if (!previous || promoted.score > previous.score) candidates.set(child.chunkId, promoted);
	}
	return [...candidates.values()].sort((left, right) => right.score - left.score).slice(0, limit);
}

/** Add only useful immediate context, then control duplicate/page-heavy output. */
export function selectWithNeighbors(
	ranked: SearchHit[],
	neighbors: SearchHit[],
	query: string,
	topK = 8,
	route = analyzeQuestion(query).route,
	debug?: Record<string, unknown>
): SearchHit[] {
	const preserveRecordPages = route === 'aggregate';
	const maxNeighborDistance =
		analyzeQuestion(query).answerShape === 'explanation' ? 8 : route === 'synthesis' ? 8 : 1;
	const maxPassagesPerLocation =
		route === 'synthesis' ? 6 : analyzeQuestion(query).answerShape === 'explanation' ? 6 : 4;
	const candidates = new Map(ranked.map((hit) => [hit.chunkId, hit]));
	for (const neighbor of neighbors) {
		if (candidates.has(neighbor.chunkId) || neighbor.seq === undefined) continue;
		const anchor = ranked.find(
			(hit) =>
				hit.documentId === neighbor.documentId &&
				hit.seq !== undefined &&
				Math.abs(hit.seq - neighbor.seq!) >= 1 &&
				Math.abs(hit.seq - neighbor.seq!) <= maxNeighborDistance
		);
		const coverage = queryCoverage(query, neighbor.text);
		const fuzzyCoverage = fuzzyQueryCoverage(query, neighbor.text);
		if (!anchor) continue;
		candidates.set(neighbor.chunkId, {
			...neighbor,
			score:
				(anchor.score * (coverage > 0 || fuzzyCoverage > 0 ? 0.55 : 0.45)) /
					Math.abs((anchor.seq ?? neighbor.seq) - neighbor.seq) +
				coverage * 0.008 +
				fuzzyCoverage * 0.02
		});
	}

	const selected: SearchHit[] = [];
	let selectedChars = 0;
	const pageCounts = new Map<string, number>();
	const sorted = [...candidates.values()].sort((a, b) => b.score - a.score);
	const documentLeaders = sorted.filter(
		(hit, index) =>
			sorted.findIndex((candidate) => candidate.documentId === hit.documentId) === index
	);
	const analysisByChunk = new Map(
		sorted.map((hit) => {
			const candidate = `${hit.headingPath ?? ''}\n${hit.text}`;
			return [
				hit.chunkId,
				{
					named: properNameCoverage(query, `${hit.documentName}\n${candidate}`) > 0,
					identity: identityEvidenceCoverage(query, hit.text),
					temporal: temporalEvidenceCoverage(query, hit.text),
					constraint: numericConstraintEvidenceCoverage(query, hit.text),
					numeric: numericAnswerEvidenceCoverage(query, hit.text),
					numericScope: numericScopeCoverage(query, candidate),
					contact: contactAnswerEvidenceCoverage(query, hit.text),
					labelProximity: numericLabelValueProximityCoverage(query, hit.text),
					coherent: multiClauseEvidenceCoverage(query, candidate, route) === 1
				}
			] as const;
		})
	);
	const namedEntityCandidates = sorted.filter((hit) => analysisByChunk.get(hit.chunkId)!.named);
	const identityCandidates = sorted
		.filter((hit) => analysisByChunk.get(hit.chunkId)!.identity > 0)
		.sort(
			(left, right) =>
				analysisByChunk.get(right.chunkId)!.identity -
					analysisByChunk.get(left.chunkId)!.identity || right.score - left.score
		);
	const temporalEvidenceCandidates = sorted
		.filter((hit) => analysisByChunk.get(hit.chunkId)!.temporal > 0)
		.sort(
			(left, right) =>
				analysisByChunk.get(right.chunkId)!.temporal -
					analysisByChunk.get(left.chunkId)!.temporal || right.score - left.score
		);
	const constraintCandidates = sorted
		.filter((hit) => analysisByChunk.get(hit.chunkId)!.constraint > 0)
		.sort(
			(left, right) =>
				analysisByChunk.get(right.chunkId)!.constraint -
					analysisByChunk.get(left.chunkId)!.constraint || right.score - left.score
		);
	const numericEvidenceCandidates = sorted
		.filter((hit) => analysisByChunk.get(hit.chunkId)!.numeric > 0)
		.sort(
			(left, right) =>
				analysisByChunk.get(right.chunkId)!.numeric - analysisByChunk.get(left.chunkId)!.numeric ||
				analysisByChunk.get(right.chunkId)!.labelProximity -
					analysisByChunk.get(left.chunkId)!.labelProximity ||
				analysisByChunk.get(right.chunkId)!.numericScope -
					analysisByChunk.get(left.chunkId)!.numericScope ||
				right.score - left.score
		);
	// Second half of the expected-answer-type partition applied in refineCandidates.
	// That ordering is rebuilt from raw score here, so the restriction has to be
	// restated: a question naming an email, phone or URL is answered by a passage
	// that CARRIES one, and a passage echoing the question's wording outscores the
	// carrier on every overlap feature. Empty unless the question names a contact
	// atom AND a candidate carries it, so ordinary ranking is untouched otherwise.
	// Capped for the same reason as its counterpart in refineCandidates: it sits
	// at the head of both order branches, so an uncapped list could claim the
	// whole evidence budget on any document with a phone number in its footer.
	const contactEvidenceCandidates = sorted
		.filter((hit) => analysisByChunk.get(hit.chunkId)!.contact > 0)
		.slice(0, 3);
	const coherentCandidates = sorted.filter((hit) => analysisByChunk.get(hit.chunkId)!.coherent);
	const answerShape = analyzeQuestion(query).answerShape;
	const contextUtility = (hit: SearchHit) => {
		const candidate = `${hit.headingPath ?? ''}\n${hit.text}`;
		const analysis = analysisByChunk.get(hit.chunkId)!;
		return (
			Math.max(
				queryCoverage(query, candidate),
				fuzzyQueryCoverage(query, candidate),
				stemmedQueryCoverage(query, candidate)
			) +
			phraseQueryCoverage(query, candidate) * 0.75 +
			(analysis.coherent ? 0.5 : 0) +
			analysis.constraint * 2 +
			analysis.labelProximity * 0.4 +
			analysis.numericScope +
			analysis.temporal * 0.15
		);
	};
	// A precise answer may only exist in a child promoted from a structural parent.
	// Let those children compete for the best evidence window too; restricting the
	// anchor to the initial ranking drops split list values and form answers.
	const contextPool = sorted
		.filter((hit) => hit.paraIndex !== -1 && hit.seq !== undefined)
		.slice(0, 64);
	const contextWindowUtility = (anchor: SearchHit) => {
		const window = sorted
			.filter(
				(hit) =>
					hit.paraIndex !== -1 &&
					hit.documentId === anchor.documentId &&
					hit.seq !== undefined &&
					anchor.seq !== undefined &&
					Math.abs(hit.seq - anchor.seq) <= maxNeighborDistance
			)
			.sort((left, right) => Math.abs(left.seq! - anchor.seq!) - Math.abs(right.seq! - anchor.seq!))
			.slice(0, 12);
		const text = window.map((hit) => `${hit.headingPath ?? ''}\n${hit.text}`).join('\n');
		return (
			Math.max(
				queryCoverage(query, text),
				fuzzyQueryCoverage(query, text),
				stemmedQueryCoverage(query, text)
			) +
			phraseQueryCoverage(query, text) * 0.75 +
			multiClauseEvidenceCoverage(query, text, route) +
			numericConstraintEvidenceCoverage(query, text) * 2 +
			numericScopeCoverage(query, text) +
			numericAnswerEvidenceCoverage(query, text) * 0.35
		);
	};
	const contextWindowUtilities = new Map(
		contextPool.map((hit) => [hit.chunkId, contextWindowUtility(hit)])
	);
	const contextAnchor =
		answerShape === 'explanation' || route === 'synthesis'
			? [...contextPool].sort(
					(left, right) =>
						(contextWindowUtilities.get(right.chunkId) ?? 0) -
							(contextWindowUtilities.get(left.chunkId) ?? 0) ||
						contextUtility(right) - contextUtility(left) ||
						right.score - left.score
				)[0]
			: undefined;
	const scopedEvidenceCandidates = [...sorted]
		.sort((left, right) => contextUtility(right) - contextUtility(left) || right.score - left.score)
		.slice(0, 2);
	// Explanations often span a lead passage and a following condition. Preserve a
	// small, substantial window around the best passage before numeric lookalikes
	// consume the generator's bounded context.
	const contextualWindowCandidates = contextAnchor
		? sorted
				.filter(
					(hit) =>
						hit.paraIndex !== -1 &&
						hit.documentId === contextAnchor.documentId &&
						hit.seq !== undefined &&
						Math.abs(hit.seq - contextAnchor.seq!) <= maxNeighborDistance &&
						(hit.chunkId === contextAnchor.chunkId ||
							hit.text.trim().length >= 140 ||
							(hit.seq !== undefined &&
								contextAnchor.seq !== undefined &&
								Math.abs(hit.seq - contextAnchor.seq) <= 1) ||
							/^(?:ce|cet|cette|ces|seulement|si|lorsque|apres|avant|toutefois|mais|oui|non)\b/u.test(
								normalizeForFuzzy(hit.text)
							)) &&
						(answerShape === 'explanation' ||
							route === 'synthesis' ||
							hit.chunkId === contextAnchor.chunkId ||
							Math.max(
								queryCoverage(query, `${hit.headingPath ?? ''}\n${hit.text}`),
								fuzzyQueryCoverage(query, `${hit.headingPath ?? ''}\n${hit.text}`),
								stemmedQueryCoverage(query, `${hit.headingPath ?? ''}\n${hit.text}`)
							) >= 0.2)
				)
				.sort((left, right) => {
					if (left.chunkId === contextAnchor.chunkId) return -1;
					if (right.chunkId === contextAnchor.chunkId) return 1;
					if (route === 'synthesis') {
						const byUtility = contextUtility(right) - contextUtility(left);
						if (byUtility !== 0) return byUtility;
					}
					return (
						Math.abs(left.seq! - contextAnchor.seq!) - Math.abs(right.seq! - contextAnchor.seq!) ||
						right.text.length - left.text.length ||
						right.score - left.score
					);
				})
				.slice(0, answerShape === 'explanation' || route === 'synthesis' ? 4 : 2)
		: [];
	const continuationCue = (hit: SearchHit) =>
		/^(?:ce|cet|cette|ces|seulement|si|lorsque|apres|avant|toutefois|mais|oui|non)\b/u.test(
			normalizeForFuzzy(hit.text)
		);
	// A global best window can land on a concise summary. For explanations with
	// explicit user constraints, preserve one local continuation around each of
	// the two strongest constraint-bearing passages instead of opening another
	// broad topical window.
	const gapContinuationCandidates =
		answerShape === 'explanation' && route !== 'synthesis'
			? [...constraintCandidates, ...scopedEvidenceCandidates]
					.filter(
						(hit, index, all) =>
							all.findIndex((candidate) => candidate.chunkId === hit.chunkId) === index
					)
					.slice(0, 2)
					.flatMap((anchor) =>
						sorted
							.filter(
								(hit) =>
									hit.paraIndex !== -1 &&
									hit.chunkId !== anchor.chunkId &&
									hit.documentId === anchor.documentId &&
									hit.seq !== undefined &&
									anchor.seq !== undefined &&
									Math.abs(hit.seq - anchor.seq) <= 2 &&
									(continuationCue(hit) || hit.text.trim().length >= 140)
							)
							.sort(
								(left, right) =>
									Number(continuationCue(right)) - Number(continuationCue(left)) ||
									Number(right.seq! > anchor.seq!) - Number(left.seq! > anchor.seq!) ||
									Math.abs(left.seq! - anchor.seq!) - Math.abs(right.seq! - anchor.seq!)
							)
							.slice(0, 1)
					)
			: [];
	// Ordinal over a dated payment series: rank the rows by their extreme date
	// and let the true first/last row claim a slot. List-level on purpose — no
	// per-chunk feature can know which date is the series' minimum.
	const ordinalDirection = ordinalPaymentDirection(query);
	const ordinalSeriesCandidates = ordinalDirection
		? sorted
				.filter((hit) => hit.paraIndex !== -1)
				.map((hit) => ({ hit, extreme: extremeSeriesDate(hit.text, ordinalDirection) }))
				.filter((entry): entry is { hit: SearchHit; extreme: number } => entry.extreme !== null)
				.sort((left, right) =>
					ordinalDirection === 'first' ? left.extreme - right.extreme : right.extreme - left.extreme
				)
				.slice(0, 2)
				.map((entry) => entry.hit)
		: [];
	const clauses = splitQueryClauses(query.split('\n', 1)[0]);
	const clauseLeaders = clauses.flatMap((clause) => {
		const leaders = [...sorted]
			.map((hit) => {
				const candidate = `${hit.headingPath ?? ''}\n${hit.text}`;
				const coverage = Math.max(
					queryCoverage(clause, `${hit.headingPath ?? ''}\n${hit.text}`),
					fuzzyQueryCoverage(clause, `${hit.headingPath ?? ''}\n${hit.text}`),
					stemmedQueryCoverage(clause, `${hit.headingPath ?? ''}\n${hit.text}`)
				);
				const typedEvidence = Math.max(
					temporalEvidenceCoverage(clause, hit.text) * Math.max(coverage, 0.25),
					numericAnswerEvidenceCoverage(clause, hit.text) *
						Math.max(
							numericScopeCoverage(clause, candidate),
							numericLabelValueProximityCoverage(clause, hit.text),
							0.25
						),
					identityEvidenceCoverage(clause, hit.text) * Math.max(coverage, 0.25)
				);
				return { hit, coverage, typedEvidence, utility: coverage + typedEvidence * 0.75 };
			})
			.sort((left, right) => right.utility - left.utility || right.hit.score - left.hit.score);
		const chosen = leaders
			.filter((leader) => leader.coverage >= 0.2 || leader.typedEvidence >= 0.25)
			.slice(0, route === 'synthesis' ? 2 : 1);
		// Guaranteed typed slot (the per-sub-question floor every decomposition
		// system applies): when the clause asks for a numeric value and none of
		// the lexical winners carries one, the amounts never reach the excerpts —
		// the carrier for "les trois grands plafonds biens" says "affaires …
		// 40 000 €" and shares not one word with the clause. The lexical filter
		// may shape ordering; it must never veto the only value-bearing candidate.
		if (
			isNumericAnswerQuestion(clause) &&
			!chosen.some((leader) => numericAnswerEvidenceCoverage(clause, leader.hit.text) > 0)
		) {
			const carrier = leaders.find(
				(leader) => numericAnswerEvidenceCoverage(clause, leader.hit.text) > 0
			);
			if (carrier) chosen.push(carrier);
		}
		return chosen.map((leader) => leader.hit);
	});
	const scenarioScopedEvidenceCandidates =
		/\b(?:couvert\w*|assure\w*|eligible|autorise\w*|permis|covered|insured|allowed)\b/u.test(
			normalizeForFuzzy(query)
		)
			? scopedEvidenceCandidates
			: [];
	const scenarioContinuationCandidates = scenarioScopedEvidenceCandidates.flatMap((anchor) => {
		if (/[.!?;:]$/u.test(anchor.text.trim()) || anchor.seq === undefined) return [];
		const continuation = sorted.find(
			(hit) =>
				hit.documentId === anchor.documentId && hit.seq !== undefined && hit.seq === anchor.seq! + 1
		);
		return continuation ? [continuation] : [];
	});
	const incompleteContinuationCandidates = [...coherentCandidates, ...scopedEvidenceCandidates]
		.filter(
			(hit, index, all) =>
				hit.seq !== undefined &&
				!/[.!?;:]$/u.test(hit.text.trim()) &&
				all.findIndex((candidate) => candidate.chunkId === hit.chunkId) === index
		)
		.slice(0, 2)
		.flatMap((anchor) => {
			const continuation = sorted.find(
				(hit) =>
					hit.documentId === anchor.documentId &&
					hit.seq !== undefined &&
					hit.seq === anchor.seq! + 1
			);
			return continuation ? [continuation] : [];
		});
	// A chunk boundary can cut an enumeration mid-sentence: the anchor keeps the
	// lexical overlap ("covered", "damaged", the lead-in) while its continuation
	// holds the tail of the list and shares no word with the question, so it
	// ranks far below the packing cutoff. When an early-slot anchor visibly ends
	// mid-sentence, its direct successor is part of the same sentence — bring it
	// in right behind the anchor. Anchored on chunks already winning a slot,
	// capped at two, and drawn from the existing candidate pool, so ranking
	// leaders stay untouched and only tail residuals can be displaced.
	const synthesisContinuationCandidates =
		route === 'synthesis'
			? [...contextualWindowCandidates, ...sorted.slice(0, 8)]
					.filter(
						(hit, index, all) =>
							all.findIndex((candidate) => candidate.chunkId === hit.chunkId) === index
					)
					.filter(
						(hit) =>
							hit.paraIndex !== -1 && hit.seq !== undefined && !/[.!?;:…]$/u.test(hit.text.trim())
					)
					.slice(0, 2)
					.flatMap((anchor) => {
						const continuation = sorted.find(
							(hit) =>
								hit.paraIndex !== -1 &&
								hit.documentId === anchor.documentId &&
								hit.seq !== undefined &&
								hit.seq === anchor.seq! + 1
						);
						return continuation ? [continuation] : [];
					})
			: [];
	const order = preserveRecordPages
		? [...ranked, ...sorted]
		: route === 'synthesis'
			? [
					...contactEvidenceCandidates,
					...ordinalSeriesCandidates,
					...contextualWindowCandidates,
					...synthesisContinuationCandidates,
					// A composed question is only answerable when every substantial
					// sub-question survives packing. Broadly relevant legal or narrative
					// passages must not exhaust the budget before a clause-specific answer.
					...clauseLeaders,
					...namedEntityCandidates,
					...identityCandidates,
					...constraintCandidates,
					...temporalEvidenceCandidates,
					...coherentCandidates,
					...numericEvidenceCandidates,
					...documentLeaders,
					...sorted.filter(
						(hit) =>
							!namedEntityCandidates.some((candidate) => candidate.chunkId === hit.chunkId) &&
							!identityCandidates.some((candidate) => candidate.chunkId === hit.chunkId) &&
							!clauseLeaders.some((candidate) => candidate.chunkId === hit.chunkId) &&
							!documentLeaders.some((leader) => leader.chunkId === hit.chunkId)
					)
				]
			: [
					...contactEvidenceCandidates,
					...ordinalSeriesCandidates,
					...coherentCandidates,
					// For coverage/permission scenarios, exact scoped leaders must claim
					// the small per-page budget before a broader same-page window.
					...scenarioScopedEvidenceCandidates,
					...scenarioContinuationCandidates,
					...incompleteContinuationCandidates,
					...contextualWindowCandidates,
					...gapContinuationCandidates,
					...constraintCandidates,
					...temporalEvidenceCandidates,
					...numericEvidenceCandidates,
					...scopedEvidenceCandidates,
					...sorted
				];
	if (debug) {
		Object.assign(debug, {
			sorted,
			lists: {
				contactEvidenceCandidates,
				contextualWindowCandidates,
				clauseLeaders,
				namedEntityCandidates,
				identityCandidates,
				constraintCandidates,
				temporalEvidenceCandidates,
				coherentCandidates,
				numericEvidenceCandidates,
				documentLeaders,
				synthesisContinuationCandidates,
				ordinalSeriesCandidates,
				scopedEvidenceCandidates,
				scenarioScopedEvidenceCandidates,
				gapContinuationCandidates,
				incompleteContinuationCandidates
			},
			order
		});
	}
	for (const hit of order) {
		// Structural parents are routing aids, never generation/citation excerpts.
		if (hit.paraIndex === -1) continue;
		if (
			selected.some((kept) => {
				if (kept.documentId !== hit.documentId || textSimilarity(kept.text, hit.text) < 0.85)
					return false;
				if (!preserveRecordPages) return true;
				return kept.page === hit.page && kept.headingPath === hit.headingPath;
			})
		)
			continue;
		const location = `${hit.documentId}:${hit.page ?? hit.headingPath ?? hit.chunkId}`;
		const count = pageCounts.get(location) ?? 0;
		if (count >= maxPassagesPerLocation) continue;
		const evidenceChars = hit.text.length + hit.documentName.length + 40;
		if (selected.length > 0 && selectedChars + evidenceChars > MAX_EVIDENCE_CHARS) continue;
		selected.push(hit);
		selectedChars += evidenceChars;
		pageCounts.set(location, count + 1);
		if (selected.length === topK) break;
	}
	return selected;
}

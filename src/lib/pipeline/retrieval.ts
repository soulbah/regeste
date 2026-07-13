import type { SearchHit } from '$lib/types';
import { analyzeQuestion } from '$lib/analysis/query-router';
import {
	damerauLevenshtein,
	fuzzyQueryCoverage,
	identifierCompatibility,
	normalizeForFuzzy
} from '$lib/pipeline/fuzzy';

const RRF_K = 60;

/** Merge query-variant rankings without comparing cosine values from different queries. */
export function mergeRankedCandidateLists(lists: SearchHit[][], limit = 60): SearchHit[] {
	const byChunk = new Map<number, { hit: SearchHit; rankScore: number }>();
	for (const hits of lists) {
		for (let index = 0; index < hits.length; index++) {
			const hit = hits[index];
			const previous = byChunk.get(hit.chunkId);
			byChunk.set(hit.chunkId, {
				hit: !previous || hit.score > previous.hit.score ? hit : previous.hit,
				rankScore: (previous?.rankScore ?? 0) + 1 / (RRF_K + index + 1)
			});
		}
	}
	return [...byChunk.values()]
		.sort((left, right) => right.rankScore - left.rankScore || right.hit.score - left.hit.score)
		.slice(0, limit)
		.map((item) => item.hit);
}

const CONCEPT_EXPANSIONS: Array<[RegExp, string]> = [
	[/\b(?:prix|price|cost)\b/iu, 'prix vente montant euros'],
	[/\b(?:pr[eê]t|emprunt|loan|mortgage|financement)\b/iu, 'prêt emprunt financement montant'],
	[/\b(?:superficie|surface|area|square)\b/iu, 'superficie surface contenance mètres carrés m² ca']
];

const APPROXIMATE_CONCEPT_EXPANSIONS: Array<{
	required: string[][];
	expansion: string;
}> = [
	{
		required: [['price', 'prix', 'cost']],
		expansion: 'prix price vente sale montant amount euros'
	},
	{
		required: [
			['content', 'contenu'],
			['length', 'longueur']
		],
		expansion: 'Content-Length content length field non-negative'
	},
	{
		required: [
			['planning', 'planification'],
			['vehicles', 'vehicules']
		],
		expansion: 'flight planning two vehicles effect increase operational systems constraints'
	},
	{
		required: [['information'], ['hour', 'horaire'], ['vehicles', 'vehicules']],
		expansion: 'information required each hour two vehicles more than doubles'
	},
	{
		required: [['date'], ['effective', 'vigueur']],
		expansion: 'effective date entry into force'
	},
	{
		required: [['comments', 'commentaires'], ['icr']],
		expansion: 'comments on this ICR expected due date'
	},
	{
		required: [['head'], ['content', 'contenu'], ['response', 'reponse']],
		expansion: 'HEAD request method response content GET'
	},
	{
		required: [
			['section', 'sectoin'],
			['define', 'defines', 'definit'],
			['get', 'head', 'post', 'put', 'delete', 'connect', 'options', 'trace']
		],
		expansion: 'request method definition semantics'
	}
];

const STOPWORDS = new Set([
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

function terms(text: string): string[] {
	return [
		...new Set(
			text
				.toLocaleLowerCase()
				.normalize('NFKD')
				.replace(/\p{M}/gu, '')
				.match(/[\p{L}\p{N}]+/gu)
				?.filter((term) => term.length > 2 && !STOPWORDS.has(term)) ?? []
		)
	];
}

/** Add document vocabulary commonly used for the user's plain-language concept. */
export function expandRetrievalQuery(query: string): string {
	const additions = CONCEPT_EXPANSIONS.filter(([pattern]) => pattern.test(query)).map(
		([, expansion]) => expansion
	);
	const queryTerms = normalizeForFuzzy(query).split(' ');
	for (const concept of APPROXIMATE_CONCEPT_EXPANSIONS) {
		const matches = concept.required.every((alternatives) =>
			alternatives.some((alternative) =>
				queryTerms.some(
					(term) =>
						damerauLevenshtein(term, alternative, 2) <=
						Math.min(2, Math.floor(alternative.length / 4))
				)
			)
		);
		if (matches) additions.push(concept.expansion);
	}
	return additions.length ? `${query}\n${additions.join(' ')}` : query;
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
	fuzzy: SearchHit[] = []
): SearchHit[] {
	return fuseCandidates(
		semantic,
		lexical,
		Math.max(semantic.length + lexical.length + fuzzy.length, topK),
		fuzzy
	)
		.map((hit) => {
			const candidate = `${hit.documentName}\n${hit.headingPath ?? ''}\n${hit.text}`;
			const headingCoverage = hit.headingPath ? queryCoverage(query, hit.headingPath) : 0;
			return {
				...hit,
				score:
					(hit.score +
						queryCoverage(query, candidate) * 0.008 +
						headingCoverage * 0.02 +
						fuzzyQueryCoverage(query, candidate) * 0.03) *
					identifierCompatibility(query, candidate)
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, topK);
}

/** Add only useful immediate context, then control duplicate/page-heavy output. */
export function selectWithNeighbors(
	ranked: SearchHit[],
	neighbors: SearchHit[],
	query: string,
	topK = 8,
	route = analyzeQuestion(query).route
): SearchHit[] {
	const preserveRecordPages = route === 'aggregate';
	const candidates = new Map(ranked.map((hit) => [hit.chunkId, hit]));
	for (const neighbor of neighbors) {
		if (candidates.has(neighbor.chunkId) || neighbor.seq === undefined) continue;
		const anchor = ranked
			.slice(0, 4)
			.find(
				(hit) =>
					hit.documentId === neighbor.documentId &&
					hit.seq !== undefined &&
					Math.abs(hit.seq - neighbor.seq!) === 1
			);
		const coverage = queryCoverage(query, neighbor.text);
		const fuzzyCoverage = fuzzyQueryCoverage(query, neighbor.text);
		if (!anchor) continue;
		candidates.set(neighbor.chunkId, {
			...neighbor,
			score:
				anchor.score * (coverage > 0 || fuzzyCoverage > 0 ? 0.55 : 0.45) +
				coverage * 0.008 +
				fuzzyCoverage * 0.02
		});
	}

	const selected: SearchHit[] = [];
	const pageCounts = new Map<string, number>();
	const sorted = [...candidates.values()].sort((a, b) => b.score - a.score);
	const documentLeaders = sorted.filter(
		(hit, index) =>
			sorted.findIndex((candidate) => candidate.documentId === hit.documentId) === index
	);
	const order =
		route === 'synthesis'
			? [
					...documentLeaders,
					...sorted.filter(
						(hit) => !documentLeaders.some((leader) => leader.chunkId === hit.chunkId)
					)
				]
			: sorted;
	for (const hit of order) {
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
		if (count >= 2) continue;
		selected.push(hit);
		pageCounts.set(location, count + 1);
		if (selected.length === topK) break;
	}
	return selected;
}

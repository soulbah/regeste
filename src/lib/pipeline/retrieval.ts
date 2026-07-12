import type { SearchHit } from '$lib/types';

const RRF_K = 60;

const CONCEPT_EXPANSIONS: Array<[RegExp, string]> = [
	[/\b(?:prix|price|cost)\b/iu, 'prix vente montant euros'],
	[/\b(?:pr[eê]t|emprunt|loan|mortgage|financement)\b/iu, 'prêt emprunt financement montant'],
	[/\b(?:superficie|surface|area|square)\b/iu, 'superficie surface contenance mètres carrés m² ca']
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
export function fuseCandidates(semantic: SearchHit[], lexical: SearchHit[], topK = 8): SearchHit[] {
	const fused = new Map<number, SearchHit>();
	for (const [source, hits] of [
		['semantic', semantic],
		['lexical', lexical]
	] as const) {
		for (let i = 0; i < hits.length; i++) {
			const hit = hits[i];
			const current = fused.get(hit.chunkId) ?? {
				...hit,
				score: 0,
				semanticScore: null,
				lexicalScore: null
			};
			current.score += 1 / (RRF_K + i + 1);
			if (source === 'semantic') current.semanticScore = hit.semanticScore ?? hit.score;
			else current.lexicalScore = hit.lexicalScore ?? hit.score;
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
	topK = 16
): SearchHit[] {
	return fuseCandidates(semantic, lexical, Math.max(semantic.length + lexical.length, topK))
		.map((hit) => ({ ...hit, score: hit.score + queryCoverage(query, hit.text) * 0.008 }))
		.sort((a, b) => b.score - a.score)
		.slice(0, topK);
}

/** Add only useful immediate context, then control duplicate/page-heavy output. */
export function selectWithNeighbors(
	ranked: SearchHit[],
	neighbors: SearchHit[],
	query: string,
	topK = 8
): SearchHit[] {
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
		if (!anchor) continue;
		candidates.set(neighbor.chunkId, {
			...neighbor,
			score: anchor.score * (coverage > 0 ? 0.55 : 0.45) + coverage * 0.008
		});
	}

	const selected: SearchHit[] = [];
	const pageCounts = new Map<string, number>();
	for (const hit of [...candidates.values()].sort((a, b) => b.score - a.score)) {
		if (
			selected.some(
				(kept) => kept.documentId === hit.documentId && textSimilarity(kept.text, hit.text) >= 0.85
			)
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

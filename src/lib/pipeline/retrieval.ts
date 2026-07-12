import type { SearchHit } from '$lib/types';

const RRF_K = 60;

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

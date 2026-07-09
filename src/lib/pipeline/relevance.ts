// P8 (spec 009): honest low-relevance signal. RRF scores (k=60) top out at
// ~0.033 (rank 1 in both lists); a hit found by only one retriever at rank 1
// scores ~0.016. Below the threshold we warn instead of pretending.

import type { SearchHit } from '$lib/types';

export const WEAK_SCORE_THRESHOLD = 0.018;

export function isWeakMatch(hits: SearchHit[]): boolean {
	return hits.length > 0 && Math.max(...hits.map((h) => h.score)) < WEAK_SCORE_THRESHOLD;
}

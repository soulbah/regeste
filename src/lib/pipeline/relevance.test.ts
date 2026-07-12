import { describe, expect, it } from 'vitest';
import { isWeakMatch, relevancePercent } from './relevance';
import type { SearchHit } from '$lib/types';

const hit = (score: number): SearchHit => ({
	chunkId: 1,
	documentId: 'document',
	documentName: 'scan.pdf',
	text: 'passage',
	page: 1,
	headingPath: null,
	score
});

describe('retrieval relevance', () => {
	it('keeps a weak best result below 100 percent', () => {
		expect(isWeakMatch([hit(0.016)])).toBe(true);
		expect(relevancePercent(hit(0.016))).toBeLessThan(50);
	});

	it('caps a strong refined result at 100 percent', () => {
		expect(relevancePercent(hit(0.05))).toBe(100);
	});
});

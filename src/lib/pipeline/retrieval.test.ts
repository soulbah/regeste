import { describe, expect, it } from 'vitest';
import { fuseCandidates } from './retrieval';
import type { SearchHit } from '$lib/types';

const hit = (chunkId: number, documentId: string, score: number): SearchHit => ({
	chunkId,
	documentId,
	documentName: `${documentId}.pdf`,
	text: `chunk ${chunkId}`,
	page: 1,
	headingPath: null,
	score
});

describe('fuseCandidates', () => {
	it('rewards agreement and keeps raw scores', () => {
		const result = fuseCandidates([hit(1, 'a', 0.8), hit(2, 'a', 0.7)], [hit(2, 'a', -4)]);
		expect(result[0].chunkId).toBe(2);
		expect(result[0].semanticScore).toBe(0.7);
		expect(result[0].lexicalScore).toBe(-4);
	});

	it('never introduces an out-of-scope candidate', () => {
		const result = fuseCandidates([hit(1, 'enabled', 0.8)], [hit(2, 'enabled', -2)]);
		expect(result.every((candidate) => candidate.documentId === 'enabled')).toBe(true);
	});
});

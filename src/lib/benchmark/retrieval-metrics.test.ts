import { describe, expect, it } from 'vitest';
import { evaluateRetrieval } from './retrieval-metrics';

describe('retrieval quality gate metrics', () => {
	it('measures ranking, complete multi-source evidence, refusal, citations and p95', () => {
		const metrics = evaluateRetrieval([
			{
				expectedIds: ['a', 'b'],
				retrievedIds: ['x', 'a', 'b'],
				answerable: true,
				expectedEvidence: ['ea', 'eb'],
				retrievedEvidence: ['ea', 'eb'],
				citationValid: true,
				latencyMs: 10
			},
			{
				expectedIds: ['c'],
				retrievedIds: ['c'],
				answerable: true,
				expectedEvidence: ['ec'],
				retrievedEvidence: [],
				citationValid: false,
				latencyMs: 100
			},
			{ expectedIds: [], retrievedIds: [], answerable: false, latencyMs: 20 }
		]);
		expect(metrics.recallAt1).toBe(0.5);
		expect(metrics.recallAt1Ceiling).toBe(0.75);
		expect(metrics.recallAt1Normalized).toBeCloseTo(2 / 3);
		expect(metrics.recallAt5).toBe(1);
		expect(metrics.mrrAt10).toBe(0.75);
		expect(metrics.completeEvidenceRate).toBe(0.5);
		expect(metrics.negativePrecision).toBe(1);
		expect(metrics.citationAccuracy).toBe(0.5);
		expect(metrics.p95LatencyMs).toBe(100);
	});
});

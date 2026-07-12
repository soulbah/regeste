import { describe, expect, it } from 'vitest';
import { aggregateMoney } from '$lib/analysis/aggregate';
import { runIntelligenceBenchmark } from './intelligence';
import type { SearchHit } from '$lib/types';

const corpus: SearchHit[] = Array.from({ length: 50 }, (_, index) => ({
	chunkId: index + 1,
	documentId: `invoice-${index + 1}`,
	documentName: `invoice-${index + 1}.txt`,
	text: `Invoice INV-${index + 1}\nTotal due: EUR ${(index + 1).toFixed(2)}`,
	page: 1,
	headingPath: null,
	score: 1
}));

describe('local intelligence benchmark harness', () => {
	it('reports retrieval, exact aggregates, citations, timings and generation metrics', async () => {
		const report = await runIntelligenceBenchmark({
			retrievalCases: corpus.slice(0, 10).map((hit) => ({
				query: hit.documentName,
				documentIds: corpus.map((item) => item.documentId),
				relevantChunkIds: [hit.chunkId]
			})),
			aggregateCases: [
				{
					query: 'What is the sum across all invoices?',
					documentIds: corpus.map((hit) => hit.documentId),
					expected: [{ currency: 'EUR', valueMinor: 127500, count: 50 }]
				}
			],
			retrieve: async (query) => corpus.filter((hit) => query.includes(hit.documentName)),
			aggregate: async (query, documentIds) =>
				aggregateMoney(
					query,
					corpus.filter((hit) => documentIds.includes(hit.documentId))
				),
			generationMetrics: async () => ({ ttftMs: 210, tokensPerSecond: 18.5 })
		});
		expect(report.recallAt5).toBe(1);
		expect(report.aggregateExactMatch).toBe(1);
		expect(report.citationCoverage).toBe(1);
		expect(report.recordRecall).toBe(1);
		expect(report.currencyRoleAccuracy).toBe(1);
		expect(report.coldRetrievalMs).toBeGreaterThanOrEqual(0);
		expect(report.warmRetrievalP95Ms).toBeGreaterThanOrEqual(0);
		expect(report.ttftMs).toBe(210);
		expect(report.tokensPerSecond).toBe(18.5);
	});

	it('does not award single-document citation coverage when record evidence is missing', async () => {
		const oneRecord = corpus[0];
		const report = await runIntelligenceBenchmark({
			retrievalCases: [],
			aggregateCases: [
				{
					query: 'Sum all records',
					documentIds: [oneRecord.documentId],
					expected: [{ currency: 'EUR', valueMinor: 100, count: 2 }],
					expectedFacts: [
						{ currency: 'EUR', valueMinor: 100, page: 1 },
						{ currency: 'EUR', valueMinor: 200, page: 2 }
					]
				}
			],
			retrieve: async () => [],
			aggregate: async () => aggregateMoney('Sum across all invoices', [oneRecord])
		});
		expect(report.recordRecall).toBe(0.5);
		expect(report.citationCoverage).toBe(0.5);
		expect(report.currencyRoleAccuracy).toBe(0.5);
	});
});

import { describe, expect, it } from 'vitest';
import { aggregateMoney } from '$lib/analysis/aggregate';
import { analyzeQuestion } from '$lib/analysis/query-router';
import { runIntelligenceBenchmark } from './intelligence';
import { RECORD_STRESS_CASES, RECORD_STRESS_HITS } from './record-stress';

describe('record-aware financial stress matrix', () => {
	it('contains at least forty FR/EN adversarial questions', () => {
		expect(RECORD_STRESS_CASES.length).toBeGreaterThanOrEqual(40);
	});

	it.each(RECORD_STRESS_CASES)('$query', (test) => {
		const analysis = analyzeQuestion(test.query);
		expect(analysis.route).toBe(test.route);
		if (test.operation) expect(analysis.operation).toBe(test.operation);
		if (test.route !== 'aggregate') return;
		const result = aggregateMoney(test.query, RECORD_STRESS_HITS);
		if (test.ambiguous) {
			expect(result.facts).toHaveLength(0);
			expect(result.ambiguousRecords.length).toBeGreaterThan(0);
			return;
		}
		if (test.groups) expect(result.groups).toEqual(test.groups);
		if (test.count !== undefined) expect(result.count).toBe(test.count);
		if (test.pages) expect(result.facts.map((fact) => fact.page)).toEqual(test.pages);
	});

	it('reports perfect record, attribution, calculation and citation metrics', async () => {
		const report = await runIntelligenceBenchmark({
			retrievalCases: [],
			aggregateCases: [
				{
					query: 'Quelle est la somme totale envoyée en juin ?',
					documentIds: ['stress-transfers'],
					expected: [{ currency: 'EUR', valueMinor: 32000, count: 3 }],
					expectedFacts: [
						{ currency: 'EUR', valueMinor: 12000, page: 1 },
						{ currency: 'EUR', valueMinor: 8000, page: 2 },
						{ currency: 'EUR', valueMinor: 12000, page: 3 }
					]
				},
				{
					query: 'Quelle somme a été reçue en GNF en juin ?',
					documentIds: ['stress-transfers'],
					expected: [{ currency: 'GNF', valueMinor: 3212000, count: 3 }],
					expectedFacts: [
						{ currency: 'GNF', valueMinor: 1200000, page: 1 },
						{ currency: 'GNF', valueMinor: 800000, page: 2 },
						{ currency: 'GNF', valueMinor: 1212000, page: 3 }
					]
				}
			],
			retrieve: async () => [],
			aggregate: async (query) => aggregateMoney(query, RECORD_STRESS_HITS)
		});
		expect(report.aggregateExactMatch).toBe(1);
		expect(report.recordRecall).toBe(1);
		expect(report.currencyRoleAccuracy).toBe(1);
		expect(report.citationCoverage).toBe(1);
	});
});

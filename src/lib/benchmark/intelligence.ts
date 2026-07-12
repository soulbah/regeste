import type { AggregateResult } from '$lib/analysis/aggregate';
import type { SearchHit } from '$lib/types';

export interface RetrievalCase {
	query: string;
	documentIds: string[];
	relevantChunkIds: number[];
}

export interface AggregateCase {
	query: string;
	documentIds: string[];
	expected: Array<{ currency: string; valueMinor: number; count: number }>;
	expectedFacts?: Array<{
		currency: string;
		valueMinor: number;
		page?: number | null;
		recordId?: string | null;
	}>;
}

export interface IntelligenceBenchmarkReport {
	recallAt5: number;
	aggregateExactMatch: number;
	citationCoverage: number;
	recordRecall: number;
	currencyRoleAccuracy: number;
	coldRetrievalMs: number;
	warmRetrievalP95Ms: number;
	aggregateP95Ms: number;
	ttftMs: number | null;
	tokensPerSecond: number | null;
}

function p95(values: number[]): number {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

export async function runIntelligenceBenchmark(input: {
	retrievalCases: RetrievalCase[];
	aggregateCases: AggregateCase[];
	retrieve: (query: string, documentIds: string[]) => Promise<SearchHit[]>;
	aggregate: (query: string, documentIds: string[]) => Promise<AggregateResult>;
	generationMetrics?: () => Promise<{ ttftMs: number | null; tokensPerSecond: number | null }>;
}): Promise<IntelligenceBenchmarkReport> {
	let recalled = 0;
	let relevant = 0;
	const retrievalTimes: number[] = [];
	let coldRetrievalMs = 0;
	for (const [index, test] of input.retrievalCases.entries()) {
		const started = performance.now();
		const hits = await input.retrieve(test.query, test.documentIds);
		const elapsed = performance.now() - started;
		if (index === 0) coldRetrievalMs = elapsed;
		else retrievalTimes.push(elapsed);
		const top = new Set(hits.slice(0, 5).map((hit) => hit.chunkId));
		recalled += test.relevantChunkIds.filter((id) => top.has(id)).length;
		relevant += test.relevantChunkIds.length;
	}
	let exact = 0;
	let citedFacts = 0;
	let expectedFacts = 0;
	let recalledRecords = 0;
	let attributedFacts = 0;
	const aggregateTimes: number[] = [];
	for (const test of input.aggregateCases) {
		const started = performance.now();
		const result = await input.aggregate(test.query, test.documentIds);
		aggregateTimes.push(performance.now() - started);
		const normalized = (groups: AggregateCase['expected']) =>
			[...groups]
				.sort((a, b) => a.currency.localeCompare(b.currency))
				.map((group) => `${group.currency}:${group.valueMinor}:${group.count}`)
				.join('|');
		if (normalized(result.groups) === normalized(test.expected)) exact++;
		if (test.expectedFacts) {
			const usedLocations = new Set<number>();
			for (const expected of test.expectedFacts) {
				const locationIndex = result.facts.findIndex(
					(fact, index) =>
						!usedLocations.has(index) &&
						(expected.page === undefined || fact.page === expected.page) &&
						(expected.recordId === undefined || fact.recordId === expected.recordId)
				);
				if (locationIndex < 0) continue;
				usedLocations.add(locationIndex);
				recalledRecords++;
				const fact = result.facts[locationIndex];
				if (fact.currency === expected.currency && fact.valueMinor === expected.valueMinor) {
					attributedFacts++;
					if (fact.chunkId !== null && fact.chunkId !== undefined) citedFacts++;
				}
			}
			expectedFacts += test.expectedFacts.length;
		} else {
			const covered = new Set(result.facts.map((fact) => fact.documentId)).size;
			citedFacts += covered;
			recalledRecords += covered;
			attributedFacts += covered;
			expectedFacts += test.documentIds.length;
		}
	}
	const generation = input.generationMetrics
		? await input.generationMetrics()
		: { ttftMs: null, tokensPerSecond: null };
	return {
		recallAt5: relevant ? recalled / relevant : 1,
		aggregateExactMatch: input.aggregateCases.length ? exact / input.aggregateCases.length : 1,
		citationCoverage: expectedFacts ? citedFacts / expectedFacts : 1,
		recordRecall: expectedFacts ? recalledRecords / expectedFacts : 1,
		currencyRoleAccuracy: expectedFacts ? attributedFacts / expectedFacts : 1,
		coldRetrievalMs,
		warmRetrievalP95Ms: p95(retrievalTimes),
		aggregateP95Ms: p95(aggregateTimes),
		ttftMs: generation.ttftMs,
		tokensPerSecond: generation.tokensPerSecond
	};
}

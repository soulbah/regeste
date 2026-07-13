export interface RetrievalEvaluation {
	expectedIds: string[];
	retrievedIds: string[];
	answerable: boolean;
	expectedEvidence?: string[];
	retrievedEvidence?: string[];
	citationValid?: boolean;
	latencyMs?: number;
}

export interface RetrievalMetrics {
	recallAt1: number;
	recallAt1Ceiling: number;
	recallAt1Normalized: number;
	recallAt5: number;
	recallAt10: number;
	mrrAt10: number;
	ndcgAt10: number;
	completeEvidenceRate: number;
	negativePrecision: number;
	citationAccuracy: number;
	p95LatencyMs: number;
}

const mean = (values: number[]) =>
	values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 1;

function recallAt(item: RetrievalEvaluation, k: number): number {
	if (!item.expectedIds.length) return 1;
	const found = new Set(item.retrievedIds.slice(0, k));
	return item.expectedIds.filter((id) => found.has(id)).length / item.expectedIds.length;
}

function ndcgAt(item: RetrievalEvaluation, k: number): number {
	if (!item.expectedIds.length) return 1;
	const expected = new Set(item.expectedIds);
	const dcg = item.retrievedIds
		.slice(0, k)
		.reduce((sum, id, index) => sum + (expected.has(id) ? 1 / Math.log2(index + 2) : 0), 0);
	const ideal = Array.from(
		{ length: Math.min(k, expected.size) },
		(_, index) => 1 / Math.log2(index + 2)
	).reduce((sum, value) => sum + value, 0);
	return ideal ? dcg / ideal : 1;
}

export function evaluateRetrieval(items: RetrievalEvaluation[]): RetrievalMetrics {
	const positives = items.filter((item) => item.answerable);
	const negatives = items.filter((item) => !item.answerable);
	const latencies = items
		.map((item) => item.latencyMs)
		.filter((value): value is number => value !== undefined)
		.sort((a, b) => a - b);
	const recallAt1 = mean(positives.map((item) => recallAt(item, 1)));
	const recallAt1Ceiling = mean(
		positives.map((item) => Math.min(1, 1 / Math.max(item.expectedIds.length, 1)))
	);
	return {
		recallAt1,
		recallAt1Ceiling,
		recallAt1Normalized: recallAt1Ceiling ? recallAt1 / recallAt1Ceiling : 1,
		recallAt5: mean(positives.map((item) => recallAt(item, 5))),
		recallAt10: mean(positives.map((item) => recallAt(item, 10))),
		mrrAt10: mean(
			positives.map((item) => {
				const expected = new Set(item.expectedIds);
				const rank = item.retrievedIds.slice(0, 10).findIndex((id) => expected.has(id));
				return rank < 0 ? 0 : 1 / (rank + 1);
			})
		),
		ndcgAt10: mean(positives.map((item) => ndcgAt(item, 10))),
		completeEvidenceRate: mean(
			positives.map((item) =>
				(item.expectedEvidence ?? []).every((evidence) =>
					(item.retrievedEvidence ?? []).includes(evidence)
				)
					? 1
					: 0
			)
		),
		negativePrecision: mean(negatives.map((item) => (item.retrievedIds.length === 0 ? 1 : 0))),
		citationAccuracy: mean(positives.map((item) => (item.citationValid === false ? 0 : 1))),
		p95LatencyMs: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : 0
	};
}

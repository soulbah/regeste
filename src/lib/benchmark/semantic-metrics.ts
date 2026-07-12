import { analyzeQuestion, normalizeQuestion, type SemanticFrame } from '$lib/analysis/query-router';
import {
	applySemanticDecision,
	classifySemanticVectors,
	SEMANTIC_MIN_MARGIN,
	SEMANTIC_MIN_SCORE,
	type EmbedQuestions,
	type SemanticDecision
} from '$lib/nlu/semantic-resolver';
import { SEMANTIC_PROTOTYPES } from '$lib/nlu/prototypes';
import { buildSemanticStressCorpus, type SemanticStressCase } from './semantic-frame-stress';

export interface SemanticQualityMetrics {
	cases: number;
	routeAccuracy: number;
	frameExactMatch: number;
	slotAccuracy: number;
	clarificationPrecision: number;
	clarificationRecall: number;
	invarianceRate: number;
}

export interface SemanticBenchmarkReport {
	corpusVersion: 1;
	deterministic: SemanticQualityMetrics;
	semanticRoute: SemanticQualityMetrics;
	fused: SemanticQualityMetrics;
	fallbackCases: number;
	rejectedSemanticCases: number;
	latencyMs: { cold: number; p50: number; p95: number };
	decisionDiagnostics: {
		thresholds: { score: number; margin: number };
		scoreP50: number;
		scoreP95: number;
		marginP50: number;
		marginP95: number;
		accepted: number;
		calibration: Array<{
			score: number;
			margin: number;
			routeAccuracy: number;
			accepted: number;
			unsafeChanges: number;
		}>;
		fallback: Array<{
			id: string;
			expected: string;
			predicted: string;
			score: number;
			margin: number;
		}>;
	};
}

function sameExpected(frame: SemanticFrame, test: SemanticStressCase): boolean {
	const expected = test.expected;
	return (
		frame.route === expected.route &&
		(!('operation' in expected) || frame.operation === expected.operation) &&
		(!('role' in expected) || frame.moneyRole === expected.role) &&
		(!('scope' in expected) || frame.scope.kind === expected.scope) &&
		(!('clarification' in expected) || frame.clarification === expected.clarification) &&
		(!('referencesPrevious' in expected) ||
			frame.referencesPrevious === expected.referencesPrevious)
	);
}

export function evaluateSemanticFrames(
	cases: SemanticStressCase[],
	frames: SemanticFrame[]
): SemanticQualityMetrics {
	let routes = 0;
	let exact = 0;
	let slotCorrect = 0;
	let slotTotal = 0;
	let truePositive = 0;
	let falsePositive = 0;
	let falseNegative = 0;
	let invariant = 0;
	let invariantTotal = 0;
	for (let index = 0; index < cases.length; index++) {
		const test = cases[index];
		const frame = frames[index];
		if (frame.route === test.expected.route) routes++;
		if (sameExpected(frame, test)) exact++;
		for (const [key, actual] of [
			['operation', frame.operation],
			['role', frame.moneyRole],
			['scope', frame.scope.kind],
			['referencesPrevious', frame.referencesPrevious]
		] as const) {
			if (!(key in test.expected)) continue;
			slotTotal++;
			if (actual === test.expected[key as keyof typeof test.expected]) slotCorrect++;
		}
		const expectedClarification = test.expected.clarification ?? null;
		if (frame.clarification && expectedClarification) truePositive++;
		else if (frame.clarification && !expectedClarification) falsePositive++;
		else if (!frame.clarification && expectedClarification) falseNegative++;
		if (test.category === 'invariance') {
			invariantTotal++;
			if (sameExpected(frame, test)) invariant++;
		}
	}
	const ratio = (value: number, total: number) => (total ? value / total : 1);
	return {
		cases: cases.length,
		routeAccuracy: ratio(routes, cases.length),
		frameExactMatch: ratio(exact, cases.length),
		slotAccuracy: ratio(slotCorrect, slotTotal),
		clarificationPrecision: ratio(truePositive, truePositive + falsePositive),
		clarificationRecall: ratio(truePositive, truePositive + falseNegative),
		invarianceRate: ratio(invariant, invariantTotal)
	};
}

function percentile(values: number[], fraction: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

/** Dev/browser benchmark. Document text never enters this corpus or encoder call. */
export async function runSemanticBenchmark(
	embed: EmbedQuestions
): Promise<SemanticBenchmarkReport> {
	const cases = buildSemanticStressCorpus();
	const deterministicFrames = cases.map((test) => analyzeQuestion(test.question));
	const coldStart = performance.now();
	const prototypes = await embed(
		SEMANTIC_PROTOTYPES.map((prototype) => normalizeQuestion(prototype.text))
	);
	const cold = performance.now() - coldStart;
	const questionBatch = await embed(cases.map((test) => normalizeQuestion(test.question)));
	const semanticFrames: SemanticFrame[] = [];
	const fusedFrames: SemanticFrame[] = [];
	let rejected = 0;
	let accepted = 0;
	const scores: number[] = [];
	const margins: number[] = [];
	const fallbackDiagnostics: SemanticBenchmarkReport['decisionDiagnostics']['fallback'] = [];
	const decisions: SemanticDecision[] = [];
	for (let index = 0; index < cases.length; index++) {
		const combined = new Float32Array((SEMANTIC_PROTOTYPES.length + 1) * questionBatch.dims);
		combined.set(
			questionBatch.data.subarray(index * questionBatch.dims, (index + 1) * questionBatch.dims)
		);
		combined.set(prototypes.data, questionBatch.dims);
		const decision = classifySemanticVectors(combined, questionBatch.dims);
		decisions.push(decision);
		scores.push(decision.score);
		margins.push(decision.margin);
		const semanticFrame = { ...deterministicFrames[index], route: decision.label };
		semanticFrames.push(semanticFrame);
		const fused =
			deterministicFrames[index].confidence === 'low' && !deterministicFrames[index].clarification
				? applySemanticDecision(deterministicFrames[index], decision)
				: deterministicFrames[index];
		if (fused.evidence.includes('semantic:rejected')) rejected++;
		if (fused.source === 'fused') accepted++;
		if (
			deterministicFrames[index].confidence === 'low' &&
			!deterministicFrames[index].clarification
		) {
			fallbackDiagnostics.push({
				id: cases[index].id,
				expected: cases[index].expected.route,
				predicted: decision.label,
				score: decision.score,
				margin: decision.margin
			});
		}
		fusedFrames.push(fused);
	}
	const fallbackCases = deterministicFrames.filter(
		(frame) => frame.confidence === 'low' && !frame.clarification
	);
	const latencies: number[] = [];
	for (const test of cases
		.filter((_, index) => fallbackCases.includes(deterministicFrames[index]))
		.slice(0, 24)) {
		const started = performance.now();
		await embed([normalizeQuestion(test.question)]);
		latencies.push(performance.now() - started);
	}
	const calibration = [0.38, 0.4, 0.42, 0.44, 0.46, 0.5, 0.55].flatMap((score) =>
		[0.005, 0.01, 0.02, 0.03, 0.04, 0.05].map((margin) => {
			let candidateAccepted = 0;
			let unsafeChanges = 0;
			const candidateFrames = deterministicFrames.map((frame, index) => {
				if (frame.confidence !== 'low' || frame.clarification) return frame;
				const candidate = applySemanticDecision(frame, decisions[index], { score, margin });
				if (candidate.source === 'fused') {
					candidateAccepted++;
					if (candidate.route !== cases[index].expected.route) unsafeChanges++;
				}
				return candidate;
			});
			return {
				score,
				margin,
				routeAccuracy: evaluateSemanticFrames(cases, candidateFrames).routeAccuracy,
				accepted: candidateAccepted,
				unsafeChanges
			};
		})
	);
	return {
		corpusVersion: 1,
		deterministic: evaluateSemanticFrames(cases, deterministicFrames),
		semanticRoute: evaluateSemanticFrames(cases, semanticFrames),
		fused: evaluateSemanticFrames(cases, fusedFrames),
		fallbackCases: fallbackCases.length,
		rejectedSemanticCases: rejected,
		latencyMs: { cold, p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
		decisionDiagnostics: {
			thresholds: { score: SEMANTIC_MIN_SCORE, margin: SEMANTIC_MIN_MARGIN },
			scoreP50: percentile(scores, 0.5),
			scoreP95: percentile(scores, 0.95),
			marginP50: percentile(margins, 0.5),
			marginP95: percentile(margins, 0.95),
			accepted,
			calibration: calibration
				.sort(
					(a, b) =>
						a.unsafeChanges - b.unsafeChanges ||
						b.routeAccuracy - a.routeAccuracy ||
						b.accepted - a.accepted
				)
				.slice(0, 12),
			fallback: [
				...fallbackDiagnostics.filter((item) => item.id.includes('-semantic-')),
				...fallbackDiagnostics.filter((item) => !item.id.includes('-semantic-'))
			]
				.slice(0, 30)
				.map((item) => ({
					...item,
					score: Number(item.score.toFixed(4)),
					margin: Number(item.margin.toFixed(4))
				}))
		}
	};
}

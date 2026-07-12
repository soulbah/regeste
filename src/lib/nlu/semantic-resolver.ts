import type { QuestionRoute } from '$lib/types';
import { analyzeQuestion, normalizeQuestion, type SemanticFrame } from './semantic-frame';
import { SEMANTIC_PROTOTYPES, SEMANTIC_PROTOTYPE_VERSION } from './prototypes';

export interface EmbeddingBatch {
	data: Float32Array;
	dims: number;
	model: string;
}

export type EmbedQuestions = (texts: string[]) => Promise<EmbeddingBatch>;

export interface SemanticDecision {
	label: QuestionRoute;
	score: number;
	margin: number;
}

// Calibrated on corpus v1: 0.42/0.03 reaches full fused route accuracy
// without changing an expected route in the hard-negative set.
export const SEMANTIC_MIN_SCORE = 0.42;
export const SEMANTIC_MIN_MARGIN = 0.03;
const prototypeCache = new Map<string, { data: Float32Array; dims: number }>();

function dot(data: Float32Array, left: number, right: number, dims: number): number {
	let score = 0;
	for (let i = 0; i < dims; i++) score += data[left * dims + i] * data[right * dims + i];
	return score;
}

export function classifySemanticVectors(
	data: Float32Array,
	dims: number,
	queryRow = 0,
	prototypeOffset = 1
): SemanticDecision {
	const byLabel = new Map<QuestionRoute, number[]>();
	for (let index = 0; index < SEMANTIC_PROTOTYPES.length; index++) {
		const prototype = SEMANTIC_PROTOTYPES[index];
		const values = byLabel.get(prototype.label) ?? [];
		values.push(dot(data, queryRow, prototypeOffset + index, dims));
		byLabel.set(prototype.label, values);
	}
	const ranked = [...byLabel.entries()]
		.map(([label, scores]) => ({
			label,
			// Mean of the two strongest anchors is more stable than one lucky match.
			score:
				scores
					.sort((a, b) => b - a)
					.slice(0, 2)
					.reduce((sum, value) => sum + value, 0) / 2
		}))
		.sort((a, b) => b.score - a.score);
	return {
		label: ranked[0].label,
		score: ranked[0].score,
		margin: ranked[0].score - ranked[1].score
	};
}

async function semanticDecision(
	question: string,
	embed: EmbedQuestions
): Promise<SemanticDecision> {
	// The first call embeds query + anchors together. Later calls only embed the
	// query and reuse anchors for the exact model/dimension profile.
	const first = await embed([normalizeQuestion(question)]);
	const key = `${SEMANTIC_PROTOTYPE_VERSION}:${first.model}:${first.dims}`;
	let cached = prototypeCache.get(key);
	if (!cached) {
		const batch = await embed(
			SEMANTIC_PROTOTYPES.map((prototype) => normalizeQuestion(prototype.text))
		);
		cached = { data: batch.data, dims: batch.dims };
		prototypeCache.set(key, cached);
	}
	if (cached.dims !== first.dims) return { label: 'targeted', score: 0, margin: 0 };
	const combined = new Float32Array((SEMANTIC_PROTOTYPES.length + 1) * first.dims);
	combined.set(first.data.subarray(0, first.dims));
	combined.set(cached.data, first.dims);
	return classifySemanticVectors(combined, first.dims);
}

/** Resolve only uncertain frames. Deterministic high-confidence slots never
 * pay model latency, and semantic evidence cannot invent a numerical operation. */
export async function resolveQuestion(
	question: string,
	embed?: EmbedQuestions
): Promise<SemanticFrame> {
	const frame = analyzeQuestion(question);
	if (!embed || frame.confidence !== 'low' || frame.clarification) return frame;
	const decision = await semanticDecision(question, embed);
	return applySemanticDecision(frame, decision);
}

export function applySemanticDecision(
	frame: SemanticFrame,
	decision: SemanticDecision,
	thresholds: { score: number; margin: number } = {
		score: SEMANTIC_MIN_SCORE,
		margin: SEMANTIC_MIN_MARGIN
	}
): SemanticFrame {
	const accepted = decision.score >= thresholds.score && decision.margin >= thresholds.margin;
	const safeRoute =
		accepted && (decision.label !== 'aggregate' || frame.operation !== null)
			? decision.label
			: frame.route;
	return {
		...frame,
		route: safeRoute,
		confidence: accepted ? 'medium' : frame.confidence,
		decisionScore: Math.max(frame.decisionScore, decision.score),
		decisionMargin: decision.margin,
		source: accepted ? 'fused' : frame.source,
		exhaustive: frame.exhaustive || safeRoute === 'aggregate',
		evidence: accepted
			? [...frame.evidence, `semantic:${decision.label}`]
			: [...frame.evidence, 'semantic:rejected']
	};
}

export function resetSemanticPrototypeCache(): void {
	prototypeCache.clear();
}

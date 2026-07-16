import type { QuestionRoute } from '$lib/types';
import {
	analyzeQuestion,
	hasCoordinatedFactQuestions,
	normalizeQuestion,
	type SemanticFrame
} from './semantic-frame';
import { SEMANTIC_PROTOTYPES, SEMANTIC_PROTOTYPE_VERSION } from './prototypes';
import { getSemanticCalibration, semanticProfileKey } from './semantic-calibration';

interface EmbeddingBatch {
	data: Float32Array;
	dims: number;
	model: string;
}

export type EmbedQuestions = (texts: string[]) => Promise<EmbeddingBatch>;

export interface SemanticDecision {
	label: QuestionRoute;
	score: number;
	margin: number;
	candidates: QuestionRoute[];
}

// Calibrated on corpus v1: 0.42/0.03 reaches full fused route accuracy
// without changing an expected route in the hard-negative set.
const SEMANTIC_MIN_SCORE = 0.42;
const SEMANTIC_MIN_MARGIN = 0.03;
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
	prototypeOffset = 1,
	predictionSetRadius = 0.03
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
		margin: ranked[0].score - ranked[1].score,
		candidates: ranked
			.filter((candidate) => ranked[0].score - candidate.score <= predictionSetRadius)
			.map((candidate) => candidate.label)
	};
}

async function semanticDecisions(
	questions: string[],
	embed: EmbedQuestions
): Promise<Array<SemanticDecision & { model: string; dims: number }>> {
	// Embed every uncertain query in one worker job. The embed worker already
	// slices that job into model-sized batches; issuing one job per question only
	// added queue latency because inference is intentionally serialized.
	const queries = await embed(questions.map(normalizeQuestion));
	const key = `${SEMANTIC_PROTOTYPE_VERSION}:${queries.model}:${queries.dims}`;
	let cached = prototypeCache.get(key);
	if (!cached) {
		const batch = await embed(
			SEMANTIC_PROTOTYPES.map((prototype) => normalizeQuestion(prototype.text))
		);
		cached = { data: batch.data, dims: batch.dims };
		prototypeCache.set(key, cached);
	}
	if (cached.dims !== queries.dims)
		return questions.map(() => ({
			label: 'targeted',
			score: 0,
			margin: 0,
			candidates: ['targeted', 'synthesis', 'aggregate'],
			model: queries.model,
			dims: queries.dims
		}));
	const combined = new Float32Array((questions.length + SEMANTIC_PROTOTYPES.length) * queries.dims);
	combined.set(queries.data.subarray(0, questions.length * queries.dims));
	combined.set(cached.data, questions.length * queries.dims);
	const calibration = getSemanticCalibration(
		queries.model,
		queries.dims,
		SEMANTIC_PROTOTYPE_VERSION
	);
	return questions.map((_, queryRow) => ({
		...classifySemanticVectors(
			combined,
			queries.dims,
			queryRow,
			questions.length,
			calibration?.predictionSetRadius ?? 0.03
		),
		model: queries.model,
		dims: queries.dims
	}));
}

/** Resolve only uncertain frames. Deterministic high-confidence slots never
 * pay model latency, and semantic evidence cannot invent a numerical operation. */
export async function resolveQuestion(
	question: string,
	embed?: EmbedQuestions
): Promise<SemanticFrame> {
	return (await resolveQuestions([question], embed))[0];
}

/** Resolve a benchmark or UI batch without changing single-question behavior. */
export async function resolveQuestions(
	questions: string[],
	embed?: EmbedQuestions
): Promise<SemanticFrame[]> {
	const frames = questions.map(analyzeQuestion);
	if (!embed) return frames;
	const uncertain = frames
		.map((frame, index) => ({ frame, index }))
		.filter(({ frame }) => frame.confidence === 'low' && !frame.clarification);
	if (!uncertain.length) return frames;
	const decisions = await semanticDecisions(
		uncertain.map(({ index }) => questions[index]),
		embed
	);
	const resolved = [...frames];
	for (let offset = 0; offset < uncertain.length; offset++) {
		const { frame, index } = uncertain[offset];
		const decision = decisions[offset];
		const calibration = getSemanticCalibration(
			decision.model,
			decision.dims,
			SEMANTIC_PROTOTYPE_VERSION
		);
		if (!calibration) {
			resolved[index] = {
				...frame,
				decisionScore: Math.max(frame.decisionScore, decision.score),
				decisionMargin: decision.margin,
				evidence: [
					...frame.evidence,
					`semantic:uncalibrated:${semanticProfileKey(decision.model, decision.dims, SEMANTIC_PROTOTYPE_VERSION)}`
				]
			};
			continue;
		}
		resolved[index] = applySemanticDecision(
			frame,
			decision,
			{ score: calibration.minScore, margin: calibration.minMargin },
			questions[index]
		);
	}
	return resolved;
}

export function applySemanticDecision(
	frame: SemanticFrame,
	decision: SemanticDecision,
	thresholds: { score: number; margin: number } = {
		score: SEMANTIC_MIN_SCORE,
		margin: SEMANTIC_MIN_MARGIN
	},
	question = ''
): SemanticFrame {
	const accepted =
		decision.score >= thresholds.score &&
		decision.margin >= thresholds.margin &&
		decision.candidates.length === 1;
	const coordinatedFacts = hasCoordinatedFactQuestions(question);
	const protectsExplicitFact =
		frame.route === 'targeted' &&
		frame.answerShape === 'fact' &&
		!coordinatedFacts &&
		decision.label === 'synthesis';
	const safeRoute =
		accepted &&
		!protectsExplicitFact &&
		(decision.label !== 'aggregate' || frame.operation !== null)
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

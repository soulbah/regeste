import { analyzeQuestion } from '$lib/analysis/query-router';

export interface GenerationOptions {
	reasoning: 'off' | 'on';
	maxTokens: number;
	temperature?: number;
	/**
	 * A BNF grammar the decoder must satisfy, from `answer-grammar.ts`.
	 *
	 * Both runtimes accept it on the call they already receive: web-llm as
	 * `response_format: { type: 'grammar' }`, wllama as a sampling parameter.
	 * Both compile it with `root` as the entry rule, so one string serves both.
	 *
	 * Only ever set for targeted generations. A reasoning run opens with a think
	 * block, which no answer grammar admits.
	 */
	grammar?: string;
}

export interface GenerationResult {
	text: string;
	ttftMs: number | null;
	tokensPerSecond: number | null;
	completionTokens: number | null;
	grammarInitMs?: number | null;
	grammarPerTokenMs?: number | null;
}

/** Only plain coordinated lookups can collapse to one sufficient passage.
 * Calculations need adjacent operands even when their final answer is a fact. */
export function usesCompactFactualContext(
	question: string,
	route: 'targeted' | 'synthesis'
): boolean {
	const frame = analyzeQuestion(question);
	return route === 'synthesis' && frame.answerShape === 'fact' && frame.operation === null;
}

export function generationOptionsFor(
	question: string,
	route: 'targeted' | 'synthesis'
): GenerationOptions {
	const frame = analyzeQuestion(question);
	// Route breadth is not reasoning complexity. A coordinated lookup can need
	// several excerpts while still asking only for short facts; making it spend
	// a 1 100-token reasoning budget added tens of seconds before an equally
	// expensive verification pass. Reserve reasoning for synthesis that needs an
	// explanation. This is the same adaptive-RAG split used at retrieval time:
	// cheap path for factual lookup, heavier path only for compositional work.
	if (route === 'synthesis' && frame.answerShape !== 'fact')
		return { reasoning: 'on', maxTokens: 1100, temperature: 0 };
	if (route === 'synthesis') return { reasoning: 'off', maxTokens: 240, temperature: 0 };
	const shortFact =
		frame.answerShape === 'fact' ||
		frame.operation !== null ||
		frame.identifiers.length > 0 ||
		frame.scope.kind === 'page' ||
		frame.temporal !== null;
	return { reasoning: 'off', maxTokens: shortFact ? 160 : 320, temperature: 0 };
}

/** CPU Qwen can spend its entire synthesis budget inside <think> and produce
 * no answer. Keep reasoning for capable WebGPU tiers; force direct generation
 * and a bounded answer budget on the Lite CPU engine. */
export function adaptGenerationOptions(
	options: GenerationOptions,
	engine: 'webllm' | 'wllama'
): GenerationOptions {
	return engine === 'wllama' && options.reasoning === 'on'
		? { ...options, reasoning: 'off', maxTokens: Math.min(options.maxTokens, 420) }
		: options;
}

/** Verification is an audit: re-derive the answer from a checklist and copy
 * exact values. On this 4B a reasoning pass at that job re-opens the door the
 * audit exists to close — it re-thinks, drifts, and echoes source boilerplate
 * instead of correcting (measured on the 117: two verbatim-echo failures that
 * a direct pass answers cleanly). Always run corrections directly. */
export function verificationOptionsFor(refusal = false): GenerationOptions {
	return { reasoning: 'off', maxTokens: refusal ? 120 : 240, temperature: 0 };
}

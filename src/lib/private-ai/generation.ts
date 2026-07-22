import { analyzeQuestion } from '$lib/analysis/query-router';

export interface GenerationOptions {
	reasoning: 'off' | 'on';
	maxTokens: number;
	temperature?: number;
}

export interface GenerationResult {
	text: string;
	ttftMs: number | null;
	tokensPerSecond: number | null;
	completionTokens: number | null;
}

export function generationOptionsFor(
	question: string,
	route: 'targeted' | 'synthesis'
): GenerationOptions {
	// Synthesis runs with reasoning on: the trace streams live as draft notes
	// (perceived latency) and is kept on the turn, collapsed. The budget covers
	// thinking plus the answer. Targeted facts stay direct and fast; the Lite
	// CPU tier is forced off in adaptGenerationOptions.
	if (route === 'synthesis') return { reasoning: 'on', maxTokens: 1100, temperature: 0 };
	const frame = analyzeQuestion(question);
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
export function verificationOptionsFor(): GenerationOptions {
	return { reasoning: 'off', maxTokens: 420, temperature: 0 };
}

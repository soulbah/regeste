export interface GenerationOptions {
	reasoning: 'off' | 'on';
	maxTokens: number;
}

export interface GenerationResult {
	text: string;
	ttftMs: number | null;
	tokensPerSecond: number | null;
	completionTokens: number | null;
}

const SHORT_FACT =
	/^(qui|quel(?:le|s)?|combien|où|quand|who|what|which|how many|where|when)\b|\b(num[ée]ro|number|date|montant|amount|destinataire|recipient)\b/i;

export function generationOptionsFor(
	question: string,
	route: 'targeted' | 'synthesis'
): GenerationOptions {
	if (route === 'synthesis') return { reasoning: 'off', maxTokens: 420 };
	return { reasoning: 'off', maxTokens: SHORT_FACT.test(question.trim()) ? 160 : 320 };
}

/** CPU Qwen can spend its entire synthesis budget inside <think> and produce
 * no answer. Keep reasoning for capable WebGPU tiers; force direct generation
 * and a bounded answer budget on the Lite CPU engine. */
export function adaptGenerationOptions(
	options: GenerationOptions,
	engine: 'webllm' | 'wllama'
): GenerationOptions {
	return engine === 'wllama' && options.reasoning === 'on'
		? { reasoning: 'off', maxTokens: Math.min(options.maxTokens, 420) }
		: options;
}

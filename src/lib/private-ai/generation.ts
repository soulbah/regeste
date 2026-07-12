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
	if (route === 'synthesis') return { reasoning: 'on', maxTokens: 700 };
	return { reasoning: 'off', maxTokens: SHORT_FACT.test(question.trim()) ? 160 : 320 };
}

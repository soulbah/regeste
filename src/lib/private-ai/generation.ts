export interface GenerationOptions {
	reasoning: 'off' | 'on';
}

export interface GenerationResult {
	text: string;
	ttftMs: number | null;
	tokensPerSecond: number | null;
	completionTokens: number | null;
}

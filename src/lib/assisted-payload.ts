export function assistedPayloadBytes(
	question: string,
	excerpts: Array<{ text: string }>,
	conversationContext: string | null
): number {
	const encoder = new TextEncoder();
	return (
		encoder.encode(question).length +
		encoder.encode(conversationContext ?? '').length +
		excerpts.reduce((sum, excerpt) => sum + encoder.encode(excerpt.text).length, 0)
	);
}

export interface AssistedExcerpt {
	text: string;
	label: string;
}

export function buildAssistedUserContent(
	question: string,
	excerpts: AssistedExcerpt[],
	context?: string
): string {
	const conversation = context
		? `Conversation context (reference resolution only, not a source):\n${context}\n\n`
		: '';
	return excerpts.length
		? `${conversation}Excerpts:\n\n${excerpts.map((excerpt, index) => `[${index + 1}] (${excerpt.label})\n${excerpt.text}`).join('\n\n')}\n\nQuestion: ${question}`
		: `${conversation}Question: ${question}`;
}

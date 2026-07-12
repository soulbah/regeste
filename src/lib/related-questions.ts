import { stripThink } from '$lib/private-ai/prompt';

/** Normalize model output and keep stable, unique follow-up questions. */
export function parseRelatedQuestions(raw: string): string[] {
	return [
		...new Set(
			stripThink(raw)
				.split('\n')
				.map((line) => line.replace(/^[\s\-*\d.)]+/, '').trim())
				.filter((line) => line.length > 8 && line.length < 160)
		)
	].slice(0, 3);
}

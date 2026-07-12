import type { LocalMessage } from '$lib/types';

const MAX_PART_CHARS = 700;
const CITATION_MARKER = /\[(?:\d{1,2})\]/g;
const FOLLOW_UP_REFERENCE =
	/\b(?:son|sa|ses|leur|leurs|lui|elle|il|eux|elles|ce|cet|cette|ces|celui|celle|ceux|celles|dernier|derniere|dernière|their|his|her|hers|its|him|them|they|he|she|this|that|former|latter)\b/iu;
const ELLIPTICAL_FOLLOW_UP = /^(?:et\b|and\b|qu['’]en est-il\b|what about\b)/iu;

export interface RetrievalContext {
	previousQuestion: string;
	previousAnswer: string;
	searchQuery: string;
	promptContext: string;
}

function clean(text: string): string {
	return text.replace(CITATION_MARKER, '').replace(/\s+/g, ' ').trim().slice(0, MAX_PART_CHARS);
}

/** Only carry prior turns when the current question actually refers back to them. */
export function needsRetrievalContext(question: string): boolean {
	const normalized = clean(question);
	return FOLLOW_UP_REFERENCE.test(normalized) || ELLIPTICAL_FOLLOW_UP.test(normalized);
}

/**
 * Latest completed exchange before the current question. Prior answers help
 * resolve references, but prompt.ts labels them as context rather than source
 * evidence. Notices and retrieval-preview JSON are never useful context.
 */
export function buildRetrievalContext(
	messages: LocalMessage[],
	currentQuestion: string
): RetrievalContext | null {
	if (!needsRetrievalContext(currentQuestion)) return null;
	let skippedCurrent = false;
	let previousAnswer = '';
	let previousQuestion = '';
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (
			!skippedCurrent &&
			message.role === 'user' &&
			clean(message.content) === clean(currentQuestion)
		) {
			skippedCurrent = true;
			continue;
		}
		if (
			!previousAnswer &&
			message.role === 'assistant' &&
			message.mode !== 'notice' &&
			message.mode !== 'retrieval'
		) {
			previousAnswer = clean(message.content);
			continue;
		}
		if (previousAnswer && message.role === 'user') {
			previousQuestion = clean(message.content);
			break;
		}
	}
	if (!previousQuestion || !previousAnswer) return null;
	const question = clean(currentQuestion);
	return {
		previousQuestion,
		previousAnswer,
		searchQuery: `${previousQuestion}\n${previousAnswer}\n${question}`,
		promptContext: `Previous question: ${previousQuestion}\nPrevious answer: ${previousAnswer}`
	};
}

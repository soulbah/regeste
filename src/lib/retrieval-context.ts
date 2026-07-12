import type { LocalMessage } from '$lib/types';
import { analyzeQuestion } from '$lib/analysis/query-router';

const MAX_PART_CHARS = 700;
const CITATION_MARKER = /\[(?:\d{1,2})\]/g;

export interface RetrievalContext {
	previousQuestion: string;
	previousAnswer: string;
	searchQuery: string;
	/** Current question first so its date scope overrides the referenced turn. */
	analysisQuery: string;
	promptContext: string;
}

function clean(text: string): string {
	return text.replace(CITATION_MARKER, '').replace(/\s+/g, ' ').trim().slice(0, MAX_PART_CHARS);
}

/** Only carry prior turns when the current question actually refers back to them. */
export function needsRetrievalContext(question: string): boolean {
	return analyzeQuestion(clean(question)).referencesPrevious;
}

/**
 * Latest completed exchange before the current question. Prior answers help
 * resolve references, but prompt.ts labels them as context rather than source
 * evidence. Notices and retrieval-preview JSON are never useful context.
 */
export function buildRetrievalContext(
	messages: LocalMessage[],
	currentQuestion: string,
	force = false
): RetrievalContext | null {
	if (!force && !needsRetrievalContext(currentQuestion)) return null;
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
		analysisQuery: `${question}\nPrevious question: ${previousQuestion}`,
		promptContext: `Previous question: ${previousQuestion}\nPrevious answer: ${previousAnswer}`
	};
}

/** Rebuild a multi-step clarification as one compositional query. Assistant
 * prompts are control messages, so only the original question and user slots
 * are carried into analysis/retrieval. */
export function buildClarificationContext(
	messages: LocalMessage[],
	currentQuestion: string,
	clarificationMessageIds: ReadonlySet<string>
): RetrievalContext | null {
	const parts = [clean(currentQuestion)];
	let skippedCurrent = false;
	let awaitingAnswer = false;
	let sawClarification = false;
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (
			!skippedCurrent &&
			message.role === 'user' &&
			clean(message.content) === clean(currentQuestion)
		) {
			skippedCurrent = true;
			continue;
		}
		if (message.role === 'assistant') {
			if (!clarificationMessageIds.has(message.id)) break;
			sawClarification = true;
			awaitingAnswer = true;
			continue;
		}
		if (message.role === 'user' && awaitingAnswer) {
			parts.unshift(clean(message.content));
			awaitingAnswer = false;
		}
	}
	if (!sawClarification || awaitingAnswer || parts.length < 2) return null;
	const analysisQuery = parts.join('\n');
	return {
		previousQuestion: parts[0],
		previousAnswer: '',
		searchQuery: analysisQuery,
		analysisQuery,
		promptContext: `Clarified request: ${analysisQuery}`
	};
}

import type { LocalMessage } from '$lib/types';
import { analyzeQuestion, normalizeQuestion } from '$lib/analysis/query-router';

const MAX_PART_CHARS = 700;
const CITATION_MARKER = /\[(?:\d{1,2})\]/g;
const NO_EXCLUDED_IDS: ReadonlySet<string> = new Set();

export interface RetrievalContext {
	previousQuestion: string;
	previousAnswer: string;
	searchQuery: string;
	/** Current question first so its date scope overrides the referenced turn. */
	analysisQuery: string;
	/** Text ambiguity checks may judge. A follow-up glues two complete questions
	 * into analysisQuery, so only the current turn is safe to inspect; a
	 * clarification continuation reads as one composed question. */
	clarificationQuery: string;
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
	force = false,
	excludeAssistantIds: ReadonlySet<string> = NO_EXCLUDED_IDS
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
			message.mode !== 'retrieval' &&
			!excludeAssistantIds.has(message.id)
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
		clarificationQuery: question,
		promptContext: `Previous question: ${previousQuestion}\nPrevious answer: ${previousAnswer}`
	};
}

/** A clarification reply is a fragment filling a slot ("en juin", "les frais").
 * A turn that is itself a complete question starts a new request, never a slot
 * value — composing it with the pending question pollutes analysis and can
 * re-trigger the same clarification forever. */
function isStandaloneQuestion(text: string): boolean {
	if (text.includes('?')) return true;
	return /^(?:qui|quel(?:le|s|les)?|combien|comment|pourquoi|quand|que|qu|what|which|who|whom|whose|how|why|where|when)\b/u.test(
		normalizeQuestion(text)
	);
}

/** Rebuild a multi-step clarification as one compositional query. Assistant
 * prompts are control messages, so only the original question and user slots
 * are carried into analysis/retrieval. */
export function buildClarificationContext(
	messages: LocalMessage[],
	currentQuestion: string,
	clarificationMessageIds: ReadonlySet<string>
): RetrievalContext | null {
	if (isStandaloneQuestion(currentQuestion)) return null;
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
		clarificationQuery: analysisQuery,
		promptContext: `Clarified request: ${analysisQuery}`
	};
}

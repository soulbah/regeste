import type { LocalMessage } from '$lib/types';
import {
	analyzeQuestion,
	normalizeQuestion,
	questionReferenceKind
} from '$lib/analysis/query-router';
import { significantQueryTokens } from '$lib/pipeline/fuzzy';

const MAX_PART_CHARS = 700;
const CITATION_MARKER = /\[(?:\d{1,2})\]/g;
const NO_EXCLUDED_IDS: ReadonlySet<string> = new Set();

export interface RetrievalContext {
	previousQuestion: string;
	previousAnswer: string;
	/** Documents that grounded the referenced answer. A contextual follow-up
	 * searches this evidence lane first, instead of drifting across unrelated
	 * attachments that happen to contain the same generic value type. */
	evidenceDocumentNames: string[];
	/** Context-complete question used only by deterministic evidence extractors.
	 * User-facing generation still receives the current turn unchanged. */
	resolvedQuestion: string;
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

// A dispute never names its referent ("Non, l'acompte est beaucoup plus"), so
// pronoun detection misses it — yet it needs the contested answer in context
// more than any other turn. Leads are matched on normalized text (apostrophes
// and accents stripped).
const CONTESTATION_LEAD =
	/^(?:non\b|no\b|faux\b|c est faux|incorrect\b|pas du tout\b|tu te trompes|vous vous trompez|je ne suis pas d accord|ce n est pas vrai|not true\b|that s wrong|you are wrong|wrong\b)/u;

/** A turn that disputes the previous answer rather than asking something new. */
export function isContestation(text: string): boolean {
	return CONTESTATION_LEAD.test(normalizeQuestion(clean(text)));
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
	excludeAssistantIds: ReadonlySet<string> = NO_EXCLUDED_IDS,
	citationsByMessage: Readonly<Record<string, ReadonlyArray<{ documentName: string }>>> = {}
): RetrievalContext | null {
	if (!force && !needsRetrievalContext(currentQuestion)) return null;
	let skippedCurrent = false;
	let previousAnswer = '';
	let previousAnswerId = '';
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
			previousAnswerId = message.id;
			continue;
		}
		if (previousAnswer && message.role === 'user') {
			previousQuestion = clean(message.content);
			break;
		}
	}
	if (!previousQuestion || !previousAnswer) return null;
	const question = clean(currentQuestion);
	const conjunction = analyzeQuestion(question).locale === 'fr' ? ' et ' : ' and ';
	// A pronoun genuinely needs the cited evidence lane. A bare discourse lead
	// ("Et…" / "And…") may introduce a new subject. Two content tokens after
	// standard library stopword removal make it independently searchable; shorter
	// fragments stay in the cited lane. No document vocabulary is maintained.
	const referenceKind = questionReferenceKind(question);
	const selfContainedContinuation =
		referenceKind === 'continuation' && significantQueryTokens(question, 3, false).length >= 2;
	const pinEvidenceLane =
		force ||
		referenceKind === 'anaphoric' ||
		(referenceKind === 'continuation' && !selfContainedContinuation);
	const composedQuestion = `${previousQuestion.replace(/[?.!]+$/u, '').trimEnd()}${conjunction}${question}`;
	const contextualSearch = `${previousQuestion}\n${previousAnswer}\n${question}`;
	const contextualAnalysis = `${question}\nPrevious question: ${previousQuestion}`;
	return {
		previousQuestion,
		previousAnswer,
		evidenceDocumentNames: pinEvidenceLane
			? [...new Set((citationsByMessage[previousAnswerId] ?? []).map((row) => row.documentName))]
			: [],
		resolvedQuestion: selfContainedContinuation ? question : composedQuestion,
		searchQuery: selfContainedContinuation ? question : contextualSearch,
		analysisQuery: selfContainedContinuation ? question : contextualAnalysis,
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
		evidenceDocumentNames: [],
		resolvedQuestion: analysisQuery,
		searchQuery: analysisQuery,
		analysisQuery,
		clarificationQuery: analysisQuery,
		promptContext: `Clarified request: ${analysisQuery}`
	};
}

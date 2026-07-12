// Grounded-QA prompt building and citation post-processing. Pure and tested:
// small models hallucinate citations, so markers are validated against the
// retrieved set after generation — an invalid [n] is silently dropped.

import type { SearchHit } from '$lib/types';
import { queryCoverage } from '$lib/pipeline/retrieval';

export const SYSTEM_PROMPT = `You are a careful assistant answering questions strictly from the numbered document excerpts provided.
Rules:
- Answer in the language of the question.
- Answer the exact question immediately. For a name, number, date, or amount, use one short natural sentence unless clarification is necessary.
- Preserve names as written. Do not split a full name into an alias or add phrases such as "under the name" unless the source explicitly distinguishes them.
- Use ONLY the excerpts. If they do not contain enough information, reply exactly: "I couldn't find enough information in the attached documents to answer this." (translated to the question's language) and nothing else.
- Cite every factual statement with the excerpt number in square brackets, e.g. [1] or [2][3].
- Conversation context may resolve pronouns, but it is not evidence. Never cite it or repeat a fact that current excerpts do not support.
- Be concise. No reasoning preamble.`;

export function buildUserPrompt(
	question: string,
	hits: SearchHit[],
	conversationContext: string | null = null
): string {
	const excerpts = hits
		.map((h, i) => {
			const locator = h.page ? `page ${h.page}` : (h.headingPath ?? '');
			return `[${i + 1}] (${h.documentName}${locator ? ` · ${locator}` : ''})\n${h.text}`;
		})
		.join('\n\n');
	const context = conversationContext
		? `Conversation context (reference resolution only, not a source):\n${conversationContext}\n\n`
		: '';
	return `${context}Excerpts:\n\n${excerpts}\n\nQuestion: ${question}`;
}

/**
 * Reasoning models (Qwen3) emit <think>…</think> before the answer. Strip it
 * for display and post-processing; an unclosed block (mid-stream) yields ''.
 */
export function stripThink(text: string): string {
	const withoutClosed = text.replace(/<think>[\s\S]*?<\/think>/g, '');
	const openIdx = withoutClosed.indexOf('<think>');
	return (openIdx >= 0 ? withoutClosed.slice(0, openIdx) : withoutClosed).trimStart();
}

/** True while the tail of the stream is inside an unclosed <think> block. */
export function isThinking(text: string): boolean {
	const lastOpen = text.lastIndexOf('<think>');
	return lastOpen >= 0 && text.indexOf('</think>', lastOpen) === -1;
}

export interface CitationRef {
	/** 1-based excerpt number as emitted by the model. */
	n: number;
	hit: SearchHit;
}

/** Repair citation numbering for messages persisted before sparse markers were compacted. */
export function compactCitationMarkers(text: string, citationCount: number): string {
	if (!citationCount) return text;
	const numbers = [...new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))].sort(
		(a, b) => a - b
	);
	if (numbers.length !== citationCount) return text;
	const compact = new Map(numbers.map((original, index) => [original, index + 1]));
	return text.replace(/\[(\d{1,2})\]/g, (_, raw: string) => `[${compact.get(Number(raw))}]`);
}

/**
 * Validate [n] markers against the retrieved set. Returns the cleaned text
 * (invalid markers removed) and the ordered unique list of valid citations.
 */
export function resolveCitations(
	text: string,
	hits: SearchHit[]
): { text: string; citations: CitationRef[] } {
	const sourceNumbers = [
		...new Set(
			[...text.matchAll(/\[(\d{1,2})\]/g)]
				.map((match) => Number(match[1]))
				.filter((n) => n >= 1 && n <= hits.length)
		)
	].sort((a, b) => a - b);
	const compactNumber = new Map(sourceNumbers.map((original, index) => [original, index + 1]));
	const cleaned = text.replace(/\[(\d{1,2})\]/g, (_marker, numStr: string) => {
		const n = Number(numStr);
		const compact = compactNumber.get(n);
		return compact === undefined ? '' : `[${compact}]`;
	});
	return {
		text: cleaned,
		citations: sourceNumbers.map((original, index) => ({
			n: index + 1,
			hit: hits[original - 1]
		}))
	};
}

/** For one-fact answers, bind citation to passage that best supports words/numbers actually written. */
export function resolveTargetedCitations(
	text: string,
	hits: SearchHit[],
	question: string
): { text: string; citations: CitationRef[] } {
	if (!/\[\d{1,2}\]/.test(text) || !hits.length) return resolveCitations(text, hits);
	// Coordinated questions and answers can contain several independently
	// sourced facts. Collapsing every marker to one "best" passage would turn a
	// correct multi-source answer into a misleading single citation.
	if (/\b(et|ainsi que|and|as well as)\b/i.test(question) || /[;\n]/.test(text)) {
		return resolveCitations(text, hits);
	}
	const grounding = `${question} ${text.replace(/\[\d{1,2}\]/g, '')}`;
	const best = [...hits]
		.map((hit) => ({ hit, support: queryCoverage(grounding, hit.text) }))
		.sort((a, b) => b.support - a.support || b.hit.score - a.hit.score)[0];
	if (!best || best.support === 0) return resolveCitations(text, hits);
	return {
		text: text.replace(/(?:\s*\[\d{1,2}\])+/g, ' [1]'),
		citations: [{ n: 1, hit: best.hit }]
	};
}

// Grounded-QA prompt building and citation post-processing. Pure and tested:
// small models hallucinate citations, so markers are validated against the
// retrieved set after generation — an invalid [n] is silently dropped.

import type { SearchHit } from '$lib/types';

export const SYSTEM_PROMPT = `You are a careful assistant answering questions strictly from the numbered document excerpts provided.
Rules:
- Answer in the language of the question.
- Use ONLY the excerpts. If they do not contain enough information, reply exactly: "I couldn't find enough information in the attached documents to answer this." (translated to the question's language) and nothing else.
- Cite every factual statement with the excerpt number in square brackets, e.g. [1] or [2][3].
- Be concise.`;

export function buildUserPrompt(question: string, hits: SearchHit[]): string {
	const excerpts = hits
		.map((h, i) => {
			const locator = h.page ? `page ${h.page}` : (h.headingPath ?? '');
			return `[${i + 1}] (${h.documentName}${locator ? ` · ${locator}` : ''})\n${h.text}`;
		})
		.join('\n\n');
	return `Excerpts:\n\n${excerpts}\n\nQuestion: ${question}`;
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

/**
 * Validate [n] markers against the retrieved set. Returns the cleaned text
 * (invalid markers removed) and the ordered unique list of valid citations.
 */
export function resolveCitations(
	text: string,
	hits: SearchHit[]
): { text: string; citations: CitationRef[] } {
	const seen = new Map<number, CitationRef>();
	const cleaned = text.replace(/\[(\d{1,2})\]/g, (marker, numStr: string) => {
		const n = Number(numStr);
		if (n >= 1 && n <= hits.length) {
			if (!seen.has(n)) seen.set(n, { n, hit: hits[n - 1] });
			return marker;
		}
		return '';
	});
	return { text: cleaned, citations: [...seen.values()].sort((a, b) => a.n - b.n) };
}

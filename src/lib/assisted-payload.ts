import { evidenceText } from '$lib/pipeline/evidence-text';

export interface AssistedExcerpt {
	text: string;
	label: string;
}

/**
 * The exact excerpts the request will carry. Built here so the byte count shown
 * before sending is computed from the same objects that are sent.
 *
 * The label exists so the model can tell two sources apart; an ordinal does
 * that. A filename is not excerpt content and must not leave the device — the
 * answer's citations are rebound to the local hits by index on return, so the
 * real name never needs to make the trip.
 */
export function buildAssistedExcerpts(
	hits: Array<{
		text: string;
		structuralContext?: string | null;
		pageContext?: string | null;
		documentId: string;
		page?: number | null;
		headingPath?: string | null;
	}>
): AssistedExcerpt[] {
	const anonymousNames = new Map<string, string>();
	return hits.map((hit) => {
		let name = anonymousNames.get(hit.documentId);
		if (!name) {
			name = `Document ${anonymousNames.size + 1}`;
			anonymousNames.set(hit.documentId, name);
		}
		const locator = hit.page
			? ` · page ${hit.page}`
			: hit.headingPath
				? ` · ${hit.headingPath}`
				: '';
		return { text: evidenceText(hit), label: `${name}${locator}` };
	});
}

/** Everything in the request body that carries user text. The label counts:
 * it is sent, so the figure shown before sending has to include it. */
export function assistedPayloadBytes(
	question: string,
	excerpts: Array<{ text: string; label?: string }>,
	conversationContext: string | null
): number {
	const encoder = new TextEncoder();
	return (
		encoder.encode(question).length +
		encoder.encode(conversationContext ?? '').length +
		excerpts.reduce(
			(sum, excerpt) =>
				sum + encoder.encode(excerpt.text).length + encoder.encode(excerpt.label ?? '').length,
			0
		)
	);
}

import type { SearchHit } from '$lib/types';
import { normalizeAmountsForModel } from '$lib/numbers';

/** Text a retriever or answer model may read. Table labels reconstructed from
 * geometry are evidence too; keeping them beside source text preserves which
 * value belongs to which column without changing citable source text.
 * Money literals are normalized to the value they denote before a model reads
 * them: a document that prints "20 00 € HT" with a split thousands group makes
 * small models state "20 000 € HT", and the deterministic grounding check then
 * refuses an answer whose value was right all along. The raw text stays in the
 * store and the viewer; only what a model reads is cleaned. */
export function evidenceText(
	hit: Pick<SearchHit, 'text' | 'structuralContext' | 'pageContext'>
): string {
	return normalizeAmountsForModel(
		[...new Set([hit.pageContext, hit.structuralContext, hit.text].filter(Boolean))].join('\n')
	);
}

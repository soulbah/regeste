import type { SearchHit } from '$lib/types';

/** Text a retriever or answer model may read. Table labels reconstructed from
 * geometry are evidence too; keeping them beside source text preserves which
 * value belongs to which column without changing citable source text. */
export function evidenceText(hit: Pick<SearchHit, 'text' | 'structuralContext'>): string {
	return [hit.structuralContext, hit.text].filter(Boolean).join('\n');
}

import { describe, expect, it } from 'vitest';
import { assistedPayloadBytes, buildAssistedExcerpts } from './assisted-payload';

describe('assistedPayloadBytes', () => {
	it('counts explicitly reviewed conversation context', () => {
		const withoutContext = assistedPayloadBytes('Question', [{ text: 'Excerpt' }], null);
		const context = 'Previous answer: JOHN DOE';
		expect(assistedPayloadBytes('Question', [{ text: 'Excerpt' }], context)).toBe(
			withoutContext + new TextEncoder().encode(context).length
		);
	});

	it('counts the label, which is part of what leaves the device', () => {
		const excerpts = [{ text: 'Excerpt', label: 'Document 1 · page 3' }];
		expect(assistedPayloadBytes('Q', excerpts, null)).toBe(
			assistedPayloadBytes('Q', [{ text: 'Excerpt' }], null) +
				new TextEncoder().encode('Document 1 · page 3').length
		);
	});
});

describe('buildAssistedExcerpts', () => {
	it('numbers documents instead of naming them, stably per document', () => {
		const excerpts = buildAssistedExcerpts([
			{ text: 'a', documentId: 'doc-a', page: 3, headingPath: null },
			{ text: 'b', documentId: 'doc-b', page: null, headingPath: 'Article 7' },
			{ text: 'c', documentId: 'doc-a', page: 4, headingPath: null }
		]);
		expect(excerpts.map((excerpt) => excerpt.label)).toEqual([
			'Document 1 · page 3',
			'Document 2 · Article 7',
			'Document 1 · page 4'
		]);
	});

	it('never carries a filename', () => {
		const excerpts = buildAssistedExcerpts([
			{ text: 'a', documentId: 'doc-a', page: 1, headingPath: null }
		]);
		expect(JSON.stringify(excerpts)).not.toContain('doc-a');
	});
});

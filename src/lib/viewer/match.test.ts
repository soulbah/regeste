import { describe, expect, it } from 'vitest';
import { findMatchRange, findMatchRanges } from './match';

describe('findMatchRange', () => {
	it('finds a passage inside a single item', () => {
		const items = ['Preamble text.', 'The tenant shall give notice.', 'Closing.'];
		expect(findMatchRange(items, 'tenant shall give')).toEqual({ start: 1, end: 1 });
	});

	it('finds a passage spanning several items', () => {
		const items = ['The tenant shall', 'give written notice', 'within thirty days.'];
		expect(findMatchRange(items, 'shall give written notice within')).toEqual({
			start: 0,
			end: 2
		});
	});

	it('matches despite whitespace and case differences', () => {
		const items = ['THE  Tenant\tshall', ' give   Notice '];
		expect(findMatchRange(items, 'the tenant shall give notice')).toEqual({ start: 0, end: 1 });
	});

	it('falls back to a prefix match for long partially-rewritten passages', () => {
		const head = 'a'.repeat(100) + ' ' + 'b'.repeat(100);
		const items = [head, 'unrelated tail on the page'];
		const needle = head + ' completely different ending that never appears';
		expect(findMatchRange(items, needle)).toEqual({ start: 0, end: 0 });
	});

	it('returns null when the passage is absent', () => {
		expect(findMatchRange(['some page text'], 'not present at all')).toBeNull();
		expect(findMatchRange([], 'anything')).toBeNull();
		expect(findMatchRange(['text'], '   ')).toBeNull();
	});
});

describe('findMatchRanges', () => {
	it('returns the contiguous match as a single range', () => {
		const items = ['The tenant shall', 'give written notice', 'within thirty days.'];
		expect(findMatchRanges(items, 'shall give written notice within')).toEqual([
			{ start: 0, end: 2 }
		]);
	});

	it('highlights a table row whose cells sit apart in the item stream', () => {
		// A routed table line joins label and value, but the page emits the
		// label early and the amount much later (column-major content stream).
		const items = [
			'Tenue de compte',
			'Fourniture d\u2019une carte',
			'Retrait d\u2019esp\u00e8ces',
			'4,85 \u20ac/trimestre soit pour',
			'information, 19,40 \u20ac/an'
		];
		const ranges = findMatchRanges(
			items,
			'Tenue de compte 4,85 \u20ac/trimestre soit pour information, 19,40 \u20ac/an'
		);
		expect(ranges).toEqual([
			{ start: 0, end: 0 },
			{ start: 3, end: 4 }
		]);
	});

	it('refuses to highlight when only scraps of the passage exist', () => {
		// Two common words somewhere on the page must not paint a fake citation.
		const items = ['des frais de dossier', 'et autres services'];
		expect(findMatchRanges(items, 'des frais totalement inconnus ailleurs pareil')).toEqual([]);
	});

	it('merges adjacent runs into one range', () => {
		const items = ['Commission', 'd\u2019intervention', '8,00 \u20ac/op\u00e9ration'];
		const ranges = findMatchRanges(
			items,
			'Commission d\u2019intervention 8,00 \u20ac/op\u00e9ration'
		);
		expect(ranges).toEqual([{ start: 0, end: 2 }]);
	});
});

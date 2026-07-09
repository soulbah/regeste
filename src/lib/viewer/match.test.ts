import { describe, expect, it } from 'vitest';
import { findMatchRange } from './match';

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

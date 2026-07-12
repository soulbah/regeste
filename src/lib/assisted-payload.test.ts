import { describe, expect, it } from 'vitest';
import { assistedPayloadBytes } from './assisted-payload';

describe('assistedPayloadBytes', () => {
	it('counts explicitly reviewed conversation context', () => {
		const withoutContext = assistedPayloadBytes('Question', [{ text: 'Excerpt' }], null);
		const context = 'Previous answer: JOHN DOE';
		expect(assistedPayloadBytes('Question', [{ text: 'Excerpt' }], context)).toBe(
			withoutContext + new TextEncoder().encode(context).length
		);
	});
});

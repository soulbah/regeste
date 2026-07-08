import { describe, expect, it } from 'vitest';
import { titleFromMessage } from './chats.svelte';

describe('titleFromMessage', () => {
	it('keeps short questions as-is', () => {
		expect(titleFromMessage('Quel est le préavis ?')).toBe('Quel est le préavis ?');
	});

	it('cuts long questions at a word boundary with ellipsis', () => {
		const t = titleFromMessage(
			'Quelles sont les obligations de confidentialité prévues par le contrat de prestation ?'
		);
		expect(t.length).toBeLessThanOrEqual(41);
		expect(t.endsWith('…')).toBe(true);
		expect(t).not.toMatch(/\s…$/);
	});

	it('collapses whitespace and falls back on empty input', () => {
		expect(titleFromMessage('  \n\t ')).toBe('New chat');
		expect(titleFromMessage('a\n\nb   c')).toBe('a b c');
	});
});

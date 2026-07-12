import { describe, expect, it } from 'vitest';
import { buildAssistedUserContent } from './assisted-prompt';

describe('buildAssistedUserContent', () => {
	it('labels reviewed conversation context as non-source material', () => {
		const prompt = buildAssistedUserContent(
			'Quel est son numéro ?',
			[{ label: 'contract.pdf · page 8', text: 'JOHN DOE — 4242' }],
			'Previous answer: JOHN DOE'
		);
		expect(prompt).toContain('reference resolution only, not a source');
		expect(prompt).toContain('[1] (contract.pdf · page 8)');
		expect(prompt.endsWith('Question: Quel est son numéro ?')).toBe(true);
	});
});

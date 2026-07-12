import { describe, expect, it } from 'vitest';
import { generationOptionsFor } from './generation';

describe('generationOptionsFor', () => {
	it('uses short budgets for French and English facts', () => {
		expect(generationOptionsFor('Qui est le destinataire ?', 'targeted')).toEqual({
			reasoning: 'off',
			maxTokens: 160
		});
		expect(generationOptionsFor('What is their account number?', 'targeted').maxTokens).toBe(160);
	});

	it('keeps a deliberate budget for synthesis', () => {
		expect(generationOptionsFor('Compare les contrats', 'synthesis')).toEqual({
			reasoning: 'on',
			maxTokens: 700
		});
	});
});

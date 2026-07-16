import { describe, expect, it } from 'vitest';
import { adaptGenerationOptions, generationOptionsFor } from './generation';

describe('generationOptionsFor', () => {
	it('uses short budgets for French and English facts', () => {
		expect(generationOptionsFor('Qui est le destinataire ?', 'targeted')).toEqual({
			reasoning: 'off',
			maxTokens: 160,
			temperature: 0
		});
		expect(generationOptionsFor('What is their account number?', 'targeted').maxTokens).toBe(160);
	});

	it('keeps a deliberate budget for synthesis', () => {
		expect(generationOptionsFor('Compare les contrats', 'synthesis')).toEqual({
			reasoning: 'off',
			maxTokens: 420,
			temperature: 0
		});
	});

	it('prevents Lite CPU synthesis from spending its budget in hidden reasoning', () => {
		expect(adaptGenerationOptions({ reasoning: 'on', maxTokens: 700 }, 'wllama')).toEqual({
			reasoning: 'off',
			maxTokens: 420
		});
		expect(adaptGenerationOptions({ reasoning: 'on', maxTokens: 700 }, 'webllm')).toEqual({
			reasoning: 'on',
			maxTokens: 700
		});
	});
});

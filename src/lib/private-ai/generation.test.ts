import { describe, expect, it } from 'vitest';
import {
	adaptGenerationOptions,
	generationOptionsFor,
	requiresSemanticSlotSynthesis,
	usesCompactFactualContext,
	verificationOptionsFor
} from './generation';

describe('generationOptionsFor', () => {
	it('uses short budgets for French and English facts', () => {
		expect(generationOptionsFor('Qui est le destinataire ?', 'targeted')).toEqual({
			reasoning: 'off',
			maxTokens: 160,
			temperature: 0
		});
		expect(generationOptionsFor('What is their account number?', 'targeted').maxTokens).toBe(160);
	});

	it('keeps coordinated factual synthesis direct and short', () => {
		expect(
			generationOptionsFor('Qui détient le compte et quel est son identifiant ?', 'synthesis')
		).toEqual({
			reasoning: 'off',
			maxTokens: 240,
			temperature: 0
		});
	});

	it('never collapses calculation evidence to one passage', () => {
		expect(
			usesCompactFactualContext(
				'Quel total faut-il prévoir et comment se décompose-t-il ?',
				'synthesis'
			)
		).toBe(false);
		expect(
			usesCompactFactualContext('Qui détient le dossier et quel est son identifiant ?', 'synthesis')
		).toBe(true);
	});

	it('keeps semantic synthesis for unpunctuated multi-slot questions only', () => {
		expect(
			requiresSemanticSlotSynthesis(
				'Quel montant John et Jane doivent-ils payer et à quelle date est-il dû et quelle est leur adresse ?',
				'synthesis'
			)
		).toBe(true);
		expect(requiresSemanticSlotSynthesis('Et quel est le numéro du compte ?', 'targeted')).toBe(
			false
		);
	});

	it('reserves reasoning synthesis for explanatory work', () => {
		expect(generationOptionsFor('Compare les contrats', 'synthesis')).toEqual({
			reasoning: 'on',
			maxTokens: 1100,
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

	it('bounds refusal verification more tightly than answer correction', () => {
		expect(verificationOptionsFor()).toEqual({ reasoning: 'off', maxTokens: 240, temperature: 0 });
		expect(verificationOptionsFor(true)).toEqual({
			reasoning: 'off',
			maxTokens: 120,
			temperature: 0
		});
	});
});

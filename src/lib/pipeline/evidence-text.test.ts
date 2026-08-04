import { describe, expect, it } from 'vitest';
import { normalizeAmountsForModel } from '$lib/numbers';
import { evidenceText } from './evidence-text';

describe('normalizeAmountsForModel', () => {
	it('joins a thousands group split by a space, keeping the currency suffix', () => {
		// Measured live: the fee agreement prints "20 00 € HT" and a small model
		// reading it verbatim states "20 000 € HT". The model-facing form must be
		// the value the literal denotes.
		expect(
			normalizeAmountsForModel('un montant forfaitaire global : 20 00 € HT, pour un recours')
		).toBe('un montant forfaitaire global : 2000 € HT, pour un recours');
	});

	it('leaves a regular French amount and its decimals untouched', () => {
		expect(normalizeAmountsForModel('Le solde est de 1 234,56 EUR au 23 juillet 2026.')).toBe(
			'Le solde est de 1 234,56 EUR au 23 juillet 2026.'
		);
	});

	it('keeps standard thousands groupings so extractive answers quote the document', () => {
		expect(normalizeAmountsForModel('Dommages : 40 000 € · RC : 6 000 000 €')).toBe(
			'Dommages : 40 000 € · RC : 6 000 000 €'
		);
	});

	it('leaves text without money untouched', () => {
		expect(normalizeAmountsForModel('La durée est de 18 à 24 mois, page 10.')).toBe(
			'La durée est de 18 à 24 mois, page 10.'
		);
	});
});

describe('evidenceText', () => {
	it('normalizes money literals before a model reads the passage', () => {
		const hit = {
			pageContext: 'Page 10 sur 14',
			structuralContext: null,
			text: 'par un montant forfaitaire global correspondant à : 20 00 € HT'
		};
		expect(evidenceText(hit)).toContain('2000 € HT');
		expect(evidenceText(hit)).not.toContain('20 00 € HT');
	});
});

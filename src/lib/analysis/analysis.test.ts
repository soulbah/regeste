import { describe, expect, it } from 'vitest';
import { analyzeQuestion, questionLocale, routeQuestion } from './query-router';
import { extractMoneyCandidates } from './money';
import { aggregateMoney } from './aggregate';
import type { SearchHit } from '$lib/types';

const chunk = (id: number, doc: string, text: string): SearchHit => ({
	chunkId: id,
	documentId: doc,
	documentName: `${doc}.pdf`,
	text,
	page: 1,
	headingPath: null,
	score: 0
});

describe('query routing', () => {
	it('routes exhaustive totals without mistaking a single invoice total', () => {
		expect(routeQuestion('Quelle est la somme TTC de toutes les factures ?')).toBe('aggregate');
		expect(routeQuestion('Quel est le total de la facture F-102 ?')).toBe('targeted');
		expect(routeQuestion('Compare les obligations des deux contrats')).toBe('synthesis');
		expect(routeQuestion('Dresse un portrait complet de CR-204 sans confondre les sources')).toBe(
			'synthesis'
		);
		expect(routeQuestion('Que sait-on de Camille dans tous les documents ?')).toBe('synthesis');
		expect(
			routeQuestion(
				'Le prix et le montant du prêt sont-ils identiques ? Cite séparément les pages qui prouvent chaque montant.'
			)
		).toBe('synthesis');
	});

	it.each([
		["Combien j'ai envoyé au total ?", 'aggregate', 'sent'],
		['Combien ai-je envoyé en tout ?', 'aggregate', 'sent'],
		['Montant total envoyé', 'aggregate', 'sent'],
		['How much did I send?', 'aggregate', 'sent'],
		['Total des montants reçus', 'aggregate', 'received'],
		['Liste les frais', 'aggregate', 'fee']
	] as const)('composes operation and financial role for %s', (question, route, role) => {
		const analysis = analyzeQuestion(question);
		expect(analysis.route).toBe(route);
		expect(analysis.moneyRole).toBe(role);
		expect(analysis.exhaustive).toBe(true);
	});

	it.each([
		['Quel est le total de la facture F-102 ?', null],
		['Combien ai-je envoyé pour la transaction T-123 ?', 'sent'],
		['How much did I send for the transfer T-456?', 'sent'],
		['Quel montant ai-je envoyé page 3 ?', 'sent']
	] as const)('preserves explicit single-record scope for %s', (question, role) => {
		const analysis = analyzeQuestion(question);
		expect(analysis.route).toBe('targeted');
		expect(analysis.moneyRole).toBe(role);
	});

	it('keeps short French questions in French', () => {
		expect(questionLocale('Quelle est la somme TTC de toutes les factures ?')).toBe('fr');
		expect(questionLocale('What is the sum across all invoices?')).toBe('en');
	});

	it('lets a follow-up month override the previous aggregate month', () => {
		const result = analyzeQuestion(
			'Et en juillet ?\nPrevious question: Combien ai-je envoyé en juin ?'
		);
		expect(result.route).toBe('aggregate');
		expect(result.moneyRole).toBe('sent');
		expect(result.temporal?.month).toBe(7);
	});

	it('clarifies ambiguous aggregate slots progressively', () => {
		expect(analyzeQuestion('Quel est le total ?').clarification).toBe('scope');
		expect(
			analyzeQuestion('Tous les documents sélectionnés\nPrevious question: Quel est le total ?')
				.clarification
		).toBe('financial_role');
		const resolved = analyzeQuestion(
			'Montants envoyés\nPrevious question: Tous les documents sélectionnés\nQuel est le total ?'
		);
		expect(resolved).toMatchObject({
			route: 'aggregate',
			moneyRole: 'sent',
			clarification: null
		});
	});
});

describe('money extraction', () => {
	it('parses French, English, and negative amounts into exact minor units', () => {
		expect(extractMoneyCandidates('Total TTC 1 234,56 €')[0].valueMinor).toBe(123456);
		expect(extractMoneyCandidates('Amount due: USD 1,234.56')[0].valueMinor).toBe(123456);
		expect(extractMoneyCandidates('Grand total (42,10 EUR)')[0].valueMinor).toBe(-4210);
	});

	it('keeps adjacent EUR and zero-decimal GNF values in their explicit currencies', () => {
		const values = extractMoneyCandidates(
			'Montant 149,04 € Montant reçu par le bénéficiaire 1 499 472 GNF'
		);
		expect(values).toMatchObject([
			{ valueMinor: 14904, currency: 'EUR', kind: 'amount' },
			{ valueMinor: 1499472, currency: 'GNF', kind: 'received' }
		]);
	});

	it('reconstructs a received-amount label wrapped around the value line', () => {
		const values = extractMoneyCandidates(
			'Montant reçu par le\nMontant 149,04 € 1 499 472 GNF\nbénéficiaire\nTaux de change : 1 € = 10 060,8691 GNF'
		);
		expect(values).toMatchObject([
			{ valueMinor: 14904, currency: 'EUR', kind: 'amount' },
			{ valueMinor: 1499472, currency: 'GNF', kind: 'received' }
		]);
		expect(values).toHaveLength(2);
	});
});

describe('deterministic aggregation', () => {
	it('covers every document and groups currencies', () => {
		const result = aggregateMoney('Somme TTC de toutes les factures', [
			chunk(1, 'a', 'Total TTC 100,00 €'),
			chunk(2, 'b', 'Net à payer 25,50 EUR'),
			chunk(3, 'c', 'Total due $10.00')
		]);
		expect(result.facts).toHaveLength(3);
		expect(result.groups).toEqual([
			{ currency: 'EUR', valueMinor: 12550, count: 2 },
			{ currency: 'USD', valueMinor: 1000, count: 1 }
		]);
	});

	it('does not guess when one document has conflicting totals', () => {
		const result = aggregateMoney('Somme TTC de toutes les factures', [
			chunk(1, 'a', 'Total TTC 100,00 €\nTotal TTC 120,00 €')
		]);
		expect(result.facts).toHaveLength(0);
		expect(result.ambiguousDocuments).toEqual(['a.pdf']);
	});
});

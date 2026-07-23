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
		expect(routeQuestion('Quels droits sont prévus sur les données personnelles ?')).toBe(
			'synthesis'
		);
		expect(routeQuestion('Cite les onze événements ouvrant assistance')).toBe('synthesis');
		expect(routeQuestion('Qui sont les vendeurs ?')).toBe('synthesis');
		expect(routeQuestion('Liste les frais')).toBe('aggregate');
		expect(
			routeQuestion(
				'Le prix et le montant du prêt sont-ils identiques ? Cite séparément les pages qui prouvent chaque montant.'
			)
		).toBe('synthesis');
	});

	it('keeps non-money min/max/count fact questions out of financial aggregation', () => {
		// Regression: "maximale"/"nombre de" routed duration and limit lookups to
		// the money pipeline, answering with an unrelated money total.
		expect(routeQuestion('Quelle est sa durée maximale ?')).toBe('targeted');
		expect(routeQuestion('Et sa limite en nombre de nuits ?')).toBe('targeted');
		expect(routeQuestion('Quel est le montant maximum envoyé ?')).toBe('aggregate');
		expect(routeQuestion('Combien de transferts en juin ?')).toBe('aggregate');
	});

	it('does not confuse French cost questions with English count', () => {
		for (const question of [
			'Quel est le coût du prêt ?',
			'Combien coute la maison ?',
			'Combien coûte cette acquisition ?'
		]) {
			const analysis = analyzeQuestion(question);
			expect(analysis.route).toBe('targeted');
			expect(analysis.operation).toBeNull();
		}
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

	it('excludes weak OCR amounts from exact arithmetic', () => {
		const weak = { ...chunk(1, 'scan', 'Total TTC 900,00 EUR'), ocrConfidence: 0.61 };
		const native = chunk(2, 'native', 'Total TTC 100,00 EUR');
		const result = aggregateMoney('Somme TTC de toutes les factures', [weak, native]);
		expect(result.facts.map((fact) => fact.documentId)).toEqual(['native']);
		expect(result.groups).toEqual([{ currency: 'EUR', valueMinor: 10000, count: 1 }]);
	});
});

// "Combien dois-je payer au total ?" over an amortization notice: the bare
// row amounts carry no currency symbol, so the generic extractor never made
// records of them and the model approximated a 240-row sum. Schedule rows now
// become one record per installment (repeating-column analysis), and the
// exact aggregate answers.
describe('schedule aggregation', () => {
	const scheduleChunk = (id: number, rows: string[]) =>
		chunk(id, 'loan', ['Echéancier de remboursement (en euros)', ...rows].join('\n'));
	const rows = [
		'1 05.11.2025 14 949,07 69,39 50,93 18,46',
		...Array.from({ length: 12 }, (_, index) => {
			const month = String(((index + 11) % 12) + 1).padStart(2, '0');
			const year = index < 1 ? 2025 : 2026;
			return `${index + 2} 05.${month}.${year} 14 ${898 - index * 51},05 75,81 51,02 24,79`;
		})
	];

	it('sums the installment column exactly, one record per dated row', () => {
		const result = aggregateMoney('Combien dois-je payer au total ?', [
			scheduleChunk(1, rows.slice(0, 7)),
			scheduleChunk(2, rows.slice(7))
		]);
		expect(result.count).toBe(13);
		expect(result.groups).toEqual([{ currency: 'EUR', valueMinor: 6939 + 12 * 7581, count: 13 }]);
	});

	it('builds no schedule records without a repeating column or enough rows', () => {
		// Too few rows.
		const short = aggregateMoney('Combien dois-je payer au total ?', [
			scheduleChunk(1, rows.slice(0, 4))
		]);
		expect(short.count).toBe(0);
		// Prose document: untouched behavior.
		const prose = aggregateMoney('Combien dois-je payer au total ?', [
			chunk(1, 'contract', 'Le loyer mensuel est de 850,00 € payable le 5 de chaque mois.')
		]);
		expect(prose.facts.every((fact) => !fact.recordKey.includes(':schedule:'))).toBe(true);
	});
});

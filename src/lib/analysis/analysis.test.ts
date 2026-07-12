import { describe, expect, it } from 'vitest';
import { questionLocale, routeQuestion } from './query-router';
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
	});

	it('keeps short French questions in French', () => {
		expect(questionLocale('Quelle est la somme TTC de toutes les factures ?')).toBe('fr');
		expect(questionLocale('What is the sum across all invoices?')).toBe('en');
	});
});

describe('money extraction', () => {
	it('parses French, English, and negative amounts into exact minor units', () => {
		expect(extractMoneyCandidates('Total TTC 1 234,56 €')[0].valueMinor).toBe(123456);
		expect(extractMoneyCandidates('Amount due: USD 1,234.56')[0].valueMinor).toBe(123456);
		expect(extractMoneyCandidates('Grand total (42,10 EUR)')[0].valueMinor).toBe(-4210);
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

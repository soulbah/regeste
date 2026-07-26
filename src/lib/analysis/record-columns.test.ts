import { describe, expect, it } from 'vitest';
import { answerRecordColumn, matchColumnLabel, selectorFor } from './record-columns';
import type { FinancialRecord } from './financial-records';

/** A real amortization schedule's shape: a prorated first instalment, a long run
 * of identical ones, and a slightly different last row. */
function schedule(): FinancialRecord[] {
	const rows = [
		{
			date: '2025-11-05',
			balance: '14 949,07',
			due: '69,39',
			principal: '50,93',
			interest: '18,46'
		},
		{
			date: '2025-12-05',
			balance: '14 750,15',
			due: '75,81',
			principal: '51,02',
			interest: '24,79'
		},
		{
			date: '2026-01-05',
			balance: '14 846,95',
			due: '75,81',
			principal: '51,10',
			interest: '24,71'
		},
		{
			date: '2026-02-05',
			balance: '14 780,12',
			due: '75,81',
			principal: '51,19',
			interest: '24,62'
		},
		{
			date: '2026-03-05',
			balance: '14 744,49',
			due: '75,81',
			principal: '51,27',
			interest: '24,54'
		},
		{ date: '2045-10-05', balance: '0,00', due: '76,25', principal: '76,12', interest: '0,13' }
	];
	const minor = (literal: string) => Number(literal.replace(/[^\d,]/gu, '').replace(',', ''));
	return rows.map((row, index) => ({
		key: `doc:schedule:${row.date}`,
		documentId: 'doc',
		documentName: 'avis.pdf',
		date: row.date,
		id: null,
		page: 2,
		headingPath: null,
		facts: [],
		columns: [
			{
				label: 'Capital Restant dû',
				literal: row.balance,
				valueMinor: minor(row.balance),
				currency: 'EUR'
			},
			{ label: 'Montant échéance', literal: row.due, valueMinor: minor(row.due), currency: 'EUR' },
			{
				label: 'Capital amorti',
				literal: row.principal,
				valueMinor: minor(row.principal),
				currency: 'EUR'
			},
			{ label: 'Intérêts', literal: row.interest, valueMinor: minor(row.interest), currency: 'EUR' }
		],
		...(index === -1 ? {} : {})
	}));
}

describe('selectorFor', () => {
	it('reads which row the question points at', () => {
		expect(selectorFor('Quel est le montant de la première mensualité ?')).toBe('first');
		expect(selectorFor('Quelle est la dernière échéance ?')).toBe('last');
		expect(selectorFor('Quel est le montant d’une mensualité courante ?')).toBe('typical');
		// No selector means this is not a single-row column question.
		expect(selectorFor('Combien dois-je payer au total ?')).toBeNull();
	});
});

describe('matchColumnLabel', () => {
	const labels = ['Capital Restant dû', 'Montant échéance', 'Capital amorti', 'Intérêts'];

	it('matches on the document’s own column names', () => {
		expect(matchColumnLabel('part d’intérêts de la première échéance', labels)).toBe('Intérêts');
		expect(matchColumnLabel('quel capital restant dû après la première ?', labels)).toBe(
			'Capital Restant dû'
		);
	});

	it('finds nothing rather than the nearest column', () => {
		// The two worst measured failures were relabellings: an interest column
		// served as a borrower-insurance schedule, a nominal rate served as a TAEG.
		expect(matchColumnLabel('quel est le TAEG de ce crédit ?', labels)).toBeNull();
		expect(matchColumnLabel('montant mensuel de l’assurance emprunteur ?', labels)).toBeNull();
		expect(
			matchColumnLabel('quelle est la pénalité de remboursement anticipé ?', labels)
		).toBeNull();
	});
});

describe('answerRecordColumn', () => {
	it('reads the column the question names, not the one next to it', () => {
		const interest = answerRecordColumn(
			'Quelle part d’intérêts la première échéance contient-elle ?',
			schedule()
		);
		// Both a 4B and a 9B answered 69,39 here — the instalment, not the interest.
		expect(interest?.literal).toBe('18,46');
		expect(interest?.label).toBe('Intérêts');
		expect(interest?.selector).toBe('first');
	});

	it('answers the recurring instalment, not the prorated first row', () => {
		const typical = answerRecordColumn(
			'Quel est le montant d’une mensualité courante ?',
			schedule()
		);
		expect(typical?.literal).toBe('75,81');
		expect(typical?.support).toBe(4);
		// The prorated first row and the final row are excluded before asking what
		// is typical; taking row 1 is exactly the error both models made.
		expect(typical?.considered).toBe(4);
	});

	it('reads the last row when asked for it', () => {
		const last = answerRecordColumn('Quel est le montant de la dernière échéance ?', schedule());
		expect(last?.literal).toBe('76,25');
		expect(last?.selector).toBe('last');
	});

	it('answers nothing when the table has no such column', () => {
		expect(answerRecordColumn('Quel est le TAEG de ce crédit ?', schedule())).toBeNull();
		expect(
			answerRecordColumn('Quel est le montant mensuel de l’assurance emprunteur ?', schedule())
		).toBeNull();
	});

	it('answers nothing without a row selector, leaving aggregates alone', () => {
		expect(answerRecordColumn('Combien dois-je payer au total ?', schedule())).toBeNull();
	});

	it('answers nothing when the rows carry no named columns', () => {
		const unlabelled = schedule().map((record) => ({ ...record, columns: undefined }));
		expect(
			answerRecordColumn('Quelle part d’intérêts la première échéance contient-elle ?', unlabelled)
		).toBeNull();
	});
});

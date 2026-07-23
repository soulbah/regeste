import { describe, expect, it } from 'vitest';
import { orderPdfText } from './pdf-layout';

const item = (text: string, x: number, y: number, width: number) => ({ text, x, y, width });

describe('orderPdfText', () => {
	it('keeps a multi-line table cell contiguous instead of interleaving columns', () => {
		// Three-column table: label | amount | condition, each cell wrapping over
		// several visual lines, framed by full-width prose above and below.
		const items = [
			item(
				'Les prestations suivantes sont prises en charge dans les limites indiquées ci-dessous pour chaque sinistre couvert.',
				36,
				700,
				520
			),
			// row: three columns, cells vertically offset like real table layouts
			item('Hébergement des', 40, 660, 80),
			item('Bénéficiaires', 40, 646, 66),
			item('90 unités par nuit et par', 180, 668, 120),
			item('personne dans la limite de 3', 180, 654, 130),
			item('nuits par sinistre.', 180, 640, 90),
			item('Logement devenu inutilisable', 360, 668, 140),
			item('du fait du sinistre.', 360, 654, 90),
			// second row
			item('Transport du mobilier', 40, 610, 100),
			item('Jusqu’à 30 jours consécutifs', 180, 618, 130),
			item('dans la limite de 500 unités.', 180, 604, 130),
			item('Hors frais des biens stockés.', 360, 618, 140),
			item(
				'Toute demande doit être déclarée dans les meilleurs délais auprès de nos services d’assistance téléphonique.',
				36,
				560,
				520
			)
		];
		const lines = orderPdfText(items, 596);
		const text = lines.join('\n');
		const cell = text.indexOf(
			'90 unités par nuit et par\npersonne dans la limite de 3\nnuits par sinistre.'
		);
		expect(cell).toBeGreaterThanOrEqual(0);
		expect(text).toContain('Jusqu’à 30 jours consécutifs\ndans la limite de 500 unités.');
		// full-width prose stays in reading order around the table
		expect(lines[0]).toContain('Les prestations suivantes');
		expect(lines.at(-1)).toContain('Toute demande doit être déclarée');
	});

	it('emits amortization-style data rows row-major, one record per line', () => {
		// Regression: column-major emission sheared the schedule apart — every
		// date in one block, every amount in another — and the lone "capital
		// restant dû" column inherited the full table header, so "the first
		// installment" was answered with a mid-table outstanding balance.
		const items = [
			item('Echéancier de remboursement (en euros)', 36, 720, 400),
			item('N°', 40, 700, 20),
			item('Date', 100, 700, 40),
			item('Capital restant dû', 220, 700, 100),
			item('Montant échéance', 400, 700, 100),
			...Array.from({ length: 6 }, (_, row) => [
				item(String(row + 1), 40, 680 - row * 16, 20),
				item(`05.${String(row + 11).padStart(2, '0')}.2025`, 100, 680 - row * 16, 70),
				item(`${11962 - row * 49},45`, 220, 680 - row * 16, 80),
				item(row === 0 ? '57,20' : '64,73', 400, 680 - row * 16, 50)
			]).flat()
		];
		const lines = orderPdfText(items, 596);
		const text = lines.join('\n');
		// The first record survives as one line: rank, date, balance, installment.
		expect(text).toMatch(/1 05\.11\.2025 11962,45 57,20/);
		expect(text).toMatch(/2 05\.12\.2025 11913,45 64,73/);
		// The header stays a single line above the records, not a column title
		// welded onto one column's values.
		expect(text).toContain('N° Date Capital restant dû Montant échéance');
	});

	it('keeps the two-column article path for single-gutter layouts', () => {
		const items = [];
		for (let row = 0; row < 12; row++) {
			items.push(item(`gauche ligne ${row} avec du texte`, 36, 700 - row * 14, 240));
			items.push(item(`droite ligne ${row} avec du texte`, 320, 700 - row * 14, 240));
		}
		const lines = orderPdfText(items, 596);
		expect(lines.slice(0, 12).every((line) => line.startsWith('gauche'))).toBe(true);
		expect(lines.slice(12).every((line) => line.startsWith('droite'))).toBe(true);
	});
});

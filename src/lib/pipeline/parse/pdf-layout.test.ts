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
		const text = lines.map((line) => line.text).join('\n');
		const cell = text.indexOf(
			'90 unités par nuit et par\npersonne dans la limite de 3\nnuits par sinistre.'
		);
		expect(cell).toBeGreaterThanOrEqual(0);
		expect(text).toContain('Jusqu’à 30 jours consécutifs\ndans la limite de 500 unités.');
		// full-width prose stays in reading order around the table
		expect(lines[0].text).toContain('Les prestations suivantes');
		expect(lines.at(-1)?.text).toContain('Toute demande doit être déclarée');
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
		const text = lines.map((line) => line.text).join('\n');
		// The first record survives as one line: rank, date, balance, installment.
		expect(text).toMatch(/1 05\.11\.2025 11962,45 57,20/);
		expect(text).toMatch(/2 05\.12\.2025 11913,45 64,73/);
		// The header stays a single line above the records, not a column title
		// welded onto one column's values.
		expect(text).toContain('N° Date Capital restant dû Montant échéance');
		// Each record also carries which column every value came from. Without
		// this a reader has to align columns by eye, and both a 4B and a 9B model
		// were measured answering the interest column as the instalment.
		const first = lines.find((line) => line.text.startsWith('1 05.11.2025'));
		expect(first?.retrievalContext).toBe(
			'N°: 1 | Date: 05.11.2025 | Capital restant dû: 11962,45 | Montant échéance: 57,20'
		);
		// The source text is never rewritten: citations point at the page, not at
		// the labelled view.
		expect(first?.text).toBe('1 05.11.2025 11962,45 57,20');
		// The header labels itself and needs no context of its own.
		expect(lines.find((line) => line.text.startsWith('N° Date'))?.retrievalContext).toBeUndefined();
	});

	it('refuses to invent a header when the table has none', () => {
		// A wrong binding states a falsehood as structure, which is worse than
		// leaving a reader to see bare values.
		const items = Array.from({ length: 6 }, (_, row) => [
			item(String(row + 1), 40, 680 - row * 16, 20),
			item(`05.${String(row + 11).padStart(2, '0')}.2025`, 100, 680 - row * 16, 70),
			item(`${11962 - row * 49},45`, 220, 680 - row * 16, 80)
		]).flat();
		const lines = orderPdfText(items, 596);
		expect(lines.every((line) => line.retrievalContext === undefined)).toBe(true);
	});

	it('keeps the two-column article path for single-gutter layouts', () => {
		const items = [];
		for (let row = 0; row < 12; row++) {
			items.push(item(`gauche ligne ${row} avec du texte`, 36, 700 - row * 14, 240));
			items.push(item(`droite ligne ${row} avec du texte`, 320, 700 - row * 14, 240));
		}
		const lines = orderPdfText(items, 596);
		expect(lines.slice(0, 12).every((line) => line.text.startsWith('gauche'))).toBe(true);
		expect(lines.slice(12).every((line) => line.text.startsWith('droite'))).toBe(true);
	});

	it('binds a borderless comparison row before a two-column article can shear it', () => {
		const items = [
			item('SLS Block 1 Crew', 154, 458, 50),
			item('SLS Block 1 Cargo', 222, 458, 53),
			item('SLS Block 1B Crew', 292, 458, 54),
			item('SLS Block 1B Cargo', 361, 458, 57),
			item('SLS Block 2 Crew', 436, 458, 50),
			item('SLS Block 2 Cargo', 506, 458, 52),
			item('Maximum Thrust', 44, 441, 56),
			item('8.8 M lbs.', 165, 441, 27),
			item('8.8 M lbs.', 235, 441, 27),
			item('8.9 M lbs.', 306, 441, 27),
			item('8.9 M lbs.', 376, 441, 27),
			item('9.5 M lbs.', 447, 441, 27),
			item('9.5 M lbs.', 519, 441, 27),
			...Array.from({ length: 10 }, (_, row) => [
				item(`left article line ${row}`, 40, 400 - row * 14, 230),
				item(`right article line ${row}`, 330, 400 - row * 14, 230)
			]).flat()
		];
		const lines = orderPdfText(items, 612);
		const thrust = lines.find((line) => line.text.startsWith('Maximum Thrust'));
		expect(thrust?.retrievalContext).toContain('SLS Block 2 Crew: 9.5 M lbs.');
		expect(thrust?.retrievalContext).toContain('SLS Block 2 Cargo: 9.5 M lbs.');
		expect(thrust?.text).toContain('8.8 M lbs. 8.8 M lbs. 8.9 M lbs. 8.9 M lbs. 9.5 M lbs.');
	});
});

it('keeps a devis/invoice section-subtotal row intact (label + amount, not sheared)', () => {
	// Regression: a construction quote's section header "2 Extension 17 056,11 €"
	// was emitted column-major — the amount filed under a bare column, severed
	// from "Extension" — so "total de l'Extension" could not be answered. A row
	// whose rightmost cell is a monetary amount must stay row-major.
	const items = [
		item('Devis N° D202500075', 36, 760, 200),
		item('N° DÉSIGNATION QTÉ U. PRIX U. TOTAL HT', 36, 740, 460),
		// Section header: short label left, subtotal far right (skips middle cols)
		item('2', 40, 700, 10),
		item('Extension', 58, 700, 60),
		item('17 056,11 €', 470, 700, 70),
		// Line items: designation spans wide, amounts on the right
		...Array.from({ length: 5 }, (_, row) => [
			item(`2.${row + 1}`, 40, 680 - row * 18, 20),
			item(`Poste de travaux numéro ${row + 1} sur la toiture`, 80, 680 - row * 18, 260),
			item('1,00', 400, 680 - row * 18, 30),
			item('u', 440, 680 - row * 18, 10),
			item(`${300 + row * 50},00 €`, 470, 680 - row * 18, 70)
		]).flat()
	];
	const lines = orderPdfText(items, 595);
	const text = lines.map((line) => line.text).join('\n');
	// The section subtotal stays on one line with its label.
	expect(text).toMatch(/2 Extension 17 056,11 €/);
	// Each line item keeps its designation next to its amount.
	expect(text).toMatch(/2\.1 Poste de travaux numéro 1 sur la toiture 1,00 u 300,00 €/);
	// No bare amount column detached from labels.
	expect(text).not.toMatch(/^17 056,11 €$/m);
});

describe('two columns of prose against a price list', () => {
	/** A page of services on the left and their prices on the right, each label
	 *  wrapping over two lines like a real tariff brochure. */
	const tariffPage = () =>
		Array.from({ length: 14 }, (_, row) => {
			const y = 700 - row * 40;
			return [
				item(`Service numéro ${row + 1} proposé aux particuliers`, 40, y, 200),
				item('avec les conditions habituelles', 40, y - 14, 180),
				item(`${row + 2},50 € /mois`, 380, y, 80)
			];
		}).flat();

	/** The same geometry with prose on both sides: a two-column article. */
	const articlePage = () =>
		Array.from({ length: 14 }, (_, row) => {
			const y = 700 - row * 40;
			return [
				item(`Colonne de gauche ligne ${row + 1} du texte`, 40, y, 200),
				item('suite de la phrase à gauche', 40, y - 14, 180),
				item(`Colonne de droite ligne ${row + 1}`, 380, y, 160)
			];
		}).flat();

	it('keeps a service beside its price instead of reading the columns down', () => {
		// The two-column split is right for prose and catastrophic here: it emits
		// every price after every service, so no chunk holds a service beside
		// what it costs. Measured on the evaluation corpus, that one mistake was
		// nine of the twelve label/value pairs the OCR path could not find.
		const text = orderPdfText(tariffPage(), 595)
			.map((line) => line.text)
			.join('\n');
		// The whole service, wrapped line included, then its price.
		expect(text).toMatch(
			/Service numéro 1 proposé aux particuliers avec les conditions habituelles 2,50 € \/mois/
		);
		expect(text).not.toMatch(/^2,50 € \/mois$/m);
	});

	it('still reads a two-column article one column at a time', () => {
		const lines = orderPdfText(articlePage(), 595).map((line) => line.text);
		const lastLeft = lines.map((line) => line.startsWith('Colonne de gauche')).lastIndexOf(true);
		const firstRight = lines.findIndex((line) => line.startsWith('Colonne de droite'));
		expect(firstRight).toBeGreaterThan(lastLeft);
	});

	it('splits when both columns carry figures, which is an article about money', () => {
		const items = Array.from({ length: 14 }, (_, row) => {
			const y = 700 - row * 40;
			return [
				item(`Le montant de ${row + 2},50 € est indiqué à gauche`, 40, y, 200),
				item('et la phrase se poursuit ici', 40, y - 14, 180),
				item(`Contre ${row + 9},00 € cité à droite`, 380, y, 160)
			];
		}).flat();
		const lines = orderPdfText(items, 595).map((line) => line.text);
		const lastLeft = lines.map((line) => line.startsWith('Le montant')).lastIndexOf(true);
		const firstRight = lines.findIndex((line) => line.startsWith('Contre'));
		expect(firstRight).toBeGreaterThan(lastLeft);
	});
});

describe('a coverage grid is not a price list', () => {
	it('does not fuse two boxes of prose because one of them holds the figures', () => {
		// An insurance IPID sets "what is covered" beside "what is NOT covered".
		// The covered box carries every figure and the excluded box carries none,
		// which is perfect concentration and not a price list: reading the two as
		// one record pairs a covered peril with an exclusion, and fourteen of the
		// corpus's forty-eight statements inverted that way. Density is what
		// separates them — a price column is mostly prices.
		const items = Array.from({ length: 12 }, (_, row) => {
			const y = 700 - row * 40;
			return [
				item(
					row % 4 === 0
						? `Degats des eaux jusqu a ${row + 2} 000 € par sinistre`
						: `Garantie couverte numero ${row + 1} du contrat`,
					40,
					y,
					220
				),
				item('dans les conditions prevues au contrat', 40, y - 14, 190),
				item(`La deflagration d explosifs non autorises cas ${row + 1}`, 330, y, 200)
			];
		}).flat();
		const lines = orderPdfText(items, 595).map((line) => line.text);
		// No line may carry a covered peril and its exclusion at once.
		expect(lines.some((line) => /Degats des eaux/.test(line) && /deflagration/.test(line))).toBe(
			false
		);
	});

	it('reads a wrapped service and its wrapped price as one record', () => {
		// The remaining OCR failure shape: the label wraps over two lines and so
		// does the price, so line-by-line reading answers the service with the
		// annual figure instead of the monthly one it is priced at.
		const items = Array.from({ length: 8 }, (_, row) => {
			const y = 700 - row * 60;
			return [
				item(`Abonnement au service numero ${row + 1}`, 40, y, 200),
				item(`option SMS ${row + 1}`, 40, y - 12, 90),
				item(`${row + 2},60 € /mois soit pour`, 380, y, 120),
				item(`information, ${row + 30},20 € /an`, 380, y - 12, 120)
			];
		}).flat();
		const text = orderPdfText(items, 595)
			.map((line) => line.text)
			.join('\n');
		// The service meets its monthly price before the annual one.
		const record = text.split('\n').find((line) => /option SMS 1/.test(line)) ?? '';
		expect(record).toMatch(/option SMS 1.*2,60 €/);
		expect(record.indexOf('2,60')).toBeLessThan(record.indexOf('30,20'));
	});
});

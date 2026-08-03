import { describe, expect, it } from 'vitest';
import { bindsAValue, markdownToLines, shouldUseMarkdown } from './pdf-markdown';

// Rows as liteparse emits them for the 2026 tariff brochures and for an
// insurance IPID. The routing decision is the whole point: the same renderer
// produces both, and only one of them may replace the reading order.
const TARIFF = [
	'| Liste des services | Prix en euros |',
	'|---|---|',
	'| Abonnement à des services de banque à distance : Direct Écureuil | Gratuit |',
	'| Tenue de compte | 4,85 €/trimestre soit pour information, 19,40 €/an |',
	'| Retrait d’espèces (cas de retrait en euro dans la zone euro) | 1,00 €/retrait |',
	'| Commission d’intervention | 8,00 €/opération avec un plafond de 80,00 €/mois |'
].join('\n');

const IPID = [
	'| Qu’est-ce qui est assuré ? | Qu’est-ce qui n’est pas assuré ? |',
	'|---|---|',
	'| ✓ Incendie et évènements assimilés | ✗ Les bâtiments simplement posés au sol |',
	'| ✓ Dégâts des eaux | ✗ Les activités professionnelles |',
	'| ✓ Attentats | ✗ Les bâtiments à usage professionnel |'
].join('\n');

describe('bindsAValue', () => {
	it('accepts a row whose last cell is a price', () => {
		expect(bindsAValue('| Tenue de compte | 4,85 €/trimestre |')).toBe(true);
	});

	it('does not classify categorical prose with a hand-written vocabulary', () => {
		expect(bindsAValue('| Virement par internet | Gratuit |')).toBe(false);
		expect(bindsAValue('| Convention séquestre | Nous consulter |')).toBe(false);
	});

	it('accepts numeric measurements without enumerating units', () => {
		expect(bindsAValue('| Maximum thrust | 9.5 M lbs. |')).toBe(true);
		expect(bindsAValue('| Payload to the Moon | > 46 t (101.4k lbs.) |')).toBe(true);
	});

	it('reads through the emphasis liteparse puts on a price', () => {
		expect(bindsAValue('| Tenue de compte | **4,85 €/trimestre** |')).toBe(true);
	});

	it('rejects a row that pairs two statements instead of pricing one', () => {
		expect(bindsAValue('| ✓ Dégâts des eaux | ✗ Les activités professionnelles |')).toBe(false);
	});

	it('rejects a single-cell row', () => {
		expect(bindsAValue('| 8,00 € |')).toBe(false);
	});
});

describe('shouldUseMarkdown', () => {
	it('takes over a tariff page', () => {
		expect(shouldUseMarkdown(TARIFF)).toBe(true);
	});

	it('leaves an IPID to the position-derived reading order', () => {
		// The failure this guards: fusing the two boxes puts a covered peril and
		// an exclusion on one line, and the answer inverts.
		expect(shouldUseMarkdown(IPID)).toBe(false);
	});

	it('leaves a page with no table alone', () => {
		expect(shouldUseMarkdown('## Article 5\n\nLe présent règlement entre en vigueur.')).toBe(false);
	});

	it('still takes over when section rows dilute the value rows', () => {
		const withSections = [
			'| Vos moyens de paiement | |',
			'| Carte Visa Classic | 44,70 €/an |',
			'| Frais de dossier | Gratuit |',
			'| Ces tarifs sont indiqués hors offre groupée de services | |',
			'| Assistance | |'
		].join('\n');
		expect(shouldUseMarkdown(withSections)).toBe(true);
	});
});

describe('markdownToLines', () => {
	it('keeps a row on one line so the value cannot be split from its label', () => {
		expect(markdownToLines(TARIFF)).toContain(
			'Tenue de compte 4,85 €/trimestre soit pour information, 19,40 €/an'
		);
	});

	it('drops the syntax but never the words', () => {
		expect(markdownToLines('## EXTRAIT STANDARD\n\n**Tenue de compte** au 01/01/2026')).toEqual([
			'EXTRAIT STANDARD',
			'Tenue de compte au 01/01/2026'
		]);
	});

	it('drops separator rules and blank lines', () => {
		expect(markdownToLines('| a | 1,00 € |\n|---|---|\n\n---\n')).toEqual(['a 1,00 €']);
	});
});

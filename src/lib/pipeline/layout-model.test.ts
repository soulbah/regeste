import { describe, expect, it } from 'vitest';
import {
	layoutUncertain,
	regionsFromImage,
	splitByChrome,
	type LayoutRegion
} from './layout-model';
import { chunkBlocks } from './chunk';
import type { PositionedPdfText } from './parse/pdf-layout';

// A4 in points; y is pdf.js's bottom-up convention throughout.
const H = 842;

function item(text: string, x: number, y: number, width = 60): PositionedPdfText {
	return { text, x, y, width };
}

describe('layoutUncertain — which born-digital pages pay for a detector pass', () => {
	it('fires on a letter with a legal footer, stays quiet on a page number', () => {
		const legalFooter = [
			item('Caisse Régionale de Banque Populaire Mutuel Grand Ouest Société coopérative', 100, 60),
			item('agréé en tant qu’établissement de crédit, siège social 10 avenue Foch LILLE', 100, 48)
		];
		expect(layoutUncertain([item('Corps du texte.', 100, 600), ...legalFooter], H)).toBe(true);
		expect(layoutUncertain([item('Corps du texte.', 100, 600), item('3/14', 280, 30, 20)], H)).toBe(
			false
		);
	});

	it('fires on a tariff page by amount count', () => {
		const tariff = ['2,60 €', '4,85 €', '8,00 €', '0,00 €'].map((t, i) =>
			item(t, 400, 700 - i * 20)
		);
		expect(layoutUncertain([item('Extrait des tarifs', 90, 760), ...tariff], H)).toBe(true);
	});
});

describe('splitByChrome — the attestation shape, end to end', () => {
	// The owner's real defect: body closes, signature block sits above the legal
	// footer, and the balance sentence used to be emitted AFTER the footer.
	const regions: LayoutRegion[] = [
		{ label: 'header_image', score: 0.73, box: [96, 18, 420, 64] },
		{ label: 'footer', score: 0.95, box: [72, 720, 520, 780] },
		{ label: 'aside_text', score: 0.93, box: [19, 530, 34, 700] }
	];
	const items = [
		item('AGENCE DE LILLE', 100, H - 40), // inside header_image
		item('certifions que le compte présente un solde créditeur de 1 234,56 EUR.', 100, H - 300),
		item('AMELIE ROUSSEAU', 260, H - 560),
		item("Votre Directeur d'Agence", 260, H - 575),
		item('Caisse Régionale de Banque Populaire Mutuel', 150, H - 740), // inside footer
		item('987 654 321 RCS LILLE METROPOLE', 150, H - 760), // inside footer
		item('Réf. L.COM_CO_ATTEST', 20, H - 600, 10) // inside aside_text
	];

	it('keeps the signature in the body and the footer out of it', () => {
		const { body, chrome } = splitByChrome(items, regions, 595, H);
		const bodyText = body.map((entry) => entry.text).join(' ');
		expect(bodyText).toContain('AMELIE ROUSSEAU');
		expect(bodyText).toContain("Votre Directeur d'Agence");
		expect(bodyText).toContain('1 234,56');
		expect(bodyText).not.toContain('RCS LILLE');
		expect(bodyText).not.toContain('AGENCE DE LILLE');
		expect(chrome.map((group) => group.label).sort()).toEqual([
			'aside_text',
			'footer',
			'header_image'
		]);
	});

	it('returns everything as body when the model saw nothing', () => {
		const { body, chrome } = splitByChrome(items, [], 595, H);
		expect(body).toHaveLength(items.length);
		expect(chrome).toHaveLength(0);
	});
});

describe('chrome through the chunker', () => {
	it('never chunks a footer line beside the signature', () => {
		const blocks = [
			{ text: 'Fait à LILLE, le 23 Juillet 2026', page: 1, charStart: 0, charEnd: 36 },
			{ text: 'AMELIE ROUSSEAU', page: 1, charStart: 37, charEnd: 54 },
			{ text: "Votre Directeur d'Agence", page: 1, charStart: 55, charEnd: 79 },
			{
				text: 'Caisse Régionale de Banque Populaire Mutuel Grand Ouest Société coopérative à capital variable, 987 654 321 RCS LILLE METROPOLE.',
				page: 1,
				region: 'footer',
				charStart: 80,
				charEnd: 210
			}
		];
		const chunks = chunkBlocks(blocks, 'attestation.pdf');
		const signatureChunk = chunks.find((chunk) => chunk.text.includes('AMELIE ROUSSEAU'));
		expect(signatureChunk).toBeDefined();
		expect(signatureChunk!.text).not.toContain('RCS LILLE');
		// The footer still exists as its own passage — segregated, not censored.
		expect(chunks.some((chunk) => chunk.text.includes('RCS LILLE'))).toBe(true);
	});
});

describe('regionsFromImage', () => {
	it('divides by the render scale and keeps top-down orientation', () => {
		const [region] = regionsFromImage(
			[{ label: 'footer', score: 0.9, box: [100, 2000, 800, 2200] }],
			200 / 72
		);
		expect(region.box[0]).toBeCloseTo(36, 0);
		expect(region.box[1]).toBeCloseTo(720, 0);
		expect(region.box[3]).toBeGreaterThan(region.box[1]);
	});
});

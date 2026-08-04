import { describe, expect, it } from 'vitest';
import { chunkBlocks } from '../chunk';
import {
	horizontalPositionedText,
	isLikelyPdfSectionHeading,
	pageBlocks,
	positionedPageText
} from './pdf';
import { orderPdfText } from './pdf-layout';

describe('PDF structural blocks', () => {
	it('normalizes text drawn right-to-left by a negative horizontal transform', () => {
		expect(horizontalPositionedText('eziS gnivreS', [-10, 0, 0, 10, 220, 700], 90)).toEqual({
			text: 'Serving Size',
			x: 130,
			y: 700,
			width: 90
		});
		expect(horizontalPositionedText('Calories', [10, 0, 0, 10, 130, 700], 50)).toEqual({
			text: 'Calories',
			x: 130,
			y: 700,
			width: 50
		});
	});

	it('keeps a vertical header band but rejects an isolated rotated stamp', () => {
		const positioned = positionedPageText(
			[
				{ str: ' ', transform: [11, 0, 0, 11, 10, 460], width: 4 },
				{ str: 'Serving Size', transform: [0, 6, -6, 0, 270, 446], width: 36 },
				{ str: 'Calories', transform: [0, 6, -6, 0, 344, 446], width: 24 },
				{ str: 'Sodium', transform: [0, 6, -6, 0, 537, 446], width: 21 },
				{ str: '184320', transform: [0, 6, -6, 0, 12, 300], width: 20 },
				{ str: 'Product row', transform: [11, 0, 0, 11, 22, 435], width: 70 }
			],
			780
		);
		expect(positioned.map((item) => item.text)).toEqual([
			'Serving Size',
			'Calories',
			'Sodium',
			'Product row'
		]);
		expect(positioned[0]).toMatchObject({ x: 270, y: 446, width: 6 });
	});

	it('keeps mixed nutrition rows whole and binds their vertical headers', () => {
		const items = [
			{ str: 'Serving Size', transform: [0, 6, -6, 0, 270, 446], width: 36 },
			{ str: 'Calories', transform: [0, 6, -6, 0, 344, 446], width: 24 },
			{ str: 'Sodium', transform: [0, 6, -6, 0, 537, 446], width: 21 },
			{ str: 'Protein', transform: [0, 6, -6, 0, 661, 446], width: 21 }
		];
		for (let row = 0; row < 4; row++) {
			const y = 435 - row * 10;
			items.push(
				{ str: `Product ${row + 1}`, transform: [8, 0, 0, 8, 22, y], width: 55 },
				{ str: '1/2 Sandwich', transform: [8, 0, 0, 8, 255, y], width: 52 },
				{ str: String(260 + row * 10), transform: [8, 0, 0, 8, 337, y], width: 18 },
				{ str: String(630 + row * 10), transform: [8, 0, 0, 8, 529, y], width: 18 },
				{ str: String(9 + row), transform: [8, 0, 0, 8, 658, y], width: 10 },
				{ str: 'N/A', transform: [8, 0, 0, 8, 707, y], width: 14 }
			);
		}

		const lines = orderPdfText(positionedPageText(items, 780), 780);
		const firstRow = lines.find((line) => line.text.startsWith('Product 1'));
		expect(firstRow?.text).toContain('1/2 Sandwich 260 630 9 N/A');
		expect(firstRow?.retrievalContext).toContain('Serving Size: 1/2 Sandwich');
		expect(firstRow?.retrievalContext).toContain('Calories: 260');
		expect(firstRow?.retrievalContext).toContain('Sodium: 630');
	});

	it('detects question, title-case and uppercase headings without treating prose as a title', () => {
		expect(
			isLikelyPdfSectionHeading('Qui est couvert(e) ?', 'La police couvre Idrissa Konaté.')
		).toBe(true);
		expect(isLikelyPdfSectionHeading('La Version Pressée', 'Voici une copie de votre devis.')).toBe(
			true
		);
		expect(isLikelyPdfSectionHeading('CONDITIONS PARTICULIÈRES', 'Le contrat débute demain.')).toBe(
			true
		);
		expect(
			isLikelyPdfSectionHeading(
				'La présente police couvre votre logement.',
				'Elle couvre aussi vos biens.'
			)
		).toBe(false);
		// A form field is a label+value pair, not a section title — even when the
		// value is ALL-CAPS (which would otherwise pass the uppercase-ratio test).
		expect(
			isLikelyPdfSectionHeading('Prénom * AMINA DIALLO', 'Motif du transfert * Assistance')
		).toBe(false);
		expect(isLikelyPdfSectionHeading('Nom * KEITA', 'Prénom * AMINA DIALLO')).toBe(false);
		// A real section label still wins, so the beneficiary name inherits it.
		expect(isLikelyPdfSectionHeading('Bénéficiaire', 'N° mobile +224 620 12 34 56')).toBe(true);
	});

	it('starts a new semantic section and propagates its heading to searchable chunks', () => {
		const lines = [
			'La Version Pressée',
			'Voici une copie détaillée de votre devis habitation et de ses garanties.',
			'Qui est couvert(e) ?',
			'La présente police couvre Idrissa Konaté et votre partenaire de façon permanente.',
			'Quand ça ?',
			'Les dommages survenant après le 14 juillet 2026 à 00:01 sont couverts.'
		];
		const blocks = pageBlocks(
			lines.map((text) => ({ text })),
			2
		);
		expect(blocks.map((block) => block.headingPath?.[0])).toEqual([
			'La Version Pressée',
			'La Version Pressée',
			'Qui est couvert(e) ?',
			'Qui est couvert(e) ?',
			'Quand ça ?',
			'Quand ça ?'
		]);
		const chunks = chunkBlocks(blocks, 'devis.pdf');
		expect(chunks.map((chunk) => chunk.headingPath)).toEqual([
			'La Version Pressée',
			'Qui est couvert(e) ?',
			'Quand ça ?'
		]);
		expect(chunks[2].searchText).toContain('Quand ça ?');
		expect(chunks[2].text).toContain('14 juillet 2026 à 00:01');
	});

	it('never promotes a labelled form record to a section heading', () => {
		const blocks = pageBlocks(
			[
				{
					text: 'DOE, JOHN & JANE 55 NO NAME DRIVE',
					retrievalContext: 'Customer Name: DOE, JOHN & JANE | Service Address: 55 NO NAME DRIVE'
				},
				{ text: 'Current billing details continue on the following lines.' }
			],
			1
		);

		expect(blocks[0].headingPath).toBeUndefined();
		expect(blocks[1].headingPath).toBeUndefined();
		expect(blocks[0].retrievalContext).toContain('Service Address: 55 NO NAME DRIVE');
	});
});

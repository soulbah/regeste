import { describe, expect, it } from 'vitest';
import { chunkBlocks } from '../chunk';
import { isLikelyPdfSectionHeading, pageBlocks } from './pdf';

describe('PDF structural blocks', () => {
	it('detects question, title-case and uppercase headings without treating prose as a title', () => {
		expect(isLikelyPdfSectionHeading('Qui est couvert(e) ?', 'La police couvre Idrissa Konaté.')).toBe(
			true
		);
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
		const blocks = pageBlocks(lines, 2);
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
});

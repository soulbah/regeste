import { describe, expect, it } from 'vitest';
import {
	CHUNK_TARGET_CHARS,
	PARENT_CHUNK_MAX_CHARS,
	STRUCTURED_CHUNK_TARGET_CHARS,
	chunkBlocks,
	chunkTargetForBlock,
	splitSentences
} from './chunk';
import type { ParsedBlock } from '$lib/types';

const para = (n: number) => `Sentence ${n} of the paragraph. `.repeat(8).trim();

describe('splitSentences', () => {
	it('keeps offsets exact', () => {
		const text = 'One. Two. Three. '.repeat(200);
		const parts = splitSentences(text, 1000, 500);
		for (const p of parts) {
			expect(text.slice(p.start - 1000, p.end - 1000)).toBe(p.text);
			expect(p.text.length).toBeLessThanOrEqual(500);
		}
	});

	it('prefers line boundaries for dense forms', () => {
		const text = Array.from(
			{ length: 20 },
			(_, index) => `${index + 1} Form field ${'x'.repeat(45)}`
		).join('\n');
		const parts = splitSentences(text, 0, 220);
		expect(parts.every((part) => part.text.endsWith('\n') || part.end === text.length)).toBe(true);
	});
});

describe('chunkBlocks', () => {
	it('never straddles a numbered-clause marker', () => {
		// Regression: the chunk cited for "Que dit l'article 110 ?" opened with
		// the tail of article 109. "Arțicle" is the real OCR artifact.
		const text =
			`Mention du dispositif de la décision du Président du tribunal est portée en marge de l'acte de mariage. ` +
			`Arțicle 110 : Célébration du mariage A l'expiration du délai d'un mois, l'officier de l'état civil procède à la célébration du mariage. ` +
			`Article 111 : Publicité des débats La célébration est publique.`;
		const chunks = chunkBlocks([{ text, page: 1, charStart: 0, charEnd: text.length }]);
		const clause110 = chunks.find((chunk) => chunk.text.includes('110'));
		expect(clause110?.text.startsWith('Arțicle 110')).toBe(true);
		expect(clause110?.text).not.toContain('marge de');
		expect(clause110?.text).not.toContain('111');
	});

	it('does not cut at an in-sentence cross-reference without a colon', () => {
		const text =
			`Le mariage est célébré conformément à l'article 108 du présent code. ` +
			`La publication reste affichée pendant un mois entier au centre principal.`;
		const chunks = chunkBlocks([{ text, page: 1, charStart: 0, charEnd: text.length }]);
		expect(chunks.length).toBe(1);
	});

	it('never crosses page boundaries', () => {
		const blocks: ParsedBlock[] = [
			{ text: para(1), page: 1, charStart: 0, charEnd: para(1).length },
			{ text: para(2), page: 2, charStart: 0, charEnd: para(2).length }
		];
		const chunks = chunkBlocks(blocks);
		expect(chunks.length).toBe(2);
		expect(chunks[0].page).toBe(1);
		expect(chunks[1].page).toBe(2);
	});

	it('never crosses heading boundaries', () => {
		const blocks: ParsedBlock[] = [
			{ text: para(1), headingPath: ['A'], paraIndex: 0, charStart: 0, charEnd: 10 },
			{ text: para(2), headingPath: ['B'], paraIndex: 1, charStart: 11, charEnd: 20 }
		];
		const chunks = chunkBlocks(blocks);
		expect(chunks.map((c) => c.headingPath)).toEqual(['A', 'B']);
	});

	it('adds document and heading context only to searchable text', () => {
		const chunks = chunkBlocks(
			[
				{
					text: 'The notice period is three months.',
					headingPath: ['Termination'],
					charStart: 0,
					charEnd: 34
				}
			],
			'contract.pdf'
		);
		expect(chunks[0].text).toBe('The notice period is three months.');
		expect(chunks[0].searchText).toContain('contract.pdf\nTermination\n');
	});

	it('packs small blocks of the same section together', () => {
		const blocks: ParsedBlock[] = Array.from({ length: 6 }, (_, i) => ({
			text: `Short paragraph number ${i} with a little bit of content.`,
			page: 1,
			charStart: i * 100,
			charEnd: i * 100 + 50
		}));
		const chunks = chunkBlocks(blocks);
		expect(chunks.length).toBe(1);
		expect(chunks[0].charStart).toBe(0);
	});

	it('does not copy a PDF page opening into unrelated child chunks', () => {
		const opening = `UNIQUE-PAGE-OPENING ${'alpha '.repeat(120)}`;
		const ending = `UNIQUE-PAGE-ENDING ${'omega '.repeat(120)}`;
		const chunks = chunkBlocks([
			{ text: opening, page: 7, charStart: 0, charEnd: opening.length },
			{
				text: ending,
				page: 7,
				charStart: opening.length + 1,
				charEnd: opening.length + 1 + ending.length
			}
		]);
		const children = chunks.filter((chunk) => chunk.paraIndex !== -1);
		expect(children.length).toBeGreaterThanOrEqual(2);
		expect(
			children
				.filter((chunk) => chunk.text.includes('UNIQUE-PAGE-ENDING'))
				.every((chunk) => !chunk.searchText.includes('UNIQUE-PAGE-OPENING'))
		).toBe(true);
		expect(chunks.find((chunk) => chunk.paraIndex === -1)?.searchText).toContain(
			'UNIQUE-PAGE-OPENING'
		);
	});

	it('builds overlapping bounded parents instead of one truncated page parent', () => {
		const text = Array.from(
			{ length: 12 },
			(_, index) => `Field ${index}: ${String(index).repeat(20)} ${'detail '.repeat(20)}`
		).join('\n');
		const parents = chunkBlocks([{ text, page: 4, charStart: 0, charEnd: text.length }]).filter(
			(chunk) => chunk.paraIndex === -1
		);

		expect(parents.length).toBeGreaterThan(1);
		expect(parents.every((parent) => parent.text.length <= PARENT_CHUNK_MAX_CHARS)).toBe(true);
		expect(parents[0].charEnd).toBeGreaterThanOrEqual(parents[1].charStart);
	});

	it('splits oversized blocks and respects the target size', () => {
		const big = para(1).repeat(10);
		const chunks = chunkBlocks([{ text: big, page: 3, charStart: 0, charEnd: big.length }]);
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks.filter((chunk) => chunk.paraIndex !== -1)) {
			expect(c.text.length).toBeLessThanOrEqual(CHUNK_TARGET_CHARS + 1);
			expect(c.page).toBe(3);
		}
	});

	it('uses smaller evidence windows for form and table layouts', () => {
		const form = Array.from(
			{ length: 12 },
			(_, index) => `${index + 1} Add lines ${index} and ${index + 1} ........ ${index + 1}`
		).join('\n');
		expect(chunkTargetForBlock(form)).toBe(STRUCTURED_CHUNK_TARGET_CHARS);
		expect(
			chunkBlocks([{ text: form.repeat(3), page: 1, charStart: 0, charEnd: form.length * 3 }])
				.filter((chunk) => chunk.paraIndex !== -1)
				.every((chunk) => chunk.text.length <= STRUCTURED_CHUNK_TARGET_CHARS + 1)
		).toBe(true);
		expect(chunkTargetForBlock(para(1))).toBe(CHUNK_TARGET_CHARS);
	});

	it('drops empty/near-empty chunks', () => {
		expect(chunkBlocks([{ text: '  \n ', page: 1, charStart: 0, charEnd: 4 }])).toEqual([]);
	});

	it('assigns sequential seq across sections', () => {
		const blocks: ParsedBlock[] = [
			{ text: para(1), page: 1, charStart: 0, charEnd: 10 },
			{ text: para(2), page: 2, charStart: 0, charEnd: 10 }
		];
		expect(chunkBlocks(blocks).map((c) => c.seq)).toEqual([0, 1]);
	});
});

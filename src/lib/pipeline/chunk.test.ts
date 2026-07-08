import { describe, expect, it } from 'vitest';
import { CHUNK_TARGET_CHARS, chunkBlocks, splitSentences } from './chunk';
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
});

describe('chunkBlocks', () => {
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

	it('splits oversized blocks and respects the target size', () => {
		const big = para(1).repeat(10);
		const chunks = chunkBlocks([{ text: big, page: 3, charStart: 0, charEnd: big.length }]);
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			expect(c.text.length).toBeLessThanOrEqual(CHUNK_TARGET_CHARS + 1);
			expect(c.page).toBe(3);
		}
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

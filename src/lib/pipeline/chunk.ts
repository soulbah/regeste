// Structure-aware chunker. Pure module (unit-tested, runs anywhere).
// Strategy: blocks arriving from parsers already respect structure (page or
// heading section). We greedily pack consecutive blocks of the SAME section
// into ~CHUNK_TARGET_CHARS chunks, splitting oversized blocks on sentence
// boundaries, and never crossing a page or heading boundary. Overlap is taken
// from the tail of the previous chunk within the same section only.

import type { Chunk, ParsedBlock } from '$lib/types';
import { extractAliases, fuzzyIndexText } from '$lib/pipeline/fuzzy';

// Conservative browser budget: around 180–260 tokens for French/English prose.
// Exact model tokenization still happens before inference; this bound prevents
// dense pages from compressing several unrelated facts into one embedding.
export const CHUNK_TARGET_CHARS = 1000;
export const CHUNK_OVERLAP_CHARS = 120;

interface Piece {
	text: string;
	block: ParsedBlock;
	charStart: number;
	charEnd: number;
}

function sectionKey(b: ParsedBlock): string {
	return `${b.page ?? ''}|${b.headingPath?.join(' > ') ?? ''}`;
}

/** Split an oversized text on sentence-ish boundaries, keeping offsets. */
export function splitSentences(
	text: string,
	offset: number,
	max: number
): Array<{ text: string; start: number; end: number }> {
	const out: Array<{ text: string; start: number; end: number }> = [];
	let start = 0;
	while (start < text.length) {
		if (text.length - start <= max) {
			out.push({ text: text.slice(start), start: offset + start, end: offset + text.length });
			break;
		}
		const window = text.slice(start, start + max);
		// Prefer the last sentence end, then the last whitespace, then a hard cut.
		let cut = Math.max(
			window.lastIndexOf('. '),
			window.lastIndexOf('.\n'),
			window.lastIndexOf('! '),
			window.lastIndexOf('? ')
		);
		if (cut > max * 0.4)
			cut += 1; // keep the punctuation
		else {
			cut = window.lastIndexOf(' ');
			if (cut <= max * 0.4) cut = max;
		}
		out.push({
			text: text.slice(start, start + cut),
			start: offset + start,
			end: offset + start + cut
		});
		start += cut;
		while (text[start] === ' ' || text[start] === '\n') start++;
	}
	return out.filter((p) => p.text.trim().length > 0);
}

export function chunkBlocks(blocks: ParsedBlock[], documentName = ''): Chunk[] {
	const chunks: Chunk[] = [];
	let seq = 0;

	// Group blocks by section (page or heading path).
	const sections: ParsedBlock[][] = [];
	for (const b of blocks) {
		const last = sections[sections.length - 1];
		if (last && sectionKey(last[0]) === sectionKey(b)) last.push(b);
		else sections.push([b]);
	}

	for (const section of sections) {
		const hasStructuralParent = section.some(
			(block) => block.headingPath?.length || block.retrievalContext
		);
		// A PDF page number is a citation boundary, not a semantic parent. Copying
		// its opening text into every child made the right page rank with the wrong
		// evidence passage. Only genuine headings/table contexts are propagated.
		const sectionOverview = hasStructuralParent
			? section
					.map((block) => block.retrievalContext ?? block.text)
					.join('\n')
					.slice(0, 600)
			: '';
		// Flatten section blocks into pieces no larger than the target.
		const pieces: Piece[] = [];
		for (const b of section) {
			if (b.text.length <= CHUNK_TARGET_CHARS) {
				pieces.push({ text: b.text, block: b, charStart: b.charStart, charEnd: b.charEnd });
			} else {
				for (const part of splitSentences(b.text, b.charStart, CHUNK_TARGET_CHARS)) {
					pieces.push({ text: part.text, block: b, charStart: part.start, charEnd: part.end });
				}
			}
		}

		// Greedy packing with intra-section overlap.
		let buf: Piece[] = [];
		let bufLen = 0;
		const flush = () => {
			if (!buf.length) return;
			const first = buf[0];
			const last = buf[buf.length - 1];
			const b = first.block;
			const text = buf.map((p) => p.text).join('\n');
			const headingPath = b.headingPath?.join(' > ') ?? null;
			const structuralContext = [
				...new Set(buf.map((piece) => piece.block.retrievalContext).filter(Boolean))
			].join('\n');
			const aliases = extractAliases(`${headingPath ?? ''}\n${sectionOverview}\n${text}`).join(' ');
			const searchText = [
				documentName,
				headingPath,
				structuralContext,
				sectionOverview,
				aliases,
				text
			]
				.filter(Boolean)
				.join('\n');
			chunks.push({
				text,
				searchText,
				fuzzyText: fuzzyIndexText(searchText),
				seq: seq++,
				page: b.page ?? null,
				headingPath,
				paraIndex: b.paraIndex ?? null,
				charStart: first.charStart,
				charEnd: last.charEnd
			});
		};
		for (const piece of pieces) {
			if (bufLen + piece.text.length > CHUNK_TARGET_CHARS && buf.length) {
				flush();
				// Overlap: carry the tail piece if it is small enough.
				const tail = buf[buf.length - 1];
				buf = tail.text.length <= CHUNK_OVERLAP_CHARS ? [tail] : [];
				bufLen = buf.reduce((n, p) => n + p.text.length, 0);
			}
			buf.push(piece);
			bufLen += piece.text.length;
		}
		flush();
	}

	return chunks.filter((c) => c.text.trim().length >= 20);
}

// Structure-aware chunker. Pure module (unit-tested, runs anywhere).
// Strategy: blocks arriving from parsers already respect structure (page or
// heading section). We greedily pack consecutive blocks of the SAME section
// into ~CHUNK_TARGET_CHARS chunks, splitting oversized blocks on sentence
// boundaries, and never crossing a page or heading boundary. Overlap is taken
// from the tail of the previous chunk within the same section only.

import type { Chunk, ParsedBlock } from '$lib/types';
import { extractAliases, fuzzyHeadingIndexText, fuzzyIndexText } from '$lib/pipeline/fuzzy';

// Conservative browser budget: around 180–260 tokens for French/English prose.
// Exact model tokenization still happens before inference; this bound prevents
// dense pages from compressing several unrelated facts into one embedding.
export const CHUNK_TARGET_CHARS = 650;
export const STRUCTURED_CHUNK_TARGET_CHARS = 450;
const CHUNK_OVERLAP_CHARS = 80;
const PARENT_CHUNK_MIN_CHARS = 900;
export const PARENT_CHUNK_MAX_CHARS = 1500;

interface Piece {
	text: string;
	block: ParsedBlock;
	charStart: number;
	charEnd: number;
	target: number;
	/** Starts a numbered clause ("Article 110 :"): a chunk never straddles it. */
	opensSection?: boolean;
}

// Numbered-clause markers open a new legal/regulatory section; a chunk that
// straddles one cites the previous clause's tail as part of the requested one.
// Structural like the heading heuristics: the colon/dash after the number is
// what distinguishes a clause opener from an in-sentence cross-reference
// ("conformément à l'article 110"). \p{L} in "ar\p{L}icle" tolerates the
// common OCR artifact on the t ("Arțicle").
const SECTION_MARKER = /\b(?:ar\p{L}icle|art\.)\s*\d{1,4}[a-z]?\s*(?::|[–—]|-\s)/giu;

/** Split a block's text before each clause marker, keeping offsets. */
function splitAtSectionMarkers(
	text: string,
	offset: number
): Array<{ text: string; start: number; end: number; opensSection: boolean }> {
	const cuts: number[] = [];
	for (const match of text.matchAll(SECTION_MARKER)) cuts.push(match.index);
	if (!cuts.length || (cuts.length === 1 && cuts[0] === 0)) {
		return [{ text, start: offset, end: offset + text.length, opensSection: cuts[0] === 0 }];
	}
	const bounds = [...new Set([0, ...cuts])].sort((left, right) => left - right);
	return bounds
		.map((start, index) => {
			const end = bounds[index + 1] ?? text.length;
			return {
				text: text.slice(start, end),
				start: offset + start,
				end: offset + end,
				opensSection: cuts.includes(start)
			};
		})
		.filter((segment) => segment.text.trim().length > 0);
}

function sectionKey(b: ParsedBlock): string {
	// Chrome (spec 034: footer, header, aside, page number) forms its own
	// section per region class: a chunk can hold the whole legal footer, but
	// never a footer line beside a signature or a closing sentence.
	return `${b.page ?? ''}|${b.region ?? ''}|${b.headingPath?.join(' > ') ?? ''}`;
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
			window.lastIndexOf('? '),
			window.lastIndexOf('\n')
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

export function chunkTargetForBlock(text: string): number {
	const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
	if (lines.length < 4) return CHUNK_TARGET_CHARS;
	const structured = lines.filter(
		(line) =>
			/^\s*\d+[a-z]?\b/iu.test(line) ||
			/\b\d+[a-z]?\s*$/iu.test(line) ||
			/\|[^|]+\|/u.test(line) ||
			/\.{3,}/u.test(line)
	).length;
	return structured >= Math.max(3, Math.ceil(lines.length * 0.35))
		? STRUCTURED_CHUNK_TARGET_CHARS
		: CHUNK_TARGET_CHARS;
}

/** Compact page/section parent used for multi-field retrieval. Children remain
 * the precise citation units; the parent lets one embedding represent fields
 * that would otherwise be split across several unrelated vectors. */
function parentSectionText(text: string): string {
	if (text.length <= PARENT_CHUNK_MAX_CHARS) return text;
	const informative = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(
			(line) =>
				line.length >= 3 && line.length <= 240 && (/[:€%\d]/u.test(line) || /^[-•✓!✗]/u.test(line))
		)
		.join('\n');
	if (informative.length >= 200) return informative.slice(0, PARENT_CHUNK_MAX_CHARS);
	const half = Math.floor(PARENT_CHUNK_MAX_CHARS / 2);
	return `${text.slice(0, half)}\n…\n${text.slice(-half)}`;
}

export function chunkBlocks(blocks: ParsedBlock[], documentName = ''): Chunk[] {
	const chunks: Chunk[] = [];
	let seq = 0;

	// Group blocks by section (page or heading path).
	const grouped: ParsedBlock[][] = [];
	for (const b of blocks) {
		const last = grouped[grouped.length - 1];
		if (last && sectionKey(last[0]) === sectionKey(b)) last.push(b);
		else grouped.push([b]);
	}

	// Fold a section that is nothing but its own heading line into the section
	// that follows it. The parser promotes any short capitalised line to a
	// heading, and a signature name ("AMELIE ROUSSEAU") is exactly that shape:
	// alone it forms a one-block section under the noise floor below and
	// vanishes. It never used to — the legal footer glued onto it and carried it
	// over the floor, which is the defect spec 034 removes — so the fold is what
	// keeps the name in a chunk now that the glue is gone, and it lands the name
	// beside its role line, which is the pair every signature question needs.
	const sections: ParsedBlock[][] = [];
	for (let index = 0; index < grouped.length; index++) {
		const section = grouped[index];
		const next = grouped[index + 1];
		const lone = section.length === 1 ? section[0] : null;
		if (
			lone &&
			!lone.region &&
			lone.headingPath?.length &&
			lone.text.trim() === lone.headingPath[lone.headingPath.length - 1] &&
			next &&
			next[0].page === lone.page &&
			!next[0].region
		) {
			next.unshift(lone);
			continue;
		}
		sections.push(section);
	}

	for (const section of sections) {
		const childStart = chunks.length;
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
		// Flatten section blocks into pieces no larger than the target, cutting
		// before every numbered-clause marker.
		const pieces: Piece[] = [];
		for (const b of section) {
			for (const segment of splitAtSectionMarkers(b.text, b.charStart)) {
				const target = chunkTargetForBlock(segment.text);
				if (segment.text.length <= target) {
					pieces.push({
						text: segment.text,
						block: b,
						charStart: segment.start,
						charEnd: segment.end,
						target,
						opensSection: segment.opensSection
					});
				} else {
					for (const part of splitSentences(segment.text, segment.start, target)) {
						pieces.push({
							text: part.text,
							block: b,
							charStart: part.start,
							charEnd: part.end,
							target,
							opensSection: segment.opensSection && part.start === segment.start
						});
					}
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
				// Kept on its own as well as inside searchText: exact analytics need
				// to read a row's column names without the document and section
				// context blended in.
				structuralContext: structuralContext || null,
				fuzzyText: [
					fuzzyIndexText(searchText),
					headingPath ? fuzzyHeadingIndexText(headingPath) : ''
				]
					.filter(Boolean)
					.join(' '),
				seq: seq++,
				page: b.page ?? null,
				headingPath,
				paraIndex: b.paraIndex ?? null,
				charStart: first.charStart,
				charEnd: last.charEnd,
				ocrConfidence: (() => {
					const values = buf
						.map((piece) => piece.block.ocrConfidence)
						.filter((value): value is number => value !== undefined);
					return values.length ? Math.min(...values) : null;
				})()
			});
		};
		for (const piece of pieces) {
			// A clause opener starts its own chunk, with no overlap carried across:
			// the previous clause's tail must not be cited as part of this one.
			if (piece.opensSection && buf.length) {
				flush();
				buf = [];
				bufLen = 0;
			}
			const bufferTarget = Math.min(piece.target, ...buf.map((item) => item.target));
			if (bufLen + piece.text.length > bufferTarget && buf.length) {
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

		const sectionChildren = chunks.slice(childStart);
		const fullSectionLength = sectionChildren.reduce((sum, child) => sum + child.text.length, 0);
		if (fullSectionLength >= PARENT_CHUNK_MIN_CHARS && sectionChildren.length > 1) {
			// A single page-sized parent can exceed the embedding model's useful
			// input and hide facts near the end. Build overlapping child windows:
			// retrieval stays broad, while generation still receives precise children.
			let windowStart = 0;
			while (windowStart < sectionChildren.length - 1) {
				let windowEnd = windowStart;
				let windowChars = 0;
				while (windowEnd < sectionChildren.length) {
					const next = sectionChildren[windowEnd];
					if (
						windowEnd > windowStart + 1 &&
						windowChars + next.text.length > PARENT_CHUNK_MAX_CHARS
					)
						break;
					windowChars += next.text.length;
					windowEnd++;
				}
				const window = sectionChildren.slice(windowStart, windowEnd);
				const first = window[0];
				const last = window[window.length - 1];
				const text = parentSectionText(window.map((child) => child.text).join('\n'));
				const headingPath = first.headingPath;
				const structuralContext = [
					...new Set(section.map((block) => block.retrievalContext).filter(Boolean))
				].join('\n');
				const searchText = [documentName, headingPath, structuralContext, text]
					.filter(Boolean)
					.join('\n');
				chunks.push({
					text,
					searchText,
					fuzzyText: [
						fuzzyIndexText(searchText),
						headingPath ? fuzzyHeadingIndexText(headingPath) : ''
					]
						.filter(Boolean)
						.join(' '),
					seq: seq++,
					page: first.page,
					headingPath,
					paraIndex: -1,
					charStart: first.charStart,
					charEnd: last.charEnd,
					ocrConfidence: (() => {
						const values = window
							.map((child) => child.ocrConfidence)
							.filter((value): value is number => value !== null && value !== undefined);
						return values.length ? Math.min(...values) : null;
					})()
				});
				if (windowEnd >= sectionChildren.length) break;
				windowStart = Math.max(windowStart + 1, windowEnd - 1);
			}
		}
	}

	return chunks.filter((c) => c.text.trim().length >= 20);
}

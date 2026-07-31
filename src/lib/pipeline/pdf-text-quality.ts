import type { ParsedBlock, ParsedDoc } from '$lib/types';

const MIN_TEXT_CHARS = 50;
const MIN_JOINED_LETTERS = 50;
const LONG_ALPHABETIC_RUN = /\p{L}{24,}/gu;
const CJK_LETTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
// A NUL byte or U+FFFD in an embedded text layer is the corruption signal we
// look for, so matching the control character here is deliberate.
// eslint-disable-next-line no-control-regex
const UNMAPPED_CHARACTER = /[\u0000\uFFFD]/u;

export type PdfTextQualityReason = 'sparse' | 'unmapped' | 'joined' | null;

export interface PdfTextQuality {
	reason: PdfTextQualityReason;
	characters: number;
	letters: number;
	whitespaceRatio: number;
	longRunRatio: number;
	longestRun: number;
	unmappedCharacters: number;
}

/** Per-page structural quality gate. It deliberately uses no vocabulary or
 * language dictionary: malformed PDF text layers can contain plenty of valid
 * Unicode while joining nearly every word. CJK scripts are excluded from the
 * spacing heuristic because continuous characters are normal there. */
export function assessPdfTextLayer(text: string): PdfTextQuality {
	const normalized = text.trim();
	const characters = Array.from(normalized);
	const letterCharacters = characters.filter((character) => /\p{L}/u.test(character));
	const cjkLetters = letterCharacters.filter((character) => CJK_LETTER.test(character)).length;
	const longRuns = Array.from(
		normalized.matchAll(LONG_ALPHABETIC_RUN),
		(match) => Array.from(match[0]).length
	);
	const longRunCharacters = longRuns.reduce((sum, length) => sum + length, 0);
	const unmappedCharacters = characters.filter((character) =>
		UNMAPPED_CHARACTER.test(character)
	).length;
	const whitespaceRatio =
		characters.filter((character) => /\s/u.test(character)).length / Math.max(characters.length, 1);
	const longRunRatio = longRunCharacters / Math.max(letterCharacters.length, 1);
	const longestRun = Math.max(0, ...longRuns);

	let reason: PdfTextQualityReason = null;
	if (characters.length < MIN_TEXT_CHARS) {
		reason = 'sparse';
	} else if (
		unmappedCharacters >= 3 &&
		unmappedCharacters / Math.max(characters.length, 1) >= 0.005
	) {
		reason = 'unmapped';
	} else if (
		letterCharacters.length >= MIN_JOINED_LETTERS &&
		cjkLetters / Math.max(letterCharacters.length, 1) < 0.2 &&
		whitespaceRatio < 0.06 &&
		(longRunRatio >= 0.2 || longestRun >= 64)
	) {
		reason = 'joined';
	}

	return {
		reason,
		characters: characters.length,
		letters: letterCharacters.length,
		whitespaceRatio,
		longRunRatio,
		longestRun,
		unmappedCharacters
	};
}

function preferOcr(nativeText: string, ocrText: string, confidence: number): boolean {
	if (!ocrText.trim()) return false;
	const quality = assessPdfTextLayer(ocrText);
	if (quality.reason === null && confidence >= 0.5) return true;
	return (
		confidence >= 0.78 &&
		quality.reason !== 'sparse' &&
		quality.characters >= Math.min(50, Array.from(nativeText).length * 0.35)
	);
}

/** Merge OCR candidates with native pages. Suspicious native text is retained
 * only as a degraded fallback when recognition yields nothing better. A zero
 * confidence keeps that fallback searchable/citable but out of exact analytics. */
export function mergeParsedWithOcr(parsed: ParsedDoc, ocrBlocks: ParsedBlock[]): ParsedBlock[] {
	const fallbackByPage = new Map<number, ParsedBlock[]>();
	for (const block of parsed.ocrFallbackBlocks ?? []) {
		if (block.page == null) continue;
		const pageBlocks = fallbackByPage.get(block.page) ?? [];
		pageBlocks.push(block);
		fallbackByPage.set(block.page, pageBlocks);
	}
	// Grouped, not keyed by page: recognition emits one block per reconstructed
	// line now that the boxes survive the worker, so a page arrives as several.
	const ocrByPage = new Map<number, ParsedBlock[]>();
	for (const block of ocrBlocks) {
		if (block.page == null) continue;
		const pageBlocks = ocrByPage.get(block.page) ?? [];
		pageBlocks.push(block);
		ocrByPage.set(block.page, pageBlocks);
	}
	const selected: ParsedBlock[] = [...parsed.blocks];
	for (const page of parsed.needsOcr ?? []) {
		const fallback = fallbackByPage.get(page) ?? [];
		const ocr = ocrByPage.get(page) ?? [];
		if (!fallback.length) {
			selected.push(...ocr);
			continue;
		}
		const nativeText = fallback.map((block) => block.text).join('\n');
		// The page is judged whole: its lines are one recognition pass and share
		// its confidence, so keeping some and dropping others would mix two
		// readings of the same page.
		const ocrText = ocr.map((block) => block.text).join('\n');
		if (ocr.length && preferOcr(nativeText, ocrText, ocr[0].ocrConfidence ?? 0)) {
			selected.push(...ocr);
		} else {
			selected.push(...fallback.map((block) => ({ ...block, ocrConfidence: 0 })));
		}
	}
	return selected.sort((left, right) => (left.page ?? 0) - (right.page ?? 0));
}

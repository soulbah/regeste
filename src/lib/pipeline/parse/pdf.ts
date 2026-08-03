// PDF parsing runs on the main thread: pdf.js does its heavy lifting in its
// own worker, so the UI stays responsive. One block per page (the chunker
// splits within pages); char offsets are relative to the page's text.
//
// Per-page OCR triage (spec 023): a page with usable extractable text keeps its
// block; an image-only (sparse) page is recorded in `needsOcr` instead. A fully
// scanned PDF therefore returns no blocks but every page number in `needsOcr`,
// and a mixed PDF keeps its text pages searchable immediately — no more
// all-or-nothing `scanned_pdf` throw that discarded the whole document.

import type { ParsedDoc, ParsedBlock } from '$lib/types';
import { layoutUncertain, splitByChrome, type LayoutRegion } from '../layout-model';
import { orderPdfText, type ReconstructedLine } from './pdf-layout';
import { normalizeFormMarks, type PositionedTextItem } from './pdf-form-marks';
import { assessPdfTextLayer } from '../pdf-text-quality';
import { isUntrustedScan, largestRasterCoverage, textCoverage, textLayerTooThin } from './pdf-scan';
import { tableLinesByPage } from './pdf-markdown';

export function isLikelyPdfSectionHeading(line: string, nextLine = ''): boolean {
	const text = line.trim();
	const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
	if (
		text.length < 3 ||
		text.length > 100 ||
		words.length === 0 ||
		words.length > 12 ||
		nextLine.trim().length < 20 ||
		/[.;,]$/u.test(text) ||
		/(?:https?:\/\/|www\.|@)/iu.test(text) ||
		// A form field ("Nom * KEITA", "Prénom * AMINATA KEITA") is a
		// label-and-value pair, not a section title — the asterisk field marker
		// with a value after it disqualifies it. Without this, an ALL-CAPS value
		// pushes the uppercase ratio over the bar and the value becomes the
		// heading, severing the person from the real section label above it
		// (e.g. "Bénéficiaire"), which then never reaches the answer.
		/(?:^|\s)\*\s+\p{L}/u.test(text)
	)
		return false;
	if (/[?:]$/u.test(text)) return true;
	const letters = [...text].filter((character) => /\p{L}/u.test(character));
	const uppercase = letters.filter((character) => /\p{Lu}/u.test(character)).length;
	if (letters.length >= 3 && uppercase / letters.length >= 0.75) return true;
	const titleWords = words.filter((word) => /^\p{Lu}/u.test(word)).length;
	return words.length <= 8 && titleWords / words.length >= 0.7;
}

export function pageBlocks(lines: ReconstructedLine[], page: number): ParsedBlock[] {
	const blocks: ParsedBlock[] = [];
	let offset = 0;
	let heading: string | null = null;
	for (let index = 0; index < lines.length; index++) {
		const { text, retrievalContext, region } = lines[index];
		// Chrome never makes a heading and never inherits one: a legal footer
		// under the body's last section is not part of that section.
		// Labelled table/form rows are records, never section titles. Promoting an
		// all-capital value row here would pollute every inherited heading below it.
		if (
			!region &&
			!retrievalContext &&
			isLikelyPdfSectionHeading(text, lines[index + 1]?.text ?? '')
		)
			heading = text.trim();
		blocks.push({
			text,
			page,
			headingPath: !region && heading ? [heading] : undefined,
			...(region ? { region } : {}),
			// A table row's columns, named. Retrieval-only: `text` and the offsets
			// stay exactly what the page says, so citations are unaffected.
			...(retrievalContext ? { retrievalContext } : {}),
			charStart: offset,
			charEnd: offset + text.length
		});
		offset += text.length + 1;
	}
	return blocks;
}

export interface ParsePdfOptions {
	/** Layout regions for one page, in PDF points, or null when unavailable.
	 *  Wired to the OCR worker by parse-with-layout.ts; absent in unit tests and
	 *  when the model cannot load — parsing then simply carries no regions. */
	detectLayout?: (page: number) => Promise<LayoutRegion[] | null>;
}

/** pdf.js keeps glyph order in the text object's drawing direction. A text
 * matrix with a negative horizontal scale therefore yields both a right-edge
 * x coordinate and a reversed string. Normalize from geometry alone. */
export function horizontalPositionedText(
	text: string,
	transform: number[],
	width: number
): PositionedTextItem {
	const reversed = transform[0] < 0;
	return {
		text: reversed ? [...text].reverse().join('') : text,
		x: reversed ? transform[4] - width : transform[4],
		y: transform[5],
		width
	};
}

interface RawPdfTextItem {
	str: string;
	transform: number[];
	width: number;
}

/** Keep ordinary horizontal text plus genuine vertical table-header bands.
 * Isolated rotated stamps remain excluded: a header needs several labels on
 * one baseline and meaningful horizontal span. */
export function positionedPageText(
	items: RawPdfTextItem[],
	pageWidth: number
): PositionedTextItem[] {
	const vertical = items.filter(
		(item) => Math.abs(item.transform[0]) <= 0.01 && Math.abs(item.transform[1]) > 0.01
	);
	const verticalGroups: RawPdfTextItem[][] = [];
	for (const item of vertical) {
		let group = verticalGroups.find(
			(candidate) => Math.abs(candidate[0].transform[5] - item.transform[5]) <= 3
		);
		if (!group) {
			group = [];
			verticalGroups.push(group);
		}
		group.push(item);
	}
	const keptVertical = new Set(
		verticalGroups
			.filter((group) => {
				const xs = group.map((item) => item.transform[4]);
				return group.length >= 3 && Math.max(...xs) - Math.min(...xs) >= pageWidth * 0.2;
			})
			.flat()
	);

	return items.flatMap((item) => {
		if (!item.str.trim()) return [];
		if (Math.abs(item.transform[0]) > 0.01) {
			return [horizontalPositionedText(item.str.trim(), item.transform, item.width)];
		}
		if (!keptVertical.has(item)) return [];
		return [
			{
				text: item.str.trim(),
				x: item.transform[4],
				y: item.transform[5],
				width: Math.abs(item.transform[1])
			}
		];
	});
}

/**
 * Position-derived lines for one page, body first and chrome after.
 *
 * When the page trips a layout-uncertainty signal and a detector is wired,
 * items are split by the model's own region boxes BEFORE ordering. Ordering
 * body and chrome separately is what makes the old defect unrepresentable: a
 * letter's closing sentence cannot read after its legal footer, and a
 * signature block cannot glue to it, because they are never in the same
 * sequence to begin with.
 */
export async function positionLines(
	items: PositionedTextItem[],
	pageWidth: number,
	pageHeight: number,
	pageNum: number,
	options: ParsePdfOptions
): Promise<ReconstructedLine[]> {
	if (options.detectLayout && layoutUncertain(items, pageHeight)) {
		const regions = await options.detectLayout(pageNum).catch(() => null);
		if (regions?.length) {
			const { body, chrome } = splitByChrome(items, regions, pageWidth, pageHeight);
			return [
				...orderPdfText(body, pageWidth),
				...chrome.flatMap((group) =>
					orderPdfText(group.items, pageWidth).map((line) => ({ ...line, region: group.label }))
				)
			];
		}
	}
	return orderPdfText(items, pageWidth);
}

export async function parsePdf(
	data: ArrayBuffer,
	options: ParsePdfOptions = {}
): Promise<ParsedDoc> {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	// slice() so pdf.js can't detach the caller's buffer — ingest and ocrDocument
	// both reuse the same ArrayBuffer after parsing.
	//
	// Errors only. pdf.js narrates every quirk of every embedded font at warning
	// level — a single real-world PDF produced dozens of "TT: undefined function"
	// lines while parsing perfectly — and a console that scrolls on a normal add is
	// a console nobody reads when something is actually wrong. Errors still print,
	// and a document that fails still fails loudly.
	const loadingTask = pdfjs.getDocument({
		data: data.slice(0),
		verbosity: pdfjs.VerbosityLevel.ERRORS
	});
	const doc = await loadingTask.promise;
	const blocks: ParsedBlock[] = [];
	const needsOcr: number[] = [];
	const ocrFallbackBlocks: ParsedBlock[] = [];

	// Pass 1 — collect positioned items for every page: checkbox normalization
	// is document-wide (a glyph codepoint proven to be a checkbox on one page
	// qualifies its lone instances everywhere).
	const pageWidths: number[] = [];
	const pageHeights: number[] = [];
	const pagesPositioned: PositionedTextItem[][] = [];
	/** Pages painted from a full-page raster whose text layer inks almost
	 *  nothing: a scan carrying a worthless OCR layer (see pdf-scan.ts). */
	const untrustedScans = new Set<number>();
	for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
		const page = await doc.getPage(pageNum);
		const viewport = page.getViewport({ scale: 1 });
		pageWidths.push(viewport.width);
		pageHeights.push(viewport.height);
		const content = await page.getTextContent();
		const pageArea = viewport.width * viewport.height;
		// Coverage is free from the text items; the raster measurement walks every
		// drawing operator, so it only runs where the cheap signal already agrees.
		const coverage = textCoverage(
			content.items.flatMap((item) =>
				'width' in item && 'height' in item
					? [{ width: item.width as number, height: item.height as number }]
					: []
			),
			pageArea
		);
		if (textLayerTooThin(coverage)) {
			const raster = largestRasterCoverage(await page.getOperatorList(), pdfjs.OPS, pageArea);
			if (isUntrustedScan(raster, coverage)) untrustedScans.add(pageNum);
		}
		pagesPositioned.push(
			positionedPageText(
				content.items
					.filter(
						(item): item is (typeof content.items)[number] & { str: string; transform: number[] } =>
							'str' in item && Array.isArray(item.transform)
					)
					.map((item) => ({
						str: item.str,
						transform: item.transform,
						width: 'width' in item && typeof item.width === 'number' ? item.width : 0
					})),
				pageWidths[pageWidths.length - 1]
			).filter((item) => item.text.length > 0)
		);
		page.cleanup();
	}
	await loadingTask.destroy();

	// Pass 2 — order text and build blocks from the normalized items.
	// Pages whose ruling binds values to labels take their reading order from
	// the table reconstruction instead (see pdf-markdown.ts); every other page,
	// and every page if that parser is unavailable, keeps the position-derived
	// order unchanged.
	const routedPages = await tableLinesByPage(data);
	const normalizedPages = normalizeFormMarks(pagesPositioned);
	for (let pageNum = 1; pageNum <= normalizedPages.length; pageNum++) {
		const routed = routedPages.get(pageNum);
		const lines: ReconstructedLine[] = routed
			? routed.map((text) => ({ text }))
			: await positionLines(
					normalizedPages[pageNum - 1],
					pageWidths[pageNum - 1],
					pageHeights[pageNum - 1],
					pageNum,
					options
				);
		const text = lines
			.map((line) => line.text)
			.join('\n')
			.trim();
		const quality = assessPdfTextLayer(text);
		// A scan whose embedded OCR layer inks almost nothing reads as valid text
		// but says nothing, so the structural check has to override the textual one.
		const reason = quality.reason ?? (untrustedScans.has(pageNum) ? 'raster' : null);
		if (reason) {
			needsOcr.push(pageNum);
			// Anything but an empty page is worth keeping as a fallback: if
			// recognition returns nothing better, degraded text still beats none.
			if (reason !== 'sparse') ocrFallbackBlocks.push(...pageBlocks(lines, pageNum));
		} else {
			blocks.push(...pageBlocks(lines, pageNum));
		}
	}

	return {
		blocks,
		pages: doc.numPages,
		needsOcr,
		ocrFallbackBlocks: ocrFallbackBlocks.length ? ocrFallbackBlocks : undefined
	};
}

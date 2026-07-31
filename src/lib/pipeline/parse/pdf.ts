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
		const { text, retrievalContext } = lines[index];
		if (isLikelyPdfSectionHeading(text, lines[index + 1]?.text ?? '')) heading = text.trim();
		blocks.push({
			text,
			page,
			headingPath: heading ? [heading] : undefined,
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

export async function parsePdf(data: ArrayBuffer): Promise<ParsedDoc> {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	// slice() so pdf.js can't detach the caller's buffer — ingest and ocrDocument
	// both reuse the same ArrayBuffer after parsing.
	const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
	const doc = await loadingTask.promise;
	const blocks: ParsedBlock[] = [];
	const needsOcr: number[] = [];
	const ocrFallbackBlocks: ParsedBlock[] = [];

	// Pass 1 — collect positioned items for every page: checkbox normalization
	// is document-wide (a glyph codepoint proven to be a checkbox on one page
	// qualifies its lone instances everywhere).
	const pageWidths: number[] = [];
	const pagesPositioned: PositionedTextItem[][] = [];
	/** Pages painted from a full-page raster whose text layer inks almost
	 *  nothing: a scan carrying a worthless OCR layer (see pdf-scan.ts). */
	const untrustedScans = new Set<number>();
	for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
		const page = await doc.getPage(pageNum);
		const viewport = page.getViewport({ scale: 1 });
		pageWidths.push(viewport.width);
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
			content.items
				.filter(
					(item): item is (typeof content.items)[number] & { str: string; transform: number[] } =>
						'str' in item && Array.isArray(item.transform)
				)
				// Rotated (vertical) text is print-margin plumbing — page ids, batch
				// numbers stamped along the sheet edge. Its y lands mid-table, where
				// the line clustering absorbs it into a data row and pushes the row's
				// own first cell out (measured: an amortization row lost its rank to
				// the stamp "184320"). transform[0] is cos(rotation)·scale: ~0 means
				// the glyphs run vertically.
				.filter((item) => Math.abs(item.transform[0]) > 0.01)
				.map((item) => ({
					text: item.str.trim(),
					x: item.transform[4],
					y: item.transform[5],
					width: 'width' in item && typeof item.width === 'number' ? item.width : 0
				}))
				.filter((item) => item.text.length > 0)
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
		const positioned = orderPdfText(normalizedPages[pageNum - 1], pageWidths[pageNum - 1]);
		const routed = routedPages.get(pageNum);
		const lines: ReconstructedLine[] = routed ? routed.map((text) => ({ text })) : positioned;
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

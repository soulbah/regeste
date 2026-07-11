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

const SCANNED_MIN_CHARS_PER_PAGE = 50;

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

	for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
		const page = await doc.getPage(pageNum);
		const content = await page.getTextContent();
		let text = '';
		for (const item of content.items) {
			if (!('str' in item)) continue;
			text += item.str;
			text += item.hasEOL ? '\n' : ' ';
		}
		text = text.replace(/[ \t]+\n/g, '\n').trim();
		if (text.length < SCANNED_MIN_CHARS_PER_PAGE) {
			// Image-only page: OCR it later instead of keeping the crumbs of text.
			needsOcr.push(pageNum);
		} else {
			blocks.push({ text, page: pageNum, charStart: 0, charEnd: text.length });
		}
		page.cleanup();
	}
	await loadingTask.destroy();

	return { blocks, pages: doc.numPages, needsOcr };
}

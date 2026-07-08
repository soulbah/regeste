// PDF parsing runs on the main thread: pdf.js does its heavy lifting in its
// own worker, so the UI stays responsive. One block per page (the chunker
// splits within pages); char offsets are relative to the page's text.

import type { ParsedDoc, ParsedBlock } from '$lib/types';

const SCANNED_MIN_CHARS_PER_PAGE = 50;

export async function parsePdf(data: ArrayBuffer): Promise<ParsedDoc> {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	const loadingTask = pdfjs.getDocument({ data });
	const doc = await loadingTask.promise;
	const blocks: ParsedBlock[] = [];
	let sparsePages = 0;

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
		if (text.length < SCANNED_MIN_CHARS_PER_PAGE) sparsePages++;
		if (text.length > 0) {
			blocks.push({ text, page: pageNum, charStart: 0, charEnd: text.length });
		}
		page.cleanup();
	}
	await loadingTask.destroy();

	if (doc.numPages > 0 && sparsePages / doc.numPages > 0.5) {
		throw Object.assign(new Error('No extractable text — likely a scanned PDF'), {
			code: 'scanned_pdf' as const
		});
	}

	return { blocks, pages: doc.numPages };
}

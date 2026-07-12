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
		const positioned = content.items
			.filter(
				(item): item is (typeof content.items)[number] & { str: string; transform: number[] } =>
					'str' in item && Array.isArray(item.transform)
			)
			.map((item) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }))
			.filter((item) => item.text.length > 0);
		// Rebuild visual lines. Financial documents depend on labels staying next
		// to their values; flat item concatenation loses that relationship.
		const lines: Array<{ y: number; items: Array<{ text: string; x: number }> }> = [];
		for (const item of positioned) {
			let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
			if (!line) {
				line = { y: item.y, items: [] };
				lines.push(line);
			}
			line.items.push({ text: item.text, x: item.x });
		}
		lines.sort((a, b) => b.y - a.y);
		const lineTexts = lines.map((line) =>
			line.items
				.sort((a, b) => a.x - b.x)
				.map((item) => item.text)
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim()
		);
		const text = lineTexts.join('\n').trim();
		if (text.length < SCANNED_MIN_CHARS_PER_PAGE) sparsePages++;
		if (text.length > 0) {
			let offset = 0;
			for (const line of lineTexts) {
				blocks.push({
					text: line,
					page: pageNum,
					charStart: offset,
					charEnd: offset + line.length
				});
				offset += line.length + 1;
			}
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

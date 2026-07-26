// Dump a PDF as the pipeline actually reconstructs it, page by page.
//
// Benchmark cases have to be written from what the index contains, not from
// what the PDF looks like in a viewer: an oracle written against the visual
// layout will assert values the retrieval layer never sees, and then the
// benchmark measures the gap between two readings of the document instead of
// the quality of an answer.
//
// Usage: bun scripts/dump-parsed-document.ts <file.pdf> [firstPage] [lastPage]
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { orderPdfText } from '../src/lib/pipeline/parse/pdf-layout';
import { normalizeFormMarks } from '../src/lib/pipeline/parse/pdf-form-marks';

const [path, from, to] = process.argv.slice(2);
if (!path) {
	console.error('usage: bun scripts/dump-parsed-document.ts <file.pdf> [firstPage] [lastPage]');
	process.exit(1);
}

/** The shape this script needs from pdf.js text items, so the dump does not
 * depend on the library's full type surface. */
interface TextItem {
	str: string;
	transform: number[];
	width?: number;
}

function isTextItem(item: unknown): item is TextItem {
	return (
		typeof item === 'object' &&
		item !== null &&
		'str' in item &&
		Array.isArray((item as { transform?: unknown }).transform)
	);
}

const data = new Uint8Array(readFileSync(path));
const pdf = await getDocument({ data, useSystemFonts: true }).promise;

const positioned: Array<Array<{ text: string; x: number; y: number; width: number }>> = [];
const widths: number[] = [];
for (let index = 0; index < pdf.numPages; index++) {
	const page = await pdf.getPage(index + 1);
	widths.push(page.getViewport({ scale: 1 }).width);
	const content = await page.getTextContent();
	positioned.push(
		content.items
			.filter(isTextItem)
			// Rotated glyphs are print-margin plumbing, dropped at collection by
			// the live path; keeping them here would misreport the reading order.
			.filter((item) => Math.abs(item.transform[0]) > 0.01)
			.map((item) => ({
				text: item.str.trim(),
				x: item.transform[4],
				y: item.transform[5],
				width: item.width ?? 0
			}))
			.filter((item) => item.text.length > 0)
	);
}

const normalized = normalizeFormMarks(positioned);
const first = from ? Math.max(1, Number(from)) : 1;
const last = to ? Math.min(pdf.numPages, Number(to)) : pdf.numPages;

console.log(`${path} — ${pdf.numPages} page(s), showing ${first}..${last}`);
for (let page = first; page <= last; page++) {
	const lines = orderPdfText(normalized[page - 1], widths[page - 1]);
	console.log(`\n───────── page ${page} ─────────`);
	for (const line of lines) console.log(line);
}

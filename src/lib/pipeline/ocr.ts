// On-device OCR of scanned PDF pages (spec 023). Rasterising and recognition
// both happen in a persistent worker: pdf.js drives its render loop with
// `requestAnimationFrame` whenever a `window` exists, and a hidden tab is served
// no animation frames, so a page rendered on the main thread stops dead the
// moment someone switches tab (see ocr-worker.ts). Nothing but page numbers and
// text crosses the boundary now.
//
// The recognized boxes then go through the same reading-order reconstruction as
// a born-digital page (`orderPdfText`), so a scan gets the column splitting and
// table-header binding that native pages have had since spec 027. Before that,
// this file kept only the recognizer's concatenated text and a scanned page
// arrived at the chunker as one undifferentiated block per page.
import { transfer, wrap, type Remote } from 'comlink';
import type { ParsedBlock } from '$lib/types';
import type { OcrWorkerApi } from './ocr-worker';
import { yieldToMain } from './embed-batches';
import { guardWorker } from '$lib/state/worker-health.svelte';
import { overlayNativePdfText, positionedFromOcrLines } from './ocr-boxes';
import { orderPdfText } from './parse/pdf-layout';
import { pageBlocks, positionedPageText } from './parse/pdf';
import { splitByChrome, type LayoutRegion } from './layout-model';
import { assessPdfTextLayer } from './pdf-text-quality';

export interface OcrProgress {
	page: number;
	done: number;
	total: number;
}

// 300 DPI is the accuracy floor for accented French body text — never drop it to
// save memory. One page in flight (~35 MB at this scale); pages are never batched.
const OCR_DPI_SCALE = 300 / 72;
let ocrApi: Remote<OcrWorkerApi> | null = null;

function getOcrWorker(): Remote<OcrWorkerApi> {
	if (!ocrApi) {
		const worker = new Worker(new URL('./ocr-worker.ts', import.meta.url), { type: 'module' });
		guardWorker(worker, 'ocr');
		ocrApi = wrap<OcrWorkerApi>(worker);
	}
	return ocrApi;
}

/**
 * Blocks for one recognized page, laid out from the recognized boxes.
 *
 * The geometry is what makes a scan a page rather than a wall of text, so it is
 * used whenever it is present: `orderPdfText` splits columns, keeps a
 * multi-line cell contiguous and binds a data table's header to its rows,
 * exactly as it does for a born-digital page. `pageBlocks` then cuts the page
 * into one block per reconstructed line with real character offsets, where this
 * path used to emit a single page-wide block, and picks up section headings a
 * scan never had.
 *
 * Recognition without usable boxes still yields its text: a page that reads
 * correctly but lays out poorly beats a page that is not searchable at all.
 */
export function ocrPageBlocks(
	result: {
		text: string;
		confidence: number;
		imageWidth: number;
		imageHeight: number;
		lines: import('./ocr-boxes').OcrItem[][];
		nativeItems?: Array<{ str: string; transform: number[]; width: number }>;
	},
	page: number,
	regions: LayoutRegion[] = []
): ParsedBlock[] {
	const ocrPositioned = positionedFromOcrLines(result.lines ?? [], {
		imageHeight: result.imageHeight,
		scale: OCR_DPI_SCALE
	});
	const pageWidth = result.imageWidth / OCR_DPI_SCALE;
	const pageHeight = result.imageHeight / OCR_DPI_SCALE;
	const nativePositioned = positionedPageText(result.nativeItems ?? [], pageWidth);
	const nativeText = orderPdfText(nativePositioned, pageWidth)
		.map((line) => line.text)
		.join('\n');
	const nativeQuality = assessPdfTextLayer(nativeText);
	// Sound digital runs win only where their coordinates overlap OCR. This is
	// the same mixed-page strategy as mature OCR pipelines: preserve existing
	// text and recognize missing image regions, without field vocabularies. A
	// sparse layer can still hold exact fields; sparseness triggers OCR for the
	// rest of the page but is not corruption. Joined or unmapped layers are.
	const positioned =
		nativePositioned.length &&
		nativeQuality.reason !== 'joined' &&
		nativeQuality.reason !== 'unmapped'
			? overlayNativePdfText(ocrPositioned, nativePositioned, pageHeight)
			: ocrPositioned;
	// Same contract as a born-digital page (spec 034): chrome is split off by
	// the detector's boxes before ordering, so a scanned letter's legal footer
	// cannot glue to its signature either.
	const { body, chrome } = splitByChrome(positioned, regions, pageWidth, pageHeight);
	const lines = positioned.length
		? [
				...orderPdfText(body, pageWidth),
				...chrome.flatMap((group) =>
					orderPdfText(group.items, pageWidth).map((line) => ({ ...line, region: group.label }))
				)
			]
		: [];
	const laidOut = lines.length ? pageBlocks(lines, page) : [];
	if (laidOut.length)
		return laidOut.map((block) => ({ ...block, ocrConfidence: result.confidence }));
	const text = result.text;
	if (!text) return [];
	return [{ text, page, charStart: 0, charEnd: text.length, ocrConfidence: result.confidence }];
}

/** OCR the given 1-based page numbers of a PDF; returns the blocks of every page
 * that yielded text, positioned at its page number so citations resolve correctly. */
export async function ocrPages(
	data: ArrayBuffer,
	pageNumbers: number[],
	onProgress?: (p: OcrProgress) => void,
	signal?: AbortSignal
): Promise<ParsedBlock[]> {
	if (!pageNumbers.length) return [];

	const api = getOcrWorker();
	// A copy, transferred: the worker owns the bytes it parses, and the caller
	// keeps its own buffer, which ingest and ocrDocument both reuse afterwards.
	const owned = data.slice(0);
	await api.openDocument(transfer(owned, [owned]));
	const out: ParsedBlock[] = [];
	let done = 0;

	try {
		for (const pageNum of pageNumbers) {
			await yieldToMain();
			if (signal?.aborted) throw new DOMException('OCR cancelled', 'AbortError');
			const recognized = await api.recognizePage(pageNum, OCR_DPI_SCALE);
			// The page bitmap already exists in the worker for recognition, so the
			// regions are nearly free here. A failed model load degrades to no
			// regions, never to a failed page.
			const regions = await api.detectLayout(pageNum, OCR_DPI_SCALE).catch(() => []);
			out.push(...ocrPageBlocks(recognized, pageNum, regions));
			done++;
			onProgress?.({ page: pageNum, done, total: pageNumbers.length });
		}
	} finally {
		await api.closeDocument();
	}

	return out;
}

/**
 * A layout detector bound to one document, for the born-digital parse.
 *
 * `parsePdf` runs on the main thread and only reads text; rasterisation lives
 * in the OCR worker (see ocr-worker.ts for why a hidden tab forces that). This
 * client opens the document in that worker on the first uncertain page, serves
 * every subsequent page from the same open document, and must be disposed by
 * the caller. A model that cannot load resolves to null: parsing proceeds with
 * no regions rather than failing the document.
 */
export function createLayoutDetector(data: ArrayBuffer): {
	detect: (page: number) => Promise<LayoutRegion[] | null>;
	dispose: () => Promise<void>;
} {
	const api = getOcrWorker();
	let opened: Promise<unknown> | null = null;
	return {
		async detect(page) {
			try {
				if (!opened) {
					const owned = data.slice(0);
					opened = api.openDocument(transfer(owned, [owned]));
				}
				await opened;
				return await api.detectLayout(page, OCR_DPI_SCALE);
			} catch {
				return null;
			}
		},
		async dispose() {
			if (opened) await api.closeDocument().catch(() => undefined);
		}
	};
}

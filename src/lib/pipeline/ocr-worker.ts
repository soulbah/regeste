/// <reference lib="webworker" />

import { expose } from 'comlink';
import { OCR_MODEL } from './ocr-model';
import { shouldRetryOcr } from './ocr-quality';
import { OCR_PADDING_HORIZONTAL, OCR_PADDING_VERTICAL, type OcrItem } from './ocr-boxes';

export interface OcrPageResult {
	text: string;
	confidence: number;
	/** Rendered page size in pixels, so the caller can map the boxes back to
	 *  page coordinates without knowing how the page was rasterised. */
	imageWidth: number;
	imageHeight: number;
	/** Recognized items grouped by line, in image pixels. The caller turns these
	 *  into page positions; without them a scanned page reaches the chunker with
	 *  no geometry at all (see ocr-boxes.ts). */
	lines: OcrItem[][];
}

/** ppu-paddle-ocr's image engine is OffscreenCanvas-compatible, but its web
 * adapter still calls document.createElement and references HTMLCanvasElement.
 * Supply only those canvas primitives inside this isolated worker. */
function installCanvasCompatibility(): void {
	const scope = globalThis as unknown as Record<string, unknown>;
	if (!scope.HTMLCanvasElement) scope.HTMLCanvasElement = OffscreenCanvas;
	if (!scope.document) {
		scope.document = {
			createElement(tag: string) {
				if (tag !== 'canvas') throw new Error(`Unsupported worker element: ${tag}`);
				return new OffscreenCanvas(1, 1);
			}
		};
	}
}

let servicePromise: Promise<import('ppu-paddle-ocr/web').PaddleOcrService> | null = null;

function getService(): Promise<import('ppu-paddle-ocr/web').PaddleOcrService> {
	if (!servicePromise) {
		servicePromise = (async () => {
			const { PaddleOcrService } = await import('ppu-paddle-ocr/web');
			// Import first: Vite/ONNX must observe a real Worker environment, not
			// mistake the narrow canvas compatibility object for a browser DOM.
			installCanvasCompatibility();
			const service = new PaddleOcrService({
				model: OCR_MODEL,
				// The library's own defaults, stated rather than inherited: the box
				// geometry is un-padded with exactly these numbers, so they must
				// not be free to drift with a dependency bump.
				detection: {
					paddingVertical: OCR_PADDING_VERTICAL,
					paddingHorizontal: OCR_PADDING_HORIZONTAL
				}
			});
			await service.initialize();
			return service;
		})().catch((error) => {
			servicePromise = null;
			throw error;
		});
	}
	return servicePromise;
}

function increaseContrast(canvas: OffscreenCanvas): void {
	const context = canvas.getContext('2d');
	if (!context) return;
	const image = context.getImageData(0, 0, canvas.width, canvas.height);
	for (let index = 0; index < image.data.length; index += 4) {
		const gray =
			image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
		const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
		image.data[index] = image.data[index + 1] = image.data[index + 2] = contrasted;
	}
	context.putImageData(image, 0, 0);
}

/**
 * Rasterising happens here, not on the page, and that is a correctness fix
 * rather than a performance one.
 *
 * pdf.js drives its render loop with `requestAnimationFrame` whenever a
 * `window` exists, and a browser stops serving animation frames to a page it is
 * not painting. On the main thread a page render therefore does not merely slow
 * down when the tab goes to the background, it stops: the operator list arrives
 * complete, `graphicsReady` turns true, and the loop stays at operator zero for
 * as long as the tab is hidden. Someone who drops a scan and switches tab comes
 * back to an ingest frozen mid-document.
 *
 * A worker has no `window`, so pdf.js schedules the same loop on a timer and
 * runs regardless of what the tab is doing. Measured on a 7-page scan, one page
 * at 300 DPI: never on a hidden main thread, 509 ms here. It also takes the
 * 35 MB page bitmap off the structured-clone path entirely, which is the
 * worker migration spec 023 left as a follow-up.
 */
let loadingTask: import('pdfjs-dist').PDFDocumentLoadingTask | null = null;
let documentPromise: Promise<import('pdfjs-dist').PDFDocumentProxy> | null = null;

async function openDocument(data: ArrayBuffer): Promise<number> {
	await closeDocument();
	const pdfjs = await import('pdfjs-dist');
	pdfjs.GlobalWorkerOptions.workerSrc = (
		await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
	).default;
	// Errors only, for the same reason as the parser: a single real document
	// narrates dozens of font quirks while parsing perfectly.
	loadingTask = pdfjs.getDocument({ data, verbosity: pdfjs.VerbosityLevel.ERRORS });
	documentPromise = loadingTask.promise;
	return (await documentPromise).numPages;
}

async function closeDocument(): Promise<void> {
	const pending = loadingTask;
	loadingTask = null;
	documentPromise = null;
	if (pending) await pending.destroy().catch(() => undefined);
}

/** Render one page at the given scale and recognise it, without the bitmap ever
 *  leaving this thread. */
async function recognizePage(pageNumber: number, scale: number): Promise<OcrPageResult> {
	if (!documentPromise) throw new Error('No document is open for recognition');
	const doc = await documentPromise;
	const page = await doc.getPage(pageNumber);
	let canvas: OffscreenCanvas;
	try {
		const viewport = page.getViewport({ scale });
		canvas = new OffscreenCanvas(
			Math.max(1, Math.ceil(viewport.width)),
			Math.max(1, Math.ceil(viewport.height))
		);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Could not create a worker 2D context for OCR');
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, canvas.width, canvas.height);
		await page.render({ canvas, canvasContext: context, viewport } as never).promise;
	} finally {
		page.cleanup();
	}

	const service = await getService();
	let result = await service.recognize(canvas, { flatten: false, noCache: true });
	if (shouldRetryOcr(result.confidence, 0)) {
		increaseContrast(canvas);
		const retry = await service.recognize(canvas, { flatten: false, noCache: true });
		if (retry.confidence > result.confidence) result = retry;
	}
	// `flatten: false` is what makes the geometry available: it returns the
	// recognized items grouped by line, each with its box, where the flattened
	// form would give back a single string and nothing else.
	const lines = 'lines' in result ? result.lines : [];
	return {
		text: (result.text ?? '').trim(),
		confidence: result.confidence,
		imageWidth: canvas.width,
		imageHeight: canvas.height,
		lines: lines.map((line) =>
			line.map((item) => ({
				text: item.text,
				box: { x: item.box.x, y: item.box.y, width: item.box.width, height: item.box.height }
			}))
		)
	};
}

const api = { openDocument, recognizePage, closeDocument };
export type OcrWorkerApi = typeof api;

expose(api);

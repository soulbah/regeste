/// <reference lib="webworker" />

import { expose } from 'comlink';
import { OCR_MODEL } from './ocr-model';
import { shouldRetryOcr } from './ocr-quality';
import { OCR_PADDING_HORIZONTAL, OCR_PADDING_VERTICAL, type OcrItem } from './ocr-boxes';

export interface OcrPageResult {
	text: string;
	confidence: number;
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

async function recognizePage(bitmap: ImageBitmap): Promise<OcrPageResult> {
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Could not create a worker 2D context for OCR');
	context.drawImage(bitmap, 0, 0);
	bitmap.close();

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
		lines: lines.map((line) =>
			line.map((item) => ({
				text: item.text,
				box: { x: item.box.x, y: item.box.y, width: item.box.width, height: item.box.height }
			}))
		)
	};
}

const api = { recognizePage };
export type OcrWorkerApi = typeof api;

expose(api);

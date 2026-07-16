/// <reference lib="webworker" />

import { expose } from 'comlink';
import { OCR_MODEL } from './ocr-model';
import { shouldRetryOcr } from './ocr-quality';

export interface OcrPageResult {
	text: string;
	confidence: number;
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
			const service = new PaddleOcrService({ model: OCR_MODEL });
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
	return { text: (result.text ?? '').trim(), confidence: result.confidence };
}

const api = { recognizePage };
export type OcrWorkerApi = typeof api;

expose(api);

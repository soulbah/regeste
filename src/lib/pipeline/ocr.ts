// On-device OCR of scanned PDF pages (spec 023). Runs on the main thread,
// mirroring parsePdf: pdf.js renders each image-only page to a canvas and
// PP-OCRv5 latin (via onnxruntime-web, WebGPU where available, WASM otherwise)
// reads it. Nothing leaves the device — page images and recognized text stay
// here; only the generic ORT wasm glue is fetched from a CDN, never document
// bytes. The engine (ppu-paddle-ocr) was validated in the spec 023 spike; a
// dependency-free raw-ORT port is a later optimization.
import type { PaddleOcrService } from 'ppu-paddle-ocr/web';
import type { ParsedBlock } from '$lib/types';
import { OCR_MODEL } from './ocr-model';
import { shouldRetryOcr } from './ocr-quality';

export interface OcrProgress {
	page: number;
	done: number;
	total: number;
}

// 300 DPI is the accuracy floor for accented French body text — never drop it to
// save memory. One page in flight (~35 MB at this scale); pages are never batched.
const OCR_DPI_SCALE = 300 / 72;
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

let servicePromise: Promise<PaddleOcrService> | null = null;

function getService(): Promise<PaddleOcrService> {
	if (!servicePromise) {
		servicePromise = (async () => {
			const { PaddleOcrService } = await import('ppu-paddle-ocr/web');
			const svc = new PaddleOcrService({ model: OCR_MODEL });
			await svc.initialize();
			return svc;
		})().catch((err) => {
			servicePromise = null;
			throw err;
		});
	}
	return servicePromise;
}

/** OCR the given 1-based page numbers of a PDF; returns one block per page that
 * yielded text, positioned at its page number so citations resolve correctly. */
export async function ocrPages(
	data: ArrayBuffer,
	pageNumbers: number[],
	onProgress?: (p: OcrProgress) => void,
	signal?: AbortSignal
): Promise<ParsedBlock[]> {
	if (!pageNumbers.length) return [];

	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	const svc = await getService();
	// slice() so pdf.js can't detach the caller's buffer (it may reuse it).
	const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
	const doc = await loadingTask.promise;
	const out: ParsedBlock[] = [];
	let done = 0;

	try {
		for (const pageNum of pageNumbers) {
			if (signal?.aborted) throw new DOMException('OCR cancelled', 'AbortError');
			const page = await doc.getPage(pageNum);
			const viewport = page.getViewport({ scale: OCR_DPI_SCALE });
			const canvas = new OffscreenCanvas(
				Math.max(1, Math.ceil(viewport.width)),
				Math.max(1, Math.ceil(viewport.height))
			);
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Could not create a 2D context for OCR rendering');
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			await page.render({ canvas, canvasContext: ctx, viewport } as never).promise;

			// SDK cache hashes only a small image sample. Document pages share large
			// white margins, so distinct pages can collide and replay page 1's OCR
			// result across the whole PDF. Each page is processed once here: bypass
			// that cache and keep model/session reuse only.
			let result = await svc.recognize(canvas, { flatten: true, noCache: true });
			if (shouldRetryOcr(result.confidence, 0)) {
				increaseContrast(canvas);
				const retry = await svc.recognize(canvas, { flatten: true, noCache: true });
				if (retry.confidence > result.confidence) result = retry;
			}
			const text = (result.text ?? '').trim();
			if (text)
				out.push({
					text,
					page: pageNum,
					charStart: 0,
					charEnd: text.length,
					ocrConfidence: result.confidence
				});

			page.cleanup();
			done++;
			onProgress?.({ page: pageNum, done, total: pageNumbers.length });
		}
	} finally {
		await loadingTask.destroy();
	}

	return out;
}

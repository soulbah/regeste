// On-device OCR of scanned PDF pages (spec 023). pdf.js renders one page at a
// time, then transfers its ImageBitmap zero-copy to a persistent OCR worker.
// PP-OCRv5/ONNX inference and image pre/post-processing stay off the UI thread.
import { transfer, wrap, type Remote } from 'comlink';
import type { ParsedBlock } from '$lib/types';
import type { OcrWorkerApi } from './ocr-worker';
import { yieldToMain } from './embed-batches';
import { guardWorker } from '$lib/state/worker-health.svelte';

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

	// slice() so pdf.js can't detach the caller's buffer (it may reuse it).
	const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
	const doc = await loadingTask.promise;
	const out: ParsedBlock[] = [];
	let done = 0;

	try {
		for (const pageNum of pageNumbers) {
			await yieldToMain();
			if (signal?.aborted) throw new DOMException('OCR cancelled', 'AbortError');
			const page = await doc.getPage(pageNum);
			try {
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

				// Ownership moves to the worker: no 35 MB structured clone per page.
				const bitmap = canvas.transferToImageBitmap();
				const result = await getOcrWorker().recognizePage(transfer(bitmap, [bitmap]));
				const text = result.text;
				if (text)
					out.push({
						text,
						page: pageNum,
						charStart: 0,
						charEnd: text.length,
						ocrConfidence: result.confidence
					});
			} finally {
				page.cleanup();
			}
			done++;
			onProgress?.({ page: pageNum, done, total: pageNumbers.length });
		}
	} finally {
		await loadingTask.destroy();
	}

	return out;
}

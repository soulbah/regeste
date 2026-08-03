<script lang="ts">
	// OCR A/B, in the only place the recogniser runs.
	//
	// The parser evaluation corpus is born-digital, so it cannot measure the OCR
	// path directly, and rasterising it in node is not possible here because the
	// recogniser's image stack needs a browser canvas. This page closes that
	// gap: it renders a real document at the pipeline's own 300 DPI, recognises
	// each page with the real model, and returns both readings of it.
	//
	//   naive   the recogniser's own concatenated text, boxes discarded — what
	//           src/lib/pipeline/ocr.ts emitted before this change.
	//   boxes   the recognised boxes through orderPdfText, which is what it
	//           emits now.
	//
	// Rendering a born-digital page and recognising the raster IS a scan of that
	// page, which is what makes hand-verified ground truth usable here: the
	// document is known exactly, and the recogniser sees only pixels. `degrade`
	// adds the artefacts a real scanner introduces, so the clean render is not
	// mistaken for the hard case.
	//
	// Scoring happens in scripts/ocr-ab/score.ts, so nothing here decides what
	// counts as better.
	//
	// Driven from the console:
	//   await window.ocrEval('/dev/parser-ab/x.pdf', [1], { degrade: 'scan' })
	import { onMount } from 'svelte';
	import type { ParsedBlock } from '$lib/types';
	import { positionedFromOcrLines } from '$lib/pipeline/ocr-boxes';
	import { orderPdfText } from '$lib/pipeline/parse/pdf-layout';
	import { pageBlocks, parsePdf } from '$lib/pipeline/parse/pdf';
	import { shouldRetryOcr } from '$lib/pipeline/ocr-quality';
	import { OCR_PADDING_HORIZONTAL, OCR_PADDING_VERTICAL } from '$lib/pipeline/ocr-boxes';
	import { OCR_DETECTION_MAX_SIDE } from '$lib/pipeline/ocr-model';

	const OCR_DPI_SCALE = 300 / 72;

	interface PageReading {
		page: number;
		nativeText: string;
		naiveText: string;
		boxesText: string;
		boxesRetrievalText: string;
		blocks: number;
		headings: number;
		retrievalContexts: number;
		confidence: number;
		recognisedLines: number;
		ms: number;
	}

	let status = $state('idle');

	// Recognition runs on the main thread here, not through the app's worker:
	// under `vite dev` the worker's dynamic import of the recogniser does not
	// resolve in this tree, and the measurement is about layout, not threading.
	// Same package, same models, same options as ocr-worker.ts.
	let servicePromise: Promise<import('ppu-paddle-ocr/web').PaddleOcrService> | null = null;
	function getService() {
		servicePromise ??= (async () => {
			const { PaddleOcrService } = await import('ppu-paddle-ocr/web');
			const { OCR_MODEL } = await import('$lib/pipeline/ocr-model');
			const service = new PaddleOcrService({
				model: OCR_MODEL,
				detection: {
					maxSideLength: OCR_DETECTION_MAX_SIDE,
					paddingVertical: OCR_PADDING_VERTICAL,
					paddingHorizontal: OCR_PADDING_HORIZONTAL
				}
			});
			await service.initialize();
			return service;
		})();
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

	/** What a sheet-feed scanner does to a page: a fraction of a degree of skew,
	 *  sensor noise, and JPEG. Without it the raster is a perfect render and the
	 *  measurement flatters both readings equally but neither honestly. */
	async function degradeScan(source: OffscreenCanvas): Promise<OffscreenCanvas> {
		const angle = (0.4 * Math.PI) / 180;
		const skewed = new OffscreenCanvas(source.width, source.height);
		const context = skewed.getContext('2d')!;
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, skewed.width, skewed.height);
		context.translate(skewed.width / 2, skewed.height / 2);
		context.rotate(angle);
		context.drawImage(source, -source.width / 2, -source.height / 2);
		context.setTransform(1, 0, 0, 1, 0, 0);

		const image = context.getImageData(0, 0, skewed.width, skewed.height);
		for (let index = 0; index < image.data.length; index += 4) {
			const noise = (Math.random() - 0.5) * 26;
			image.data[index] = Math.max(0, Math.min(255, image.data[index] + noise));
			image.data[index + 1] = Math.max(0, Math.min(255, image.data[index + 1] + noise));
			image.data[index + 2] = Math.max(0, Math.min(255, image.data[index + 2] + noise));
		}
		context.putImageData(image, 0, 0);

		const blob = await skewed.convertToBlob({ type: 'image/jpeg', quality: 0.62 });
		const bitmap = await createImageBitmap(blob);
		const out = new OffscreenCanvas(source.width, source.height);
		out.getContext('2d')!.drawImage(bitmap, 0, 0);
		bitmap.close();
		return out;
	}

	async function recognise(canvas: OffscreenCanvas) {
		const service = await getService();
		let result = await service.recognize(canvas as never, { flatten: false, noCache: true });
		if (shouldRetryOcr(result.confidence, 0)) {
			increaseContrast(canvas);
			const retry = await service.recognize(canvas as never, { flatten: false, noCache: true });
			if (retry.confidence > result.confidence) result = retry;
		}
		const lines = 'lines' in result ? (result.lines as { text: string; box: DOMRectInit }[][]) : [];
		return {
			text: (result.text ?? '').trim(),
			confidence: result.confidence,
			lines: lines.map((line) =>
				line.map((item) => ({
					text: item.text,
					box: item.box as { x: number; y: number; width: number; height: number }
				}))
			)
		};
	}

	async function evaluate(
		url: string,
		pages?: number[],
		options: { degrade?: 'none' | 'scan' } = {}
	): Promise<{ url: string; degrade: string; pages: PageReading[] }> {
		status = `loading ${url}`;
		const data = await (await fetch(url)).arrayBuffer();

		const pdfjs = await import('pdfjs-dist');
		pdfjs.GlobalWorkerOptions.workerSrc = (
			await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
		).default;

		// The document's own text layer, read by the shipped pipeline. It is the
		// reference both readings are scored against: not independent of
		// orderPdfText, but independent of everything under test here, and the
		// same reference for both.
		status = 'parsing native text';
		const parsed = await parsePdf(data);
		const nativeByPage: Record<number, string[]> = {};
		for (const block of [...parsed.blocks, ...(parsed.ocrFallbackBlocks ?? [])] as ParsedBlock[]) {
			if (block.page == null) continue;
			(nativeByPage[block.page] ??= []).push(block.text);
		}

		const loadingTask = pdfjs.getDocument({ data: data.slice(0), verbosity: 0 });
		const doc = await loadingTask.promise;
		const wanted = pages?.length
			? pages
			: Array.from({ length: doc.numPages }, (_, index) => index + 1);
		const out: PageReading[] = [];

		for (const [index, pageNum] of wanted.entries()) {
			status = `recognising page ${pageNum} (${index + 1}/${wanted.length}) of ${url}`;
			const started = performance.now();
			const page = await doc.getPage(pageNum);
			const viewport = page.getViewport({ scale: OCR_DPI_SCALE });
			let canvas = new OffscreenCanvas(
				Math.max(1, Math.ceil(viewport.width)),
				Math.max(1, Math.ceil(viewport.height))
			);
			const context = canvas.getContext('2d')!;
			context.fillStyle = '#ffffff';
			context.fillRect(0, 0, canvas.width, canvas.height);
			await page.render({ canvas, canvasContext: context, viewport } as never).promise;
			if (options.degrade === 'scan') canvas = await degradeScan(canvas);

			const result = await recognise(canvas);
			const positioned = positionedFromOcrLines(result.lines, {
				imageHeight: canvas.height,
				scale: OCR_DPI_SCALE
			});
			const ordered = positioned.length
				? orderPdfText(positioned, canvas.width / OCR_DPI_SCALE)
				: [];
			const blocks = ordered.length ? pageBlocks(ordered, pageNum) : [];

			out.push({
				page: pageNum,
				nativeText: (nativeByPage[pageNum] ?? []).join('\n'),
				naiveText: result.text,
				boxesText: blocks.map((block) => block.text).join('\n'),
				boxesRetrievalText: blocks
					.map((block) =>
						block.retrievalContext ? `${block.text}\t${block.retrievalContext}` : block.text
					)
					.join('\n'),
				blocks: blocks.length,
				headings: new Set(blocks.flatMap((block) => block.headingPath ?? [])).size,
				retrievalContexts: blocks.filter((block) => block.retrievalContext).length,
				confidence: result.confidence,
				recognisedLines: result.lines.length,
				ms: Math.round(performance.now() - started)
			});
			page.cleanup();
		}
		await loadingTask.destroy();
		status = `done: ${out.length} pages of ${url}`;
		return { url, degrade: options.degrade ?? 'none', pages: out };
	}

	/**
	 * The interleaving case, drawn rather than fetched.
	 *
	 * Two prose columns is the layout the recogniser's own line grouping reads
	 * straight across, and the one no document in the evaluation corpus
	 * exercises. Drawing it puts the real detector on real pixels — real box
	 * padding, real line grouping — which is what the un-padding and the
	 * coordinate conversion have to survive.
	 */
	async function twoColumn(dpi = 150) {
		const scale = dpi / 72;
		const width = Math.round(595 * scale);
		const height = Math.round(480 * scale);
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext('2d')!;
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, width, height);
		context.fillStyle = '#000000';
		context.font = `${Math.round(13 * scale)}px sans-serif`;
		const left = [
			'Le present contrat couvre',
			'les dommages causes par',
			'un incendie declare dans',
			'le logement assure et',
			'les frais de relogement'
		];
		const right = [
			'Sont exclus les dommages',
			'resultant dun defaut',
			'dentretien manifeste ou',
			'dune negligence grave',
			'du souscripteur assure'
		];
		for (let index = 0; index < left.length; index++) {
			context.fillText(left[index], 40 * scale, (70 + index * 34) * scale);
			context.fillText(right[index], 320 * scale, (70 + index * 34) * scale);
		}

		status = 'recognising the two-column page';
		const started = performance.now();
		const result = await recognise(canvas);
		const items = positionedFromOcrLines(result.lines, { imageHeight: height, scale });
		const ordered = orderPdfText(items, width / scale).map((line) => line.text);
		status = 'done: two-column page';
		return {
			ms: Math.round(performance.now() - started),
			confidence: result.confidence,
			recognisedLines: result.lines.length,
			naive: result.text.split('\n'),
			boxes: ordered,
			firstLineBoxes: result.lines[0]?.map((item) => ({
				text: item.text,
				x: Math.round(item.box.x),
				y: Math.round(item.box.y),
				width: Math.round(item.box.width),
				height: Math.round(item.box.height)
			})),
			positioned: items.slice(0, 4).map((item) => ({
				text: item.text,
				x: +item.x.toFixed(1),
				y: +item.y.toFixed(1),
				width: +item.width.toFixed(1)
			}))
		};
	}

	/**
	 * The gap at which the detector stops merging two words into one box.
	 *
	 * The parser A/B simulates the recogniser's granularity on born-digital
	 * pages, and that simulation needs this number. Guessing it is what made the
	 * first measurement meaningless: half a line height was assumed, while the
	 * two-column page showed a 139pt gap surviving as two boxes. So it is
	 * measured — pairs of words at a widening gap, counting the boxes returned.
	 */
	async function calibrateMergeGap(dpi = 150) {
		const scale = dpi / 72;
		const gaps = [2, 4, 6, 8, 12, 16, 24, 40];
		const width = Math.round(595 * scale);
		const height = Math.round((40 + gaps.length * 34) * scale);
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext('2d')!;
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, width, height);
		context.fillStyle = '#000000';
		const fontSize = 13;
		context.font = `${Math.round(fontSize * scale)}px sans-serif`;
		const rows = gaps.map((gap, index) => {
			const y = (30 + index * 34) * scale;
			const leftText = `Libelle${index}`;
			context.fillText(leftText, 40 * scale, y);
			const leftWidth = context.measureText(leftText).width / scale;
			context.fillText(`${index}${index},00`, (40 + leftWidth + gap) * scale, y);
			return { gap, leftWidth: +leftWidth.toFixed(1) };
		});

		status = 'calibrating the detector merge gap';
		const result = await recognise(canvas);
		status = 'done: calibration';
		// One box per row means the gap was bridged; two means it held.
		return {
			confidence: result.confidence,
			rows,
			observed: result.lines.map((line) => ({
				boxes: line.length,
				text: line.map((item) => item.text).join(' | ')
			}))
		};
	}

	onMount(() => {
		Object.assign(globalThis, {
			ocrEval: evaluate,
			ocrTwoColumn: twoColumn,
			ocrCalibrate: calibrateMergeGap
		});
		status = 'ready';
	});
</script>

<p data-testid="ocr-eval-status">{status}</p>

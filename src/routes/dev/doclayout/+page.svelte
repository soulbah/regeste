<script lang="ts">
	// Is a document-structure VLM usable in this browser, on French?
	//
	// The August 2026 state-of-the-art review turned up granite-docling-258M:
	// Apache 2.0, 258M parameters, converts a page image straight to tagged
	// structure (page_footer, section_header, list nesting, tables). Its model
	// card says English only. Measured in node on the owner's own French
	// attestation, that is wrong in an interesting way — French TRANSCRIPTION is
	// good and French STRUCTURE is excellent, but the q4 decoder falls into a
	// degenerate loop, and the fp16/q4f16 exports cannot run on onnxruntime-node's
	// CPU at all. Both of those are browser questions, and this page is where they
	// get answered.
	//
	// What makes it worth the trouble: the tags are the things this codebase
	// currently detects with hand-written vocabularies. A legal footer arrives as
	// `page_footer` because it sits in the footer band, not because it contains
	// company-law nouns.
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';

	// pdf.js and transformers.js are imported inside `run` rather than at module
	// scope: this route is server-rendered like every other, and both packages
	// touch browser globals on import.
	async function browserDeps() {
		// Sequential and spelled exactly as `parse/pdf.ts` does it. Resolving the
		// `?url` module inside a Promise.all handed pdf.js something it rejected
		// with "Invalid `workerSrc` type", which is a confusing way to learn that
		// this import wants to be left alone.
		const pdfjs = await import('pdfjs-dist');
		// `?url` is honoured for `parse/pdf.ts` because that module is bundled into
		// a Web Worker. On a main-thread route the dev server hands back the actual
		// module instead, so `.default` is undefined and pdf.js rejects it with
		// "Invalid `workerSrc` type". A dev-only page can name the served path.
		pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
		const transformers = await import('@huggingface/transformers');
		return { pdfjs, ...transformers };
	}

	const MODEL = 'onnx-community/granite-docling-258M-ONNX';

	/** Rasterisation DPI. The recogniser path uses 300; the VLM is trained on
	 *  much smaller inputs and its processor rescales anyway, so paying for 300
	 *  DPI here buys nothing but memory. */
	const RENDER_SCALE = 200 / 72;

	// Measured on the owner's French attestation, WebGPU, Apple metal-3. The
	// labels record the verdict so nobody repeats the sweep:
	//
	//   q8/int8   correct, 20 s/page after a 43 s first load     <- the one to use
	//   fp32      correct, 19-36 s/page, largest download
	//   fp16      wall of "!!!!"
	//   q4f16     wall of "!!!!"
	//   q4        decode loop, one tag repeated to the token budget
	//
	// The two exclamation-mark failures are NOT a hardware limit — this adapter
	// reports `shader-f16` — and they are not specific to this model either. They
	// are a known overflow bug in ONNX Runtime's WebGPU fp16 path, filed against
	// unrelated models with the same signature: Gemma 3 emits repeated unused
	// tokens (onnxruntime#26732) and nanochat produces NaNs while CPU is fine
	// (onnxruntime#26367). So it is an upstream runtime bug that can be fixed
	// upstream, not a property of granite-docling, and fp16 on the wasm backend is
	// expected to work where WebGPU does not. int8 avoids the fp16 path entirely,
	// which is why it is the setting that works today.
	const PRECISIONS = [
		{ value: 'q8', label: 'int8 (correct, fastest correct)' },
		{ value: 'fp32', label: 'fp32 (correct, biggest)' },
		{ value: 'fp16', label: 'fp16 (bf16 range loss → "!!!!")' },
		{ value: 'q4f16', label: 'q4f16 (bf16 range loss → "!!!!")' },
		{ value: 'q4', label: 'q4 (decode loop)' }
	] as const;

	// Query parameters so a sweep can be driven from outside without clicking
	// through a portalled menu: ?src=…&precision=fp16&device=webgpu&run=1
	const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

	let source = $state(params.get('src') ?? '/dev/owner/attestation-p1.png');
	let pageNumber = $state(Number(params.get('page') ?? 1));
	let precision = $state<(typeof PRECISIONS)[number]['value']>(
		(params.get('precision') as (typeof PRECISIONS)[number]['value']) ?? 'q8'
	);
	let device = $state<'webgpu' | 'wasm'>((params.get('device') as 'webgpu' | 'wasm') ?? 'webgpu');
	let status = $state('');
	let output = $state('');
	let timings = $state<{ load: number; render: number; generate: number } | null>(null);
	let running = $state(false);
	let preview = $state<string | null>(null);

	const precisionLabel = $derived(
		PRECISIONS.find((entry) => entry.value === precision)?.label ?? precision
	);

	/**
	 * A decode loop, which is the failure mode that matters here.
	 *
	 * A small decoder that cannot end a page repeats one tag until it hits the
	 * token budget. Measured on the French attestation at q4: the same `Fax` text
	 * tag more than forty times. Detecting it structurally beats reading the
	 * output every run.
	 */
	function looped(text: string): boolean {
		const tags = text.match(/<(?:text|list_item)>[^<]*<\/(?:text|list_item)>/gu) ?? [];
		if (tags.length < 8) return false;
		const counts = new Map<string, number>();
		for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
		return [...counts.values()].some((count) => count >= 5);
	}

	/** The half under test: image in, tagged structure out. Shared by both source
	 *  kinds so a PNG and a rendered page are measured identically. */
	async function describe(image: unknown, render: number) {
		const { AutoProcessor, AutoModelForImageTextToText } = await browserDeps();
		status = `loading ${MODEL} at ${precision} on ${device}`;
		const loadStarted = performance.now();
		const processor = await AutoProcessor.from_pretrained(MODEL);
		// The three graphs quantize independently. Only the decoder is prone to the
		// loop, so the vision encoder can stay cheaper than the setting name
		// suggests without affecting the outcome under test.
		const model = await AutoModelForImageTextToText.from_pretrained(MODEL, {
			device,
			// The companion graphs stay fp32 unless the decoder is itself an fp16
			// export. granite-docling is trained in bfloat16, whose exponent range
			// fp16 does not have, so an fp16 graph overflows and the decoder emits
			// token 0 — a wall of exclamation marks. This GPU reports shader-f16, so
			// that failure is the export, not the hardware, and no GPU will fix it.
			// int8 keeps its scales in fp32 and is the one cheap export that can
			// sidestep the range loss.
			dtype: {
				embed_tokens: precision === 'fp16' || precision === 'q4f16' ? 'fp16' : 'fp32',
				vision_encoder: precision === 'fp16' || precision === 'q4f16' ? 'fp16' : 'fp32',
				decoder_model_merged: precision
			}
		});
		const load = performance.now() - loadStarted;

		status = 'generating';
		const messages = [
			{
				role: 'user',
				content: [{ type: 'image' }, { type: 'text', text: 'Convert this page to docling.' }]
			}
		];
		const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true });
		const inputs = await processor(prompt, image, { do_image_splitting: true });
		const generateStarted = performance.now();
		const generated = await model.generate({ ...inputs, max_new_tokens: 1800, do_sample: false });
		const generate = performance.now() - generateStarted;

		// Drop the prompt tokens: `generate` returns prompt + completion, and the
		// tags being judged are all in the completion.
		const completion = (
			generated as { slice: (...args: unknown[]) => Parameters<typeof processor.batch_decode>[0] }
		).slice(null, [inputs.input_ids.dims.at(-1), null]);
		output = (processor.batch_decode(completion, { skip_special_tokens: false }) as string[])[0] ?? '';
		timings = { load, render, generate };
		status = looped(output) ? `LOOPED at ${precision} — unusable` : `done at ${precision} on ${device}`;
		await model.dispose?.();
	}

	async function run() {
		running = true;
		output = '';
		timings = null;
		try {
			const { pdfjs, RawImage } = await browserDeps();
			const started = performance.now();
			// An image source skips rasterisation, which matters here for more than
			// convenience: this harness runs in a hidden preview pane, where a
			// main-thread `page.render` never completes because a hidden document
			// gets no animation frames — the same trap that froze scanned ingest
			// until rasterisation moved into a worker. The question under test is the
			// VLM, so handing it a PNG keeps the measurement honest and the page
			// simple. Rasterise with:
			//   .venv-marker/bin/python -c "import pypdfium2 as p; ..."
			if (/\.(?:png|jpe?g|webp)$/iu.test(source)) {
				status = `loading ${source}`;
				const blob = await (await fetch(source)).blob();
				preview = URL.createObjectURL(blob);
				await describe(await RawImage.fromBlob(blob), performance.now() - started);
				return;
			}
			status = `rendering ${source} page ${pageNumber}`;
			const data = await (await fetch(source)).arrayBuffer();
			const doc = await pdfjs.getDocument({ data: data.slice(0), verbosity: 0 }).promise;
			const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
			const viewport = page.getViewport({ scale: RENDER_SCALE });
			const canvas = new OffscreenCanvas(
				Math.max(1, Math.ceil(viewport.width)),
				Math.max(1, Math.ceil(viewport.height))
			);
			const context = canvas.getContext('2d')!;
			context.fillStyle = '#ffffff';
			context.fillRect(0, 0, canvas.width, canvas.height);
			await page.render({ canvas, canvasContext: context, viewport } as never).promise;
			const blob = await canvas.convertToBlob({ type: 'image/png' });
			preview = URL.createObjectURL(blob);
			await describe(await RawImage.fromBlob(blob), performance.now() - started);
		} catch (error) {
			status = `failed: ${(error as Error).message}`;
		} finally {
			running = false;
		}
	}

	$effect(() => {
		if (params.get('run') === '1' && !running && !output && !status) void run();
	});

	const tagCounts = $derived.by(() => {
		const tags = output.match(/<([a-z_0-9]+)>/gu) ?? [];
		const counts = new Map<string, number>();
		for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
		return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
	});
</script>

<div class="mx-auto max-w-5xl space-y-4 p-6">
	<div>
		<h1 class="font-display text-2xl">Document structure VLM</h1>
		<p class="text-muted-foreground text-sm">
			granite-docling-258M on a real page. The question is whether a precision cheap enough to ship
			still terminates on French.
		</p>
	</div>

	<div class="flex flex-wrap items-end gap-2">
		<label class="flex-1 basis-64 text-xs">
			<span class="text-muted-foreground">Document</span>
			<Input bind:value={source} class="mt-1 h-9" />
		</label>
		<label class="w-20 text-xs">
			<span class="text-muted-foreground">Page</span>
			<Input type="number" min="1" bind:value={pageNumber} class="mt-1 h-9" />
		</label>
		<Select.Root type="single" bind:value={precision}>
			<Select.Trigger class="h-9 w-56">{precisionLabel}</Select.Trigger>
			<Select.Content>
				{#each PRECISIONS as entry (entry.value)}
					<Select.Item value={entry.value}>{entry.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Select.Root type="single" bind:value={device}>
			<Select.Trigger class="h-9 w-28">{device}</Select.Trigger>
			<Select.Content>
				<Select.Item value="webgpu">webgpu</Select.Item>
				<Select.Item value="wasm">wasm</Select.Item>
			</Select.Content>
		</Select.Root>
		<Button onclick={run} disabled={running} class="h-9">{running ? 'Running…' : 'Run'}</Button>
	</div>

	{#if status}
		<p class="font-mono text-xs" class:text-destructive={/LOOPED|failed/.test(status)}>{status}</p>
	{/if}

	{#if timings}
		<p class="text-muted-foreground font-mono text-xs">
			render {Math.round(timings.render)} ms · load {(timings.load / 1000).toFixed(1)} s · generate
			{(timings.generate / 1000).toFixed(1)} s
		</p>
	{/if}

	{#if tagCounts.length}
		<div class="flex flex-wrap gap-1.5">
			{#each tagCounts as [tag, count] (tag)}
				<span class="bg-muted rounded-md px-2 py-0.5 font-mono text-[11px]">{tag} ×{count}</span>
			{/each}
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		{#if preview}
			<img src={preview} alt="rendered page" class="border-border w-full rounded-lg border" />
		{/if}
		{#if output}
			<pre
				class="border-border max-h-[70vh] overflow-auto rounded-lg border p-3 font-mono text-[11px] whitespace-pre-wrap">{output}</pre>
		{/if}
	</div>
</div>

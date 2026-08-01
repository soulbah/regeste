<script lang="ts">
	// The calibration instrument for spec 034: PP-DocLayout in THIS browser.
	//
	// Node numbers exist (0.9-1.0 s/page, footer at 0.95 on the attestation) but
	// the node runtime is onnxruntime-node; the app ships onnxruntime-web wasm,
	// and this session has twice watched a verdict flip with the runtime. The
	// spec's kill criterion lives here: detection over 3 s/page in the browser
	// and the architecture stops.
	//
	// Both measured settings are non-defaults and load-bearing: threshold 0.15
	// (the shipped 0.5 hides the footer entirely) and input size 800 (the model's
	// native size; anything else returns zero regions).
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';

	const params =
		typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

	// Through the /cdn proxy: media.githubusercontent.com is already on its
	// allow-list, and under cross-origin isolation a direct fetch would need CORP
	// headers GitHub does not promise.
	const MODEL_BASE =
		'/cdn/media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/layout';
	const MODELS = [
		{
			value: 'v2',
			label: 'PP-DocLayoutV2 (213 MB, the measured one)',
			file: 'PP-DocLayoutV2.onnx'
		},
		{ value: 'v3', label: 'PP-DocLayoutV3 (130 MB, masks)', file: 'PP-DocLayoutV3.onnx' }
	] as const;

	let source = $state(params.get('src') ?? '/dev/owner/attestation-p1.png');
	let modelKey = $state<'v2' | 'v3'>((params.get('model') as 'v2' | 'v3') ?? 'v2');
	let threshold = $state(Number(params.get('threshold') ?? 0.15));
	let status = $state('');
	let running = $state(false);
	let preview = $state<string | null>(null);
	let timings = $state<{ load: number; analyze: number } | null>(null);
	let regions = $state<Array<{ label: string; score: number; box: number[] }>>([]);

	const modelLabel = $derived(MODELS.find((m) => m.value === modelKey)?.label ?? modelKey);

	async function run() {
		running = true;
		regions = [];
		timings = null;
		try {
			status = `fetching ${source}`;
			const blob = await (await fetch(source)).blob();
			preview = URL.createObjectURL(blob);
			// Hand the service a canvas, never bytes: its ArrayBuffer path calls
			// prepareCanvas, which dynamic-imports "ppu-ocv/canvas" — the NODE entry,
			// wrapping @napi-rs/canvas — even from the /web build. A canvas input
			// skips that branch entirely (analyze: isCanvas ? image : prepareCanvas).
			const bitmap = await createImageBitmap(blob);
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
			bitmap.close();

			status = `loading ${modelLabel}`;
			const { DocLayoutService } = await import('ppu-doclayout/web');
			const loadStarted = performance.now();
			const service = new DocLayoutService({
				model: { model: `${MODEL_BASE}/${MODELS.find((m) => m.value === modelKey)!.file}` },
				detection: { threshold, modelInputSize: 800 },
				debugging: { debug: false, verbose: false }
			});
			await service.initialize();
			const load = performance.now() - loadStarted;

			status = 'analyzing';
			const analyzeStarted = performance.now();
			const result = (await service.analyze(canvas as never)) as {
				boxes: Array<{ label: string; score: number; box: number[] }>;
			};
			const analyze = performance.now() - analyzeStarted;

			regions = [...(result.boxes ?? [])].sort((a, b) => a.box[1] - b.box[1]);
			timings = { load, analyze };
			status = `done: ${regions.length} regions`;
			await service.destroy();
		} catch (error) {
			status = `failed: ${(error as Error).message}`;
		} finally {
			running = false;
		}
	}

	$effect(() => {
		if (params.get('run') === '1' && !running && !regions.length && !status) void run();
	});

	const counts = $derived.by(() => {
		const tally: Record<string, number> = {};
		for (const region of regions) tally[region.label] = (tally[region.label] ?? 0) + 1;
		return Object.entries(tally).sort((a, b) => b[1] - a[1]);
	});
</script>

<div class="mx-auto max-w-5xl space-y-4 p-6">
	<div>
		<h1 class="font-display text-2xl">Layout detection</h1>
		<p class="text-muted-foreground text-sm">
			PP-DocLayout in this browser, on this runtime. The 3 s/page kill criterion of spec 034 is
			decided on this page.
		</p>
	</div>

	<div class="flex flex-wrap items-end gap-2">
		<label class="flex-1 basis-64 text-xs">
			<span class="text-muted-foreground">Image</span>
			<Input bind:value={source} class="mt-1 h-9" />
		</label>
		<label class="w-24 text-xs">
			<span class="text-muted-foreground">Threshold</span>
			<Input
				type="number"
				step="0.05"
				min="0.05"
				max="0.9"
				bind:value={threshold}
				class="mt-1 h-9"
			/>
		</label>
		<Select.Root type="single" bind:value={modelKey}>
			<Select.Trigger class="h-9 w-72">{modelLabel}</Select.Trigger>
			<Select.Content>
				{#each MODELS as entry (entry.value)}
					<Select.Item value={entry.value}>{entry.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Button onclick={run} disabled={running} class="h-9">{running ? 'Running…' : 'Run'}</Button>
	</div>

	{#if status}
		<p class="font-mono text-xs" class:text-destructive={status.startsWith('failed')}>{status}</p>
	{/if}
	{#if timings}
		<p class="text-muted-foreground font-mono text-xs">
			load {(timings.load / 1000).toFixed(1)} s · analyze {(timings.analyze / 1000).toFixed(2)} s
		</p>
	{/if}

	{#if counts.length}
		<div class="flex flex-wrap gap-1.5">
			{#each counts as [label, count] (label)}
				<span class="bg-muted rounded-md px-2 py-0.5 font-mono text-[11px]">{label} ×{count}</span>
			{/each}
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		{#if preview}
			<img src={preview} alt="page under analysis" class="border-border w-full rounded-lg border" />
		{/if}
		{#if regions.length}
			<div
				class="border-border max-h-[70vh] overflow-auto rounded-lg border p-3 font-mono text-[11px]"
			>
				{#each regions as region, index (index)}
					<p>
						{region.label.padEnd(16, ' ')}
						{region.score.toFixed(2)} · y {Math.round(region.box[1])}–{Math.round(region.box[3])}
					</p>
				{/each}
			</div>
		{/if}
	</div>
</div>

<script lang="ts">
	// PDF viewer: renders one page at a time from the OPFS original via pdf.js
	// (its own worker, same as ingest). The cited passage is highlighted by
	// matching the chunk text against the page's text items (lib/viewer/match)
	// and overlaying rects computed from item transforms.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { t } from '$lib/i18n/index.svelte';
	import { readOriginal } from '$lib/opfs';
	import { findMatchRanges } from '$lib/viewer/match';
	import type { ViewerChunk } from '$lib/state/viewer.svelte';
	import type { LocalDocument } from '$lib/types';

	let { document: doc, chunk }: { document: LocalDocument; chunk: ViewerChunk | null } = $props();

	interface HighlightRect {
		left: number;
		top: number;
		width: number;
		height: number;
	}

	let status = $state<'loading' | 'ready' | 'missing'>('loading');
	let numPages = $state(0);
	// Set to the cited page once the document loads (component is keyed on the chunk).
	let pageNum = $state(1);
	let rendering = $state(false);
	let renderFailed = $state(false);
	let rects = $state<HighlightRect[]>([]);
	let pageSize = $state<{ width: number; height: number } | null>(null);
	let canvas = $state<HTMLCanvasElement | null>(null);
	let scroller = $state<HTMLElement | null>(null);
	let paneWidth = $state(0);

	// pdf.js objects are not reactive state.
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let pdfjs: any = null;
	let pdf: any = null;
	let loadingTask: any = null;
	let renderTask: any = null;
	let renderSeq = 0;
	let renderedFor = { page: 0, width: 0 };

	$effect(() => {
		let cancelled = false;
		(async () => {
			const data = await readOriginal(doc.hash);
			if (cancelled) return;
			if (!data) {
				status = 'missing';
				return;
			}
			pdfjs = await import('pdfjs-dist');
			const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
			pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
			// useSystemFonts: PDFs relying on the 14 standard fonts (no embed)
			// otherwise need standardFontDataUrl assets; without it the first
			// render can stall on a font fetch that never resolves.
			loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
			pdf = await loadingTask.promise;
			if (cancelled) return;
			numPages = pdf.numPages;
			pageNum = Math.min(Math.max(1, chunk?.page ?? 1), numPages);
			status = 'ready';
		})();
		return () => {
			cancelled = true;
			renderTask?.cancel();
			loadingTask?.destroy();
		};
	});

	// Render when the document is ready, the page changes, or the pane resizes.
	// (clientWidth binding arrives async, so the initial render waits for it.)
	$effect(() => {
		const width = paneWidth;
		const page = pageNum;
		if (status !== 'ready' || width <= 0 || !canvas) return;
		if (renderedFor.page === page && Math.abs(renderedFor.width - width) < 8) return;
		renderedFor = { page, width };
		void renderPage(page);
	});

	async function renderPage(n: number): Promise<void> {
		renderFailed = false;
		if (!pdf || !canvas) return;
		const seq = ++renderSeq;
		rendering = true;
		rects = [];
		try {
			const page = await pdf.getPage(n);
			if (seq !== renderSeq) return;
			const base = page.getViewport({ scale: 1 });
			const width = Math.max(paneWidth - 32, 200); // p-4 padding
			const scale = width / base.width;
			const viewport = page.getViewport({ scale });
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.floor(viewport.width * dpr);
			canvas.height = Math.floor(viewport.height * dpr);
			pageSize = { width: viewport.width, height: viewport.height };
			const ctx = canvas.getContext('2d')!;
			renderTask?.cancel();
			renderTask = page.render({
				canvasContext: ctx,
				viewport,
				transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
			});
			await renderTask.promise;
			if (seq !== renderSeq) return;

			if (chunk && chunk.page === n) {
				const content = await page.getTextContent();
				if (seq !== renderSeq) return;
				const items = content.items.filter((it: any) => 'str' in it);
				const ranges = findMatchRanges(
					items.map((it: any) => it.str),
					chunk.text
				);
				if (ranges.length) {
					const out: HighlightRect[] = [];
					for (const range of ranges)
						for (let i = range.start; i <= range.end; i++) {
							const item = items[i];
							if (!item.str.trim()) continue;
							const tx = pdfjs.Util.transform(viewport.transform, item.transform);
							const fontHeight = Math.hypot(tx[2], tx[3]);
							out.push({
								left: tx[4],
								top: tx[5] - fontHeight,
								width: item.width * viewport.scale,
								height: fontHeight * 1.15
							});
						}
					rects = out;
					// Bring the passage into view within the page scroller.
					const top = Math.min(...out.map((r) => r.top), Infinity);
					if (isFinite(top) && scroller) {
						scroller.scrollTo({ top: Math.max(0, top - 80), behavior: 'instant' });
					}
				}
			} else {
				scroller?.scrollTo({ top: 0 });
			}
		} catch (err: unknown) {
			if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
				console.error('[regeste] pdf render failed:', err);
				// A failed frame used to leave the previous page on the canvas and
				// nothing anywhere else: the one failure in this app that painted no
				// surface at all. The banner names it and offers the retry.
				if (seq === renderSeq) renderFailed = true;
			}
		} finally {
			if (seq === renderSeq) rendering = false;
		}
	}

	function go(delta: number): void {
		pageNum = Math.min(Math.max(1, pageNum + delta), numPages);
	}
</script>

{#if status === 'missing'}
	<div class="flex-1 space-y-3 overflow-y-auto p-4">
		<Badge variant="secondary" class="text-[10px]">{t('viewer.missing')}</Badge>
		<p class="text-muted-foreground text-xs">
			{t('viewer.missingPdfBody')}
		</p>
		{#if chunk}
			<div class="rounded-md border p-3">
				<p class="text-sm leading-relaxed whitespace-pre-wrap">{chunk.text}</p>
			</div>
		{/if}
	</div>
{:else}
	<div class="flex min-h-0 flex-1 flex-col" bind:clientWidth={paneWidth}>
		<div bind:this={scroller} class="relative min-h-0 flex-1 overflow-y-auto p-4">
			{#if status === 'loading'}
				<div class="space-y-2">
					<Skeleton class="h-4 w-2/3" />
					<Skeleton class="h-64 w-full" />
				</div>
			{/if}
			{#if renderFailed}
				<div
					class="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-md border p-3"
				>
					<p class="text-muted-foreground text-sm">{t('viewer.renderFailed')}</p>
					<Button variant="outline" size="sm" onclick={() => renderPage(pageNum)}>
						{t('notice.retry')}
					</Button>
				</div>
			{/if}
			<div class="relative" style:display={status === 'ready' ? 'block' : 'none'}>
				<canvas
					bind:this={canvas}
					class="rounded-sm border shadow-sm"
					style:width={pageSize ? `${pageSize.width}px` : 'auto'}
					style:height={pageSize ? `${pageSize.height}px` : 'auto'}
				></canvas>
				{#each rects as rect, i (i)}
					<div
						class="bg-highlight/25 pointer-events-none absolute rounded-[1px]"
						style:left={`${rect.left}px`}
						style:top={`${rect.top}px`}
						style:width={`${rect.width}px`}
						style:height={`${rect.height}px`}
					></div>
				{/each}
			</div>
		</div>
		{#if status === 'ready'}
			<div class="flex items-center justify-between border-t px-4 py-2">
				<Button
					variant="ghost"
					size="icon"
					class="size-7"
					disabled={pageNum <= 1 || rendering}
					onclick={() => go(-1)}
					aria-label={t('viewer.prevAria')}
				>
					<ChevronLeftIcon class="size-4" />
				</Button>
				<span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
					{t('viewer.pageOf', { n: pageNum, total: numPages })}
					{#if chunk?.page && chunk.page !== pageNum}
						· {t('viewer.citedPage', { n: chunk.page })}
					{/if}
				</span>
				<Button
					variant="ghost"
					size="icon"
					class="size-7"
					disabled={pageNum >= numPages || rendering}
					onclick={() => go(1)}
					aria-label={t('viewer.nextAria')}
				>
					<ChevronRightIcon class="size-4" />
				</Button>
			</div>
		{/if}
	</div>
{/if}

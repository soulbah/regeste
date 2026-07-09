<script lang="ts">
	// Text-format viewer (DOCX/MD/TXT): re-parses the OPFS original with the
	// same parser as ingest, so chunk char offsets land exactly on blocks.
	import { tick } from 'svelte';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Badge } from '$lib/components/ui/badge';
	import { t } from '$lib/i18n/index.svelte';
	import { readOriginal } from '$lib/opfs';
	import { parseByName } from '$lib/pipeline/parse';
	import type { ViewerChunk } from '$lib/state/viewer.svelte';
	import type { LocalDocument, ParsedBlock } from '$lib/types';

	let { document, chunk }: { document: LocalDocument; chunk: ViewerChunk | null } = $props();

	let blocks = $state<ParsedBlock[] | null>(null);
	let missingOriginal = $state(false);
	let container = $state<HTMLElement | null>(null);

	function isHighlighted(block: ParsedBlock): boolean {
		if (!chunk) return false;
		return block.charEnd > chunk.charStart && block.charStart < chunk.charEnd;
	}

	function breadcrumb(block: ParsedBlock, prev: ParsedBlock | undefined): string | null {
		const path = block.headingPath?.join(' › ') ?? null;
		const prevPath = prev?.headingPath?.join(' › ') ?? null;
		return path !== prevPath ? path : null;
	}

	$effect(() => {
		let cancelled = false;
		(async () => {
			const data = await readOriginal(document.hash);
			if (cancelled) return;
			if (!data) {
				missingOriginal = true;
				return;
			}
			try {
				const parsed = await parseByName(document.name, document.mime, data);
				if (cancelled) return;
				blocks = parsed.blocks;
				await tick();
				container
					?.querySelector('[data-highlight]')
					?.scrollIntoView({ block: 'center', behavior: 'instant' });
			} catch {
				if (!cancelled) missingOriginal = true;
			}
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

{#if missingOriginal}
	<div class="flex-1 space-y-3 overflow-y-auto p-4">
		<Badge variant="secondary" class="text-[10px]">{t('viewer.missing')}</Badge>
		<p class="text-muted-foreground text-xs">
			{t('viewer.missingBody')}
		</p>
		{#if chunk}
			<div class="rounded-md border p-3">
				<p class="text-sm leading-relaxed whitespace-pre-wrap">{chunk.text}</p>
			</div>
		{/if}
	</div>
{:else if !blocks}
	<div class="flex-1 space-y-2 p-4">
		<Skeleton class="h-4 w-2/3" />
		<Skeleton class="h-4 w-full" />
		<Skeleton class="h-4 w-1/2" />
	</div>
{:else}
	<ScrollArea class="min-h-0 flex-1">
		<div bind:this={container} class="space-y-3 p-4">
			{#each blocks as block, i (i)}
				{@const crumb = breadcrumb(block, blocks[i - 1])}
				{#if crumb}
					<p
						class="text-muted-foreground border-b pb-1 font-mono text-[10px] tracking-widest uppercase"
					>
						{crumb}
					</p>
				{/if}
				{#if isHighlighted(block)}
					<p
						data-highlight
						class="bg-highlight/15 ring-highlight/40 rounded-sm text-sm leading-relaxed whitespace-pre-wrap ring-1"
					>
						{block.text}
					</p>
				{:else}
					<p class="text-sm leading-relaxed whitespace-pre-wrap">{block.text}</p>
				{/if}
			{/each}
		</div>
	</ScrollArea>
{/if}

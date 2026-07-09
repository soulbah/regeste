<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { isWeakMatch } from '$lib/pipeline/relevance';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import type { SearchHit } from '$lib/types';

	let { content }: { content: string } = $props();

	const parsed = $derived.by(() => {
		try {
			return JSON.parse(content) as { hits: SearchHit[]; documentCount: number };
		} catch {
			return { hits: [], documentCount: 0 };
		}
	});

	function locator(hit: SearchHit): string {
		if (hit.page) return `page ${hit.page}`;
		if (hit.headingPath) return hit.headingPath;
		return '';
	}
</script>

<div class="space-y-2">
	<Badge variant="outline" class="font-mono text-[10px] tracking-wide uppercase">
		Retrieval preview — AI answers arrive with Private mode
	</Badge>
	{#if parsed.documentCount === 0}
		<p class="text-muted-foreground text-sm">
			No documents in this chat — attach one to search it. AI answers from general knowledge will
			arrive with the AI modes.
		</p>
	{:else if parsed.hits.length === 0}
		<p class="text-sm">I couldn't find enough information in the attached documents for this.</p>
	{:else}
		{#if isWeakMatch(parsed.hits)}
			<p class="text-muted-foreground text-xs">
				Weak matches — these passages barely relate to the question, an answer may be unreliable.
			</p>
		{/if}
		{#each parsed.hits.slice(0, 4) as hit (hit.chunkId)}
			<Button
				variant="ghost"
				class="bg-card hover:bg-accent/50 block h-auto w-full rounded-xl border px-4 py-2.5 text-left font-normal whitespace-normal shadow-sm"
				onclick={() => viewerStore.openHit(hit)}
				aria-label="Open {hit.documentName} at this passage"
			>
				<span class="text-muted-foreground mb-1 block font-mono text-[10px] uppercase">
					{hit.documentName}{locator(hit) ? ` · ${locator(hit)}` : ''}
				</span>
				<span class="block text-sm">
					{hit.text.slice(0, 320)}{hit.text.length > 320 ? '…' : ''}
				</span>
			</Button>
		{/each}
	{/if}
</div>

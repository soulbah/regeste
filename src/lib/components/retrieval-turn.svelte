<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';
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
		if (hit.page) return t('common.page', { n: hit.page });
		if (hit.headingPath) return hit.headingPath;
		return '';
	}
</script>

<div class="space-y-2">
	<Badge variant="secondary" class="text-[10px]">
		{t('retrieval.badge')}
	</Badge>
	{#if parsed.documentCount === 0}
		<p class="text-muted-foreground text-sm">
			{t('retrieval.noDocs')}
		</p>
	{:else if parsed.hits.length === 0}
		<p class="text-sm">{t('retrieval.noHits')}</p>
	{:else}
		{#if isWeakMatch(parsed.hits)}
			<p class="text-muted-foreground text-xs">
				{t('retrieval.weak')}
			</p>
		{/if}
		{#each parsed.hits.slice(0, 4) as hit (hit.chunkId)}
			<Button
				variant="ghost"
				class="bg-card hover:bg-muted/60 block h-auto w-full rounded-lg border px-4 py-2.5 text-left font-normal whitespace-normal shadow-xs"
				onclick={() => viewerStore.openHit(hit)}
				aria-label={t('retrieval.openAria', { name: hit.documentName })}
			>
				<span class="text-muted-foreground mb-1 block font-mono text-[10px]">
					{hit.documentName}{locator(hit) ? ` · ${locator(hit)}` : ''}
				</span>
				<span class="block text-sm">
					{hit.text.slice(0, 320)}{hit.text.length > 320 ? '…' : ''}
				</span>
			</Button>
		{/each}
	{/if}
</div>

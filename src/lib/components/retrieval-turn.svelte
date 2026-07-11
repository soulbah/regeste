<script lang="ts">
	// Retrieval preview turn (spec 009): shown when a question runs without an AI
	// mode. Reworked 2026-07 — a system notice (same voice as the chat's other
	// notices) frames it, and the matching passages read as answer-style source
	// chips (name + locator, the passage on hover, click opens the viewer) rather
	// than raw text blocks.
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import InfoIcon from '@lucide/svelte/icons/info';
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

	const notice = $derived(
		parsed.documentCount === 0
			? t('retrieval.noDocs')
			: parsed.hits.length === 0
				? t('retrieval.noHits')
				: t('retrieval.notice')
	);

	function locator(hit: SearchHit): string {
		if (hit.page) return t('common.page', { n: hit.page });
		if (hit.headingPath) return hit.headingPath;
		return '';
	}
</script>

<div class="space-y-2">
	<!-- Matching passages sit on top, as in a real answer where the sources
	     strip precedes the prose. Here the system notice below stands in for the
	     answer that Private mode would write. -->
	{#if parsed.hits.length}
		<div class="flex flex-wrap gap-1.5">
			{#each parsed.hits.slice(0, 6) as hit (hit.chunkId)}
				<Tooltip.Provider delayDuration={400}>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									size="xs"
									class="bg-card hover:border-ring/40 h-7 gap-1.5 rounded-lg px-2 font-normal normal-case"
									onclick={() => viewerStore.openHit(hit)}
									aria-label={t('retrieval.openAria', { name: hit.documentName })}
								>
									<span class="max-w-40 truncate">{hit.documentName}</span>
									{#if locator(hit)}
										<span class="text-muted-foreground max-w-28 truncate font-mono text-[10px]">
											{locator(hit)}
										</span>
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content class="max-w-72">
							<p class="text-xs opacity-80">
								{hit.text.slice(0, 200)}{hit.text.length > 200 ? '…' : ''}
							</p>
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			{/each}
		</div>
	{/if}

	<!-- System notice, same shape as the chat's other system messages. -->
	<div class="border-muted-foreground/30 flex items-start gap-2 border-l-2 py-1 pl-3">
		<InfoIcon class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
		<div class="space-y-1">
			<p class="text-muted-foreground text-sm">{notice}</p>
			{#if parsed.hits.length && isWeakMatch(parsed.hits)}
				<p class="text-muted-foreground/80 text-xs">{t('retrieval.weak')}</p>
			{/if}
		</div>
	</div>
</div>

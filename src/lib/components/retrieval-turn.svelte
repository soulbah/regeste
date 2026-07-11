<script lang="ts">
	// Retrieval preview turn (spec 009): shown when a question runs without a ready
	// AI mode. The matching passages read as answer-style source chips; the notice
	// below stands in for the answer and says WHY none was written, read from the
	// same readiness verdict the picker and settings use — so it never claims an
	// answer is "coming" when the mode needs setup or can't run at all.
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { t } from '$lib/i18n/index.svelte';
	import { isWeakMatch } from '$lib/pipeline/relevance';
	import { modeReadiness } from '$lib/state/mode-readiness.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import type { ChatMode, SearchHit } from '$lib/types';

	let {
		content,
		mode = null,
		privateOnly = false
	}: { content: string; mode?: ChatMode | null; privateOnly?: boolean } = $props();

	const parsed = $derived.by(() => {
		try {
			return JSON.parse(content) as { hits: SearchHit[]; documentCount: number };
		} catch {
			return { hits: [], documentCount: 0 };
		}
	});

	// Why no written answer, from the shared readiness source: still loading
	// (coming), needs a download / setup (your move), or blocked (won't run here).
	const reason = $derived.by(() => {
		if (!mode) return t('retrieval.reason.generic');
		const r = modeReadiness(mode, { privateOnly });
		switch (r.state) {
			case 'progress':
				return t('retrieval.reason.loading');
			case 'setup':
				return mode === 'private' ? t('retrieval.reason.download') : t('retrieval.reason.setup');
			case 'blocked':
				return r.blockedLine ?? t('retrieval.reason.generic');
			case 'ready':
				return t('retrieval.reason.ready');
		}
	});

	const notice = $derived(
		parsed.documentCount === 0
			? t('retrieval.noDocs')
			: parsed.hits.length === 0
				? t('retrieval.noHits')
				: reason
	);

	function locator(hit: SearchHit): string {
		if (hit.page) return t('common.page', { n: hit.page });
		if (hit.headingPath) return hit.headingPath;
		return '';
	}
</script>

<div class="space-y-2">
	<!-- Matching passages sit on top, as in a real answer where the sources
	     strip precedes the prose. The notice below stands in for the answer a
	     ready AI mode would write. -->
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

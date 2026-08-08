<script lang="ts">
	// The superscript citation marker, lifted verbatim from private-turn so the
	// markdown walker can emit it between text runs. A live Svelte component, not
	// HTML — which is why the answer can never be a sanitised {@html} blob.
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { t } from '$lib/i18n/index.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import type { CitationRow } from '$lib/local-db/worker';

	let { n, citations }: { n: number; citations: CitationRow[] } = $props();
	const cite = $derived(citations[n - 1]);
</script>

<Tooltip.Provider delayDuration={600}>
	<Tooltip.Root>
		<Tooltip.Trigger
			class="bg-accent text-accent-foreground focus-visible:ring-ring touch-target-inline mx-0.5 inline-flex h-4 min-w-4 cursor-pointer items-center justify-center rounded-[5px] px-1 align-super font-mono text-[10px] font-semibold focus-visible:ring-2 focus-visible:outline-none"
			onclick={() => cite && viewerStore.openCitation(cite)}
			aria-label={t('turn.openSourceAria', { n })}
		>
			{n}
		</Tooltip.Trigger>
		<!-- The base tooltip is an inline-flex row (label + kbd); this is a quote
		     card — force a stacked block: source header, excerpt below. -->
		<Tooltip.Content class="block w-80 max-w-80 p-0">
			{#if cite}
				<div
					class="border-border/60 flex items-baseline justify-between gap-3 border-b px-3 py-1.5"
				>
					<span class="min-w-0 truncate text-xs font-medium">{cite.documentName}</span>
					{#if cite.locator}
						<span class="shrink-0 font-mono text-[10px] opacity-60">{cite.locator}</span>
					{/if}
				</div>
				<p class="line-clamp-6 px-3 py-2 text-xs leading-relaxed opacity-80">{cite.snippet}</p>
			{/if}
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>

<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { SvelteSet } from 'svelte/reactivity';
	import type { CitationRow } from '$lib/local-db/worker';

	let { content, citations = [] }: { content: string; citations?: CitationRow[] } = $props();

	// Split "text [1] more [2]" into segments; markers become citation chips.
	const segments = $derived.by(() => {
		const out: Array<{ type: 'text'; value: string } | { type: 'cite'; n: number }> = [];
		let last = 0;
		for (const m of content.matchAll(/\[(\d{1,2})\]/g)) {
			if (m.index! > last) out.push({ type: 'text', value: content.slice(last, m.index) });
			out.push({ type: 'cite', n: Number(m[1]) });
			last = m.index! + m[0].length;
		}
		if (last < content.length) out.push({ type: 'text', value: content.slice(last) });
		return out;
	});

	const uniqueCitations = $derived.by(() => {
		const seen = new SvelteSet<string>();
		return citations.filter((c) => {
			const key = `${c.documentName}|${c.locator}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	});
</script>

<div class="space-y-3">
	<div class="flex items-center gap-2">
		<span class="bg-mode-private size-1.5 rounded-full"></span>
		<span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
			Folio · nothing left this device
		</span>
	</div>
	<p class="text-sm leading-relaxed whitespace-pre-wrap">
		{#each segments as segment, i (i)}
			{#if segment.type === 'text'}{segment.value}{:else}
				<Tooltip.Provider>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<sup {...props}>
									<Badge variant="secondary" class="px-1 py-0 font-mono text-[9px]">
										{segment.n}
									</Badge>
								</sup>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content class="max-w-72">
							{#if citations[segment.n - 1]}
								<p class="text-xs font-medium">
									{citations[segment.n - 1].documentName}{citations[segment.n - 1].locator
										? ` · ${citations[segment.n - 1].locator}`
										: ''}
								</p>
								<p class="mt-1 text-xs opacity-80">{citations[segment.n - 1].snippet}</p>
							{/if}
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			{/if}
		{/each}
	</p>
	{#if uniqueCitations.length}
		<div class="space-y-1 border-t pt-2">
			{#each uniqueCitations as c, i (i)}
				<p class="text-muted-foreground font-mono text-[10px]">
					{c.documentName}{c.locator ? ` · ${c.locator}` : ''}
				</p>
			{/each}
		</div>
	{/if}
</div>

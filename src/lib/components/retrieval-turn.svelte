<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
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
		{#each parsed.hits.slice(0, 4) as hit (hit.chunkId)}
			<Card.Root>
				<Card.Content class="py-2.5">
					<p class="text-muted-foreground mb-1 font-mono text-[10px] uppercase">
						{hit.documentName}{locator(hit) ? ` · ${locator(hit)}` : ''}
					</p>
					<p class="text-sm">{hit.text.slice(0, 320)}{hit.text.length > 320 ? '…' : ''}</p>
				</Card.Content>
			</Card.Root>
		{/each}
	{/if}
</div>

<script lang="ts">
	// Document viewer in the right contextual panel (spec 006): the citation
	// click-through target. Renders from OPFS + local DB only — no network.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import XIcon from '@lucide/svelte/icons/x';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PdfViewer from '$lib/components/pdf-viewer.svelte';
	import TextViewer from '$lib/components/text-viewer.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import { isPdf } from '$lib/pipeline/parse';

	const target = $derived(viewerStore.target);
	const snapshot = $derived(viewerStore.snapshot);

	const locator = $derived.by(() => {
		if (snapshot) return snapshot.locator;
		const chunk = target?.chunk;
		if (!chunk) return null;
		return chunk.page ? t('common.page', { n: chunk.page }) : chunk.headingPath;
	});
</script>

<div class="flex h-full flex-col">
	<div class="flex items-start justify-between gap-2 border-b p-4">
		<div class="min-w-0">
			<h2 class="font-display truncate text-lg tracking-tight">
				{snapshot?.documentName ?? target?.document.name ?? t('viewer.document')}
			</h2>
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				{locator ? `${locator} · ` : ''}{t('viewer.stored')}
			</p>
		</div>
		<Button
			variant="ghost"
			size="icon"
			class="size-7 shrink-0"
			onclick={() => viewerStore.close()}
			aria-label={t('viewer.closeAria')}
		>
			<XIcon class="size-4" />
		</Button>
	</div>

	{#if snapshot}
		<div class="flex-1 space-y-3 overflow-y-auto p-4">
			<Badge variant="secondary" class="text-[10px]">{t('viewer.removed')}</Badge>
			<p class="text-muted-foreground text-xs">
				{t('viewer.removedBody')}
			</p>
			<div class="rounded-md border p-3">
				<p
					class="text-muted-foreground mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase"
				>
					<FileTextIcon class="size-3" />
					{snapshot.documentName}{snapshot.locator ? ` · ${snapshot.locator}` : ''}
				</p>
				<p class="text-sm leading-relaxed">{snapshot.snippet}</p>
			</div>
		</div>
	{:else if target}
		{#if isPdf(target.document.name, target.document.mime)}
			{#key `${target.document.id}|${target.chunk?.charStart ?? -1}`}
				<PdfViewer document={target.document} chunk={target.chunk} />
			{/key}
		{:else}
			{#key `${target.document.id}|${target.chunk?.charStart ?? -1}`}
				<TextViewer document={target.document} chunk={target.chunk} />
			{/key}
		{/if}
	{/if}
</div>

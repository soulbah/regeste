<script lang="ts">
	// Pre-send review lives in the right contextual panel (FEATURES 5ter),
	// never a modal: the panel IS the trust surface.
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import PanelHeader from '$lib/components/panel-header.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { isWeakMatch } from '$lib/pipeline/relevance';
	import type { SearchHit } from '$lib/types';

	let { onhide = null }: { onhide?: (() => void) | null } = $props();

	const pending = $derived(chatsStore.pendingAssisted);
	const maxScore = $derived(Math.max(...(pending?.hits ?? []).map((h) => h.score), 0));

	let excluded = $state<Record<number, boolean>>({});

	$effect(() => {
		void pending?.question;
		excluded = {};
	});

	const selected = $derived((pending?.hits ?? []).filter((h) => !excluded[h.chunkId]));
	const bytes = $derived(
		selected.reduce((n, h) => n + new TextEncoder().encode(h.text).length, 0) +
			new TextEncoder().encode(pending?.question ?? '').length
	);

	function locator(hit: SearchHit): string {
		if (hit.page) return t('common.page', { n: hit.page });
		return hit.headingPath ?? '';
	}
</script>

<div class="flex h-full flex-col">
	<PanelHeader
		title={t('presend.title')}
		subtitle={t('presend.subtitle')}
		onback={() => chatsStore.cancelAssisted()}
		{onhide}
	/>

	<div class="border-b px-4 py-3">
		<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
			{t('presend.question')}
		</p>
		<p class="mt-1 text-sm italic">“{pending?.question}”</p>
	</div>

	<ScrollArea class="flex-1">
		<div class="space-y-2 p-3">
			<p class="text-muted-foreground px-1 font-mono text-[10px] tracking-widest uppercase">
				{t('presend.excerpts')}
			</p>
			{#if isWeakMatch(pending?.hits ?? [])}
				<p class="text-muted-foreground px-1 text-xs">
					{t('presend.weak')}
				</p>
			{/if}
			{#each pending?.hits ?? [] as hit (hit.chunkId)}
				<label
					class="hover:bg-muted/60 flex items-start gap-3 rounded-md border p-2.5 transition-colors {excluded[
						hit.chunkId
					]
						? 'opacity-40'
						: ''}"
				>
					<Checkbox
						checked={!excluded[hit.chunkId]}
						onCheckedChange={(v) => (excluded = { ...excluded, [hit.chunkId]: v !== true })}
						aria-label={t('presend.includeAria')}
					/>
					<span class="min-w-0">
						<span class="text-muted-foreground block font-mono text-[10px] uppercase">
							{hit.documentName}{locator(hit) ? ` · ${locator(hit)}` : ''}
							{#if maxScore > 0}
								· {t('presend.match', { pct: Math.round((hit.score / maxScore) * 100) })}
							{/if}
						</span>
						<span class="mt-0.5 block text-xs leading-relaxed">
							{hit.text.slice(0, 200)}{hit.text.length > 200 ? '…' : ''}
						</span>
					</span>
				</label>
			{/each}
		</div>
	</ScrollArea>

	<div class="space-y-3 border-t p-4">
		{#if !settingsStore.assistedConsented}
			<!-- R6: shown exactly once per device — the first time data would leave. -->
			<div class="space-y-2 rounded-md border p-3">
				<p class="text-sm font-medium">{t('presend.firstTime')}</p>
				<p class="text-muted-foreground text-xs">
					{t('presend.firstTimeBody')}
				</p>
				<Button variant="outline" size="sm" onclick={() => settingsStore.acknowledgeAssisted()}>
					{t('presend.consent')}
				</Button>
			</div>
		{/if}
		<div
			class="text-muted-foreground flex items-center justify-between font-mono text-[10px] tracking-widest uppercase"
		>
			<span>
				{t('presend.count', {
					selected: selected.length,
					total: pending?.hits.length ?? 0,
					kb: (bytes / 1024).toFixed(1)
				})}
			</span>
			<span class="flex items-center gap-1.5">
				<span class="bg-mode-assisted size-1.5 rounded-full"></span>
				<ArrowRightIcon class="size-3" />
				{t('common.cloudAi')}
			</span>
		</div>
		<p class="text-muted-foreground text-xs">
			{t('presend.footer')}
		</p>
		<div class="flex gap-2">
			<Button variant="outline" class="flex-1" onclick={() => chatsStore.cancelAssisted()}>
				{t('common.cancel')}
			</Button>
			<Button
				class="flex-1"
				disabled={selected.length === 0 || !settingsStore.assistedConsented}
				onclick={() => chatsStore.confirmAssisted(selected)}
			>
				{t('common.send')}
			</Button>
		</div>
	</div>
</div>

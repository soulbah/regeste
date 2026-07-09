<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import CheckIcon from '@lucide/svelte/icons/check';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import { SvelteSet } from 'svelte/reactivity';
	import { t } from '$lib/i18n/index.svelte';
	import type { CitationRow, MessageExcerptRow } from '$lib/local-db/worker';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';

	let {
		content,
		citations = [],
		mode = 'private',
		meta = null,
		onregenerate = null,
		messageId = null,
		excerpts = []
	}: {
		content: string;
		citations?: CitationRow[];
		mode?: 'private' | 'assisted' | 'myai';
		meta?: string | null;
		/** C2 — present on the last answer only. */
		onregenerate?: (() => void) | null;
		/** Spec 012 — enables the What-AI-saw click-through. */
		messageId?: string | null;
		excerpts?: MessageExcerptRow[];
	} = $props();

	/** Honest refusal: no citations but passages were retrieved → show them. */
	const closestSources = $derived(citations.length === 0 ? excerpts.slice(0, 3) : []);

	async function openExcerpt(e: MessageExcerptRow) {
		if (e.chunkId != null) {
			await viewerStore.openChunkId(e.chunkId);
			if (viewerStore.isOpen) return;
		}
		viewerStore.target = null;
		viewerStore.snapshot = { documentName: e.documentName, locator: e.locator, snippet: e.snippet };
	}

	let copied = $state(false);

	async function copy(withSources: boolean) {
		let text = content.replace(/\[(\d{1,2})\]/g, withSources ? '[$1]' : '');
		if (withSources && citations.length) {
			text +=
				'\n\nSources:\n' +
				citations
					.map((c, i) => `[${i + 1}] ${c.documentName}${c.locator ? ` · ${c.locator}` : ''}`)
					.join('\n');
		}
		await navigator.clipboard.writeText(text.trim());
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const dotClass = {
		private: 'bg-mode-private',
		assisted: 'bg-mode-assisted',
		myai: 'bg-mode-myai'
	} as const;

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
		<span class="size-1.5 rounded-full {dotClass[mode]}"></span>
		<span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
			{mode === 'private'
				? t('turn.nothingLeft')
				: (meta ?? (mode === 'assisted' ? t('turn.assisted') : t('turn.myai')))}
		</span>
	</div>
	<p
		class="text-sm leading-relaxed whitespace-pre-wrap {closestSources.length
			? 'text-muted-foreground italic'
			: ''}"
	>
		{#each segments as segment, i (i)}
			{#if segment.type === 'text'}{segment.value}{:else}
				<Tooltip.Provider>
					<Tooltip.Root>
						<Tooltip.Trigger
							class="cursor-pointer align-super"
							onclick={() => {
								const citation = citations[segment.n - 1];
								if (citation) viewerStore.openCitation(citation);
							}}
							aria-label="Open source {segment.n}"
						>
							<Badge variant="secondary" class="px-1 py-0 font-mono text-[9px]">
								{segment.n}
							</Badge>
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
	<div class="flex items-center gap-1">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="sm"
						class="text-muted-foreground h-6 gap-1 px-2 font-mono text-[10px] uppercase"
					>
						{#if copied}<CheckIcon class="size-3" /> {t('turn.copied')}{:else}<CopyIcon
								class="size-3"
							/>
							{t('turn.copy')}{/if}
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start">
				<DropdownMenu.Item onclick={() => copy(false)}>{t('turn.copyText')}</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => copy(true)} disabled={!citations.length}>
					{t('turn.copyWithSources')}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		{#if onregenerate}
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground h-6 gap-1 px-2 font-mono text-[10px] uppercase"
				onclick={onregenerate}
			>
				<RefreshCwIcon class="size-3" />
				{t('turn.regenerate')}
			</Button>
		{/if}
		{#if messageId}
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground h-6 gap-1 px-2 font-mono text-[10px] uppercase"
				onclick={() => chatsStore.openWhatAiSaw(messageId!)}
			>
				<EyeIcon class="size-3" />
				{t('turn.whatAiSaw')}
			</Button>
		{/if}
	</div>
	{#if uniqueCitations.length}
		<div class="space-y-0.5 border-t pt-2">
			{#each uniqueCitations as c, i (i)}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground block h-auto w-fit px-1 py-0.5 font-mono text-[10px] font-normal"
					onclick={() => viewerStore.openCitation(c)}
				>
					{c.documentName}{c.locator ? ` · ${c.locator}` : ''}
				</Button>
			{/each}
		</div>
	{:else if closestSources.length}
		<div class="space-y-0.5 border-t pt-2">
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				{t('turn.closest')}
			</p>
			{#each closestSources as e, i (i)}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground block h-auto w-fit px-1 py-0.5 font-mono text-[10px] font-normal"
					onclick={() => openExcerpt(e)}
				>
					{e.documentName}{e.locator ? ` · ${e.locator}` : ''}
				</Button>
			{/each}
		</div>
	{/if}
</div>

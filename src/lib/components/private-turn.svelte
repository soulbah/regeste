<script lang="ts">
	// AI answer turn (spec 019): sources strip above the prose (grounding shown
	// before reading), superscript citation chips with a hover preview, one
	// footer line (meta left, actions right). Refusals read as straight prose.
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import CheckIcon from '@lucide/svelte/icons/check';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { t } from '$lib/i18n/index.svelte';
	import type { CitationRow, MessageExcerptRow } from '$lib/local-db/worker';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { compactCitationMarkers } from '$lib/private-ai/prompt';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import WorkLedger from '$lib/components/work-ledger.svelte';
	import type { MethodSummary } from '$lib/types';

	let {
		content,
		citations = [],
		mode = 'private',
		meta = null,
		onregenerate = null,
		messageId = null,
		excerpts = [],
		versions = null,
		onswitchversion = null,
		method = null
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
		/** Spec 020 — ids of every version of this turn (oldest first). */
		versions?: string[] | null;
		onswitchversion?: ((id: string) => void) | null;
		method?: MethodSummary | null;
	} = $props();

	// Spec 020 — ‹ n/N › version nav (Try again keeps the previous answer).
	const versionIndex = $derived(versions && messageId ? versions.indexOf(messageId) : -1);
	const hasVersions = $derived(!!versions && versions.length > 1 && versionIndex >= 0);

	/** Honest refusal: no citations but passages were retrieved → show them. */
	const closestSources = $derived(citations.length === 0 ? excerpts.slice(0, 3) : []);
	const displayContent = $derived(compactCitationMarkers(content, citations.length));

	async function openExcerpt(e: MessageExcerptRow) {
		if (e.chunkId != null) {
			await viewerStore.openChunkId(e.chunkId);
			if (viewerStore.isOpen) return;
		}
		viewerStore.target = null;
		viewerStore.snapshot = { documentName: e.documentName, locator: e.locator, snippet: e.snippet };
	}

	let copied = $state(false);

	/** One-click copy, sources included when the answer has them. */
	async function copy() {
		let text = displayContent;
		if (citations.length) {
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

	// Split "text [1] more [2]" into segments; markers become citation chips.
	const segments = $derived.by(() => {
		const out: Array<{ type: 'text'; value: string } | { type: 'cite'; n: number }> = [];
		let last = 0;
		for (const m of displayContent.matchAll(/\[(\d{1,2})\]/g)) {
			if (m.index! > last) out.push({ type: 'text', value: displayContent.slice(last, m.index) });
			out.push({ type: 'cite', n: Number(m[1]) });
			last = m.index! + m[0].length;
		}
		if (last < displayContent.length) out.push({ type: 'text', value: displayContent.slice(last) });
		return out;
	});

	// Sources strip: 1:1 with chip numbers, capped at 3 + "+N" (Perplexity model).
	const STRIP_CAP = 3;
	let stripExpanded = $state(false);
	const stripSources = $derived(stripExpanded ? citations : citations.slice(0, STRIP_CAP));

	const modeLabel = { private: 'Private', assisted: 'Assisted', myai: 'My AI' } as const;
	const metaLine = $derived(
		mode === 'private'
			? t('turn.privateMeta', { count: excerpts.length, s: excerpts.length === 1 ? '' : 's' })
			: meta
				? `${modeLabel[mode]} · ${meta}`
				: modeLabel[mode]
	);
</script>

<div class="space-y-2">
	{#if method}<WorkLedger {method} />{/if}
	{#if citations.length}
		<div class="flex flex-wrap items-center gap-1.5">
			{#each stripSources as c, i (i)}
				<Button
					variant="outline"
					size="xs"
					class="bg-card hover:border-ring/40 h-7 gap-1.5 rounded-lg px-2 font-normal normal-case"
					onclick={() => viewerStore.openCitation(c)}
				>
					<span class="text-accent-foreground font-mono text-[10px] font-semibold">{i + 1}</span>
					<span class="max-w-40 truncate">{c.documentName}</span>
					{#if c.locator}
						<span class="text-muted-foreground max-w-28 truncate font-mono text-[10px]">
							{c.locator}
						</span>
					{/if}
				</Button>
			{/each}
			{#if citations.length > STRIP_CAP}
				<Button
					variant="outline"
					size="xs"
					class="bg-card hover:border-ring/40 text-muted-foreground h-7 rounded-lg px-2 font-mono text-[10px] font-normal"
					aria-expanded={stripExpanded}
					onclick={() => (stripExpanded = !stripExpanded)}
				>
					{stripExpanded
						? t('turn.sourcesLess')
						: t('turn.sourcesMore', { count: citations.length - STRIP_CAP })}
				</Button>
			{/if}
		</div>
	{/if}

	<p class="text-sm leading-relaxed whitespace-pre-wrap">
		{#each segments as segment, i (i)}
			{#if segment.type === 'text'}{segment.value}{:else}
				<Tooltip.Provider delayDuration={600}>
					<Tooltip.Root>
						<Tooltip.Trigger
							class="bg-accent text-accent-foreground focus-visible:ring-ring mx-0.5 inline-flex h-4 min-w-4 cursor-pointer items-center justify-center rounded-[5px] px-1 align-super font-mono text-[10px] font-semibold focus-visible:ring-2 focus-visible:outline-none"
							onclick={() => {
								const citation = citations[segment.n - 1];
								if (citation) viewerStore.openCitation(citation);
							}}
							aria-label={t('turn.openSourceAria', { n: segment.n })}
						>
							{segment.n}
						</Tooltip.Trigger>
						<!-- The base tooltip is an inline-flex row (label + kbd); this is a
						     quote card — force a stacked block: source header, excerpt below. -->
						<Tooltip.Content class="block w-80 max-w-80 p-0">
							{#if citations[segment.n - 1]}
								<div
									class="border-border/60 flex items-baseline justify-between gap-3 border-b px-3 py-1.5"
								>
									<span class="min-w-0 truncate text-xs font-medium">
										{citations[segment.n - 1].documentName}
									</span>
									{#if citations[segment.n - 1].locator}
										<span class="shrink-0 font-mono text-[10px] opacity-60">
											{citations[segment.n - 1].locator}
										</span>
									{/if}
								</div>
								<p class="line-clamp-6 px-3 py-2 text-xs leading-relaxed opacity-80">
									{citations[segment.n - 1].snippet}
								</p>
							{/if}
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			{/if}
		{/each}
	</p>

	{#if closestSources.length}
		<div class="space-y-0.5 border-t pt-2">
			<p class="text-muted-foreground text-xs">{t('turn.closest')}</p>
			{#each closestSources as e, i (i)}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground hover:text-foreground block h-auto w-fit px-1 py-0.5 font-mono text-[11px] font-normal"
					onclick={() => openExcerpt(e)}
				>
					{e.documentName}{e.locator ? ` · ${e.locator}` : ''}
				</Button>
			{/each}
		</div>
	{/if}

	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
		<span class="text-muted-foreground font-mono text-[10px]">{metaLine}</span>
		<span class="flex items-center gap-0.5">
			{#if hasVersions && versions && onswitchversion}
				<span class="text-muted-foreground mr-1 flex items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon-xs"
						class="text-muted-foreground size-6"
						disabled={versionIndex === 0}
						aria-label={t('turn.prevVersion')}
						onclick={() => onswitchversion(versions[versionIndex - 1])}
					>
						<ChevronLeftIcon />
					</Button>
					<span class="font-mono text-[10px] tabular-nums">
						{versionIndex + 1}/{versions.length}
					</span>
					<Button
						variant="ghost"
						size="icon-xs"
						class="text-muted-foreground size-6"
						disabled={versionIndex === versions.length - 1}
						aria-label={t('turn.nextVersion')}
						onclick={() => onswitchversion(versions[versionIndex + 1])}
					>
						<ChevronRightIcon />
					</Button>
				</span>
			{/if}
			<Tooltip.Provider delayDuration={400}>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-xs"
								class="text-muted-foreground size-7"
								onclick={copy}
								aria-label={t('turn.copyAria')}
							>
								{#if copied}<CheckIcon />{:else}<CopyIcon />{/if}
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{copied ? t('turn.copied') : t('turn.copy')}</Tooltip.Content>
				</Tooltip.Root>
				{#if onregenerate}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-xs"
									class="text-muted-foreground size-7"
									onclick={onregenerate}
									aria-label={t('turn.regenerate')}
								>
									<RefreshCwIcon />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{t('turn.regenerate')}</Tooltip.Content>
					</Tooltip.Root>
				{/if}
			</Tooltip.Provider>
			{#if messageId}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground h-7 gap-1.5 px-2 text-xs"
					onclick={() => chatsStore.openWhatAiSaw(messageId!)}
				>
					<EyeIcon class="size-3.5!" />
					{t('turn.whatAiSaw')}
				</Button>
			{/if}
		</span>
	</div>
</div>

<script lang="ts">
	// What AI saw (spec 012, PRD §4): per answer, exactly which passages the AI
	// received, what was excluded, the volume and the destination. Local data.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import XIcon from '@lucide/svelte/icons/x';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import type { MessageExcerptRow } from '$lib/local-db/worker';

	const messageId = $derived(chatsStore.waisMessageId);
	const message = $derived(chatsStore.messages.find((m) => m.id === messageId));
	const event = $derived(messageId ? chatsStore.privacyByMessage[messageId] : undefined);
	const excerpts = $derived(messageId ? (chatsStore.excerptsByMessage[messageId] ?? []) : []);
	const question = $derived.by(() => {
		if (!message) return null;
		const idx = chatsStore.messages.findIndex((m) => m.id === message.id);
		for (let i = idx - 1; i >= 0; i--) {
			if (chatsStore.messages[i].role === 'user') return chatsStore.messages[i].content;
		}
		return null;
	});

	const destinationLabel = $derived(
		!event
			? null
			: event.destination === 'device'
				? 'this device — nothing sent'
				: event.destination === 'cloud'
					? 'Cloud AI'
					: event.destination
	);

	function statusLabel(e: MessageExcerptRow): { label: string; dot: string } {
		if (e.excluded) return { label: 'Excluded by you', dot: 'bg-mode-private' };
		if (e.sent) return { label: 'Sent', dot: 'bg-mode-assisted' };
		return { label: 'Stayed on this device', dot: 'bg-mode-private' };
	}

	async function openExcerpt(e: MessageExcerptRow) {
		if (e.chunkId != null) {
			await viewerStore.openChunkId(e.chunkId);
			if (viewerStore.isOpen) {
				chatsStore.closeWhatAiSaw();
				return;
			}
		}
		viewerStore.target = null;
		viewerStore.snapshot = {
			documentName: e.documentName,
			locator: e.locator,
			snippet: e.snippet
		};
		chatsStore.closeWhatAiSaw();
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex items-start justify-between gap-2 border-b p-4">
		<div>
			<h2 class="font-display text-lg tracking-tight">What AI saw</h2>
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				For this answer · recorded locally
			</p>
		</div>
		<Button
			variant="ghost"
			size="icon"
			class="size-7 shrink-0"
			onclick={() => chatsStore.closeWhatAiSaw()}
			aria-label="Close panel"
		>
			<XIcon class="size-4" />
		</Button>
	</div>

	{#if question}
		<div class="border-b px-4 py-3">
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				Your question
			</p>
			<p class="mt-1 text-sm italic">“{question}”</p>
		</div>
	{/if}

	{#if event}
		<div class="border-b px-4 py-3">
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				Destination
			</p>
			<p class="mt-1 text-sm">
				{destinationLabel} · {event.excerptCount} excerpt{event.excerptCount === 1 ? '' : 's'} ·
				{event.destination === 'device'
					? '0 bytes sent'
					: `${(event.bytesSent / 1024).toFixed(1)} KB sent`}
			</p>
		</div>
	{/if}

	<ScrollArea class="min-h-0 flex-1">
		<div class="space-y-2 p-3">
			{#if excerpts.length === 0}
				<p class="text-muted-foreground p-2 text-sm">
					{event
						? event.excerptCount === 0
							? 'No document passages — only your question was involved.'
							: 'Passage details were not recorded for this older answer.'
						: 'Nothing recorded for this answer.'}
				</p>
			{:else}
				{#each excerpts as excerpt, i (i)}
					{@const status = statusLabel(excerpt)}
					<Button
						variant="ghost"
						class="block h-auto w-full rounded-md border p-2.5 text-left font-normal whitespace-normal {excerpt.excluded
							? 'opacity-50'
							: ''}"
						onclick={() => openExcerpt(excerpt)}
					>
						<span class="text-muted-foreground block font-mono text-[10px] uppercase">
							{excerpt.documentName}{excerpt.locator ? ` · ${excerpt.locator}` : ''}
						</span>
						<span class="mt-0.5 block text-xs leading-relaxed">
							{excerpt.snippet.slice(0, 180)}{excerpt.snippet.length > 180 ? '…' : ''}
						</span>
						<span class="mt-1.5 flex items-center gap-1.5">
							<span class="size-1.5 rounded-full {status.dot}"></span>
							<span class="text-muted-foreground font-mono text-[10px] uppercase">
								{status.label}
							</span>
						</span>
					</Button>
				{/each}
			{/if}
		</div>
	</ScrollArea>
	<div class="border-t p-3">
		<Badge variant="outline" class="gap-1 font-mono text-[10px] uppercase">
			Transparency, not magic — this list is the whole story
		</Badge>
	</div>
</div>

<script lang="ts">
	// Pre-send review lives in the right contextual panel (FEATURES 5ter),
	// never a modal: the panel IS the trust surface.
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { isWeakMatch } from '$lib/pipeline/relevance';
	import type { SearchHit } from '$lib/types';

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
		if (hit.page) return `page ${hit.page}`;
		return hit.headingPath ?? '';
	}
</script>

<div class="flex h-full flex-col">
	<div class="border-b p-4">
		<h2 class="font-display text-lg tracking-tight">Before it leaves</h2>
		<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
			Review what the AI will see
		</p>
	</div>

	<div class="border-b px-4 py-3">
		<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
			Your question
		</p>
		<p class="mt-1 text-sm italic">“{pending?.question}”</p>
	</div>

	<ScrollArea class="flex-1">
		<div class="space-y-2 p-3">
			<p class="text-muted-foreground px-1 font-mono text-[10px] tracking-widest uppercase">
				Excerpts found in your documents
			</p>
			{#if isWeakMatch(pending?.hits ?? [])}
				<p class="text-muted-foreground px-1 text-xs">
					Weak matches — these passages barely relate to the question, the answer may be unreliable.
				</p>
			{/if}
			{#each pending?.hits ?? [] as hit (hit.chunkId)}
				<label
					class="hover:bg-accent/50 flex items-start gap-3 rounded-md border p-2.5 transition-colors {excluded[
						hit.chunkId
					]
						? 'opacity-40'
						: ''}"
				>
					<Checkbox
						checked={!excluded[hit.chunkId]}
						onCheckedChange={(v) => (excluded = { ...excluded, [hit.chunkId]: v !== true })}
						aria-label="Include this excerpt"
					/>
					<span class="min-w-0">
						<span class="text-muted-foreground block font-mono text-[10px] uppercase">
							{hit.documentName}{locator(hit) ? ` · ${locator(hit)}` : ''}
							{#if maxScore > 0}
								· match {Math.round((hit.score / maxScore) * 100)}%
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
				<p class="text-sm font-medium">First time anything leaves this device</p>
				<p class="text-muted-foreground text-xs">
					Until now, everything happened locally. Sending this will transmit your question and the
					checked excerpts — nothing else, and never your files — to the Assisted service. It
					answers and forgets; nothing is stored or logged.
				</p>
				<Button variant="outline" size="sm" onclick={() => settingsStore.acknowledgeAssisted()}>
					I understand — continue
				</Button>
			</div>
		{/if}
		<div
			class="text-muted-foreground flex items-center justify-between font-mono text-[10px] tracking-widest uppercase"
		>
			<span
				>{selected.length}/{pending?.hits.length ?? 0} excerpts · {(bytes / 1024).toFixed(1)} KB</span
			>
			<span class="flex items-center gap-1.5">
				<span class="bg-mode-assisted size-1.5 rounded-full"></span>
				<ArrowRightIcon class="size-3" /> Cloud AI
			</span>
		</div>
		<p class="text-muted-foreground text-xs">
			Only the checked excerpts and your question are sent — never your full documents.
		</p>
		<div class="flex gap-2">
			<Button variant="outline" class="flex-1" onclick={() => chatsStore.cancelAssisted()}>
				Cancel
			</Button>
			<Button
				class="flex-1"
				disabled={selected.length === 0 || !settingsStore.assistedConsented}
				onclick={() => chatsStore.confirmAssisted(selected)}
			>
				Send
			</Button>
		</div>
	</div>
</div>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import ModeSelector from './mode-selector.svelte';
	import AddDocuments from './add-documents.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import type { ChatMode } from '$lib/types';

	let {
		mode,
		disabled = false,
		onsend,
		onmodeselect,
		onupload,
		onattach,
		libraryEmpty,
		myaiModel = null,
		onmyaimodel,
		privateOnly = false
	}: {
		mode: ChatMode;
		disabled?: boolean;
		onsend: (text: string) => void;
		onmodeselect: (mode: ChatMode) => void;
		onupload: (files: File[]) => void;
		onattach: (documentId: string) => void;
		libraryEmpty: boolean;
		myaiModel?: string | null;
		onmyaimodel?: (model: string) => void;
		privateOnly?: boolean;
	} = $props();

	let text = $state('');

	function submit() {
		const t = text.trim();
		if (!t || disabled) return;
		text = '';
		onsend(t);
	}

	// `#` inline picker (FEATURES: picker trombone + # inline).
	const hashMatch = $derived(/(^|\s)#([\p{L}\p{N} _.-]*)$/u.exec(text));
	const hashSuggestions = $derived.by(() => {
		if (!hashMatch) return [];
		const q = hashMatch[2].toLowerCase();
		return documentsStore.library
			.filter((d) => d.status === 'ready' && d.name.toLowerCase().includes(q))
			.slice(0, 5);
	});

	function pickHash(docId: string) {
		onattach(docId);
		text = text.replace(/(^|\s)#([\p{L}\p{N} _.-]*)$/u, '$1').trimEnd();
	}
</script>

<div class="bg-card relative mx-auto w-full max-w-2xl rounded-xl border p-3 shadow-sm">
	{#if hashSuggestions.length}
		<div
			class="bg-popover absolute -top-2 right-3 left-3 z-10 -translate-y-full rounded-md border p-1 shadow-md"
		>
			<p class="text-muted-foreground px-2 py-1 font-mono text-[10px] tracking-widest uppercase">
				Attach from your documents
			</p>
			{#each hashSuggestions as doc (doc.id)}
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-start gap-2 text-xs"
					onclick={() => pickHash(doc.id)}
				>
					<FileTextIcon class="size-3.5" />
					<span class="truncate">{doc.name}</span>
				</Button>
			{/each}
		</div>
	{/if}
	<Textarea
		bind:value={text}
		placeholder="Ask anything about your documents…"
		class="max-h-40 min-h-10 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0"
		onkeydown={(e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				submit();
			}
		}}
		onpaste={(e) => {
			// C7 — pasting a file attaches it like the paperclip.
			const files = Array.from(e.clipboardData?.files ?? []);
			if (files.length) {
				e.preventDefault();
				onupload(files);
			}
		}}
	/>
	<div class="mt-2 flex items-center gap-2">
		<AddDocuments {libraryEmpty} {onupload} {onattach} />
		<ModeSelector {mode} onselect={onmodeselect} {myaiModel} {onmyaimodel} {privateOnly} />
		<div class="flex-1"></div>
		<Button size="icon" class="rounded-full" onclick={submit} disabled={disabled || !text.trim()}>
			<ArrowUpIcon class="size-4" />
		</Button>
	</div>
</div>
<p class="text-muted-foreground mt-2 text-center font-mono text-[10px] tracking-widest uppercase">
	Answers cite your documents
</p>

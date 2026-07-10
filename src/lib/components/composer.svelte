<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import SquareIcon from '@lucide/svelte/icons/square';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import ModeSelector from './mode-selector.svelte';
	import AddDocuments from './add-documents.svelte';
	import { t } from '$lib/i18n/index.svelte';
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
		privateOnly = false,
		hasReadyDocs = false,
		generating = false,
		onstop = null,
		followUp = false,
		quote = null,
		onquoteused = null
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
		/** R3 — preset actions only make sense with something to act on. */
		hasReadyDocs?: boolean;
		/** While true the send button becomes Stop (same spot, spec 019). */
		generating?: boolean;
		onstop?: (() => void) | null;
		/** After the first exchange the placeholder invites a follow-up. */
		followUp?: boolean;
		/** Spec 020 — quote-reply: a selection arrives as a markdown quote. */
		quote?: string | null;
		onquoteused?: (() => void) | null;
	} = $props();

	let text = $state('');
	let textareaRef = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		if (!quote) return;
		const quoted = quote
			.split('\n')
			.map((l) => `> ${l}`)
			.join('\n');
		text = text ? `${quoted}\n\n${text}` : `${quoted}\n\n`;
		textareaRef?.focus();
		onquoteused?.();
	});

	function submit() {
		const trimmed = text.trim();
		if (!trimmed || disabled) return;
		text = '';
		onsend(trimmed);
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

<div class="bg-card relative mx-auto w-full max-w-2xl rounded-[18px] border p-3 shadow-sm">
	{#if hashSuggestions.length}
		<div
			class="bg-popover absolute -top-2 right-3 left-3 z-10 -translate-y-full rounded-md border p-1 shadow-md"
		>
			<p class="text-muted-foreground px-2 py-1 text-xs font-medium">
				{t('composer.attachFrom')}
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
		bind:ref={textareaRef}
		placeholder={t(followUp ? 'composer.followUp' : 'composer.placeholder')}
		class="max-h-40 min-h-8 resize-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0"
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
	<div class="mt-1 flex items-center gap-1">
		<AddDocuments
			{libraryEmpty}
			{onupload}
			{onattach}
			{hasReadyDocs}
			{disabled}
			onaction={(q) => !disabled && onsend(q)}
		/>
		<ModeSelector {mode} onselect={onmodeselect} {myaiModel} {onmyaimodel} {privateOnly} />
		<div class="flex-1"></div>
		{#if generating && onstop}
			<Button
				size="icon"
				class="bg-ring hover:bg-ring/90 text-background rounded-md"
				onclick={onstop}
				aria-label={t('chat.stop')}
			>
				<SquareIcon class="size-3.5 fill-current" />
			</Button>
		{:else}
			<Button
				size="icon"
				class="bg-ring hover:bg-ring/90 text-background rounded-md disabled:opacity-40"
				onclick={submit}
				disabled={disabled || !text.trim()}
				aria-label={t('composer.sendAria')}
			>
				<ArrowUpIcon class="size-4" />
			</Button>
		{/if}
	</div>
</div>
<div
	class="text-muted-foreground mx-auto mt-2 flex w-full max-w-2xl items-center justify-between px-3 font-mono text-[10px]"
>
	<span>{t('composer.footer')}</span>
	<span class="hidden sm:inline">{t('composer.enterHint')}</span>
</div>

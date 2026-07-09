<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ModeSelector from './mode-selector.svelte';
	import AddDocuments from './add-documents.svelte';
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
</script>

<div class="bg-card mx-auto w-full max-w-2xl rounded-xl border p-3 shadow-sm">
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

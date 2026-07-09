<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';

	let {
		libraryEmpty,
		onupload,
		onattach
	}: {
		libraryEmpty: boolean;
		onupload: (files: File[]) => void;
		onattach: (documentId: string) => void;
	} = $props();

	let open = $state(false);
	let picking = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	function pickFiles() {
		fileInput?.click();
		open = false;
	}
</script>

<input
	bind:this={fileInput}
	type="file"
	multiple
	accept=".pdf,.docx,.md,.markdown,.txt"
	class="hidden"
	onchange={(e) => {
		// Copy before resetting: input.files is live and value = '' empties it
		// out from under the async upload handler.
		const files = Array.from(e.currentTarget.files ?? []);
		e.currentTarget.value = '';
		if (files.length) onupload(files);
	}}
/>

{#if libraryEmpty}
	<!-- Adaptive popover (FEATURES 5bis): empty library → straight to upload. -->
	<Button variant="outline" size="sm" class="gap-2" onclick={pickFiles}>
		<PaperclipIcon class="size-3.5" />
		{t('addDocs.add')}
	</Button>
{:else}
	<Popover.Root bind:open onOpenChange={(o) => !o && (picking = false)}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="sm" class="gap-2">
					<PaperclipIcon class="size-3.5" />
					{t('addDocs.add')}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-80 p-2" align="start" side="top">
			{#if !picking}
				<p class="text-muted-foreground px-2 pb-2 font-mono text-xs tracking-wide uppercase">
					{t('addDocs.title')}
				</p>
				<div class="flex flex-col gap-1">
					<Button
						variant="ghost"
						class="h-auto justify-start gap-3 px-2 py-2 text-left"
						onclick={() => (picking = true)}
					>
						<span class="flex size-7 items-center justify-center rounded-md border">
							<FolderIcon class="size-3.5" />
						</span>
						<span>
							<span class="block text-sm font-medium">{t('addDocs.choose')}</span>
							<span class="text-muted-foreground block text-xs">
								{t('addDocs.chooseHint')}
							</span>
						</span>
					</Button>
					<Button
						variant="ghost"
						class="h-auto justify-start gap-3 px-2 py-2 text-left"
						onclick={pickFiles}
					>
						<span class="flex size-7 items-center justify-center rounded-md border">
							<UploadIcon class="size-3.5" />
						</span>
						<span>
							<span class="block text-sm font-medium">{t('addDocs.upload')}</span>
							<span class="text-muted-foreground block text-xs">
								{t('addDocs.uploadHint')}
							</span>
						</span>
					</Button>
				</div>
			{:else}
				<p class="text-muted-foreground px-2 pb-2 font-mono text-xs tracking-wide uppercase">
					{t('addDocs.fromWorkspace')}
				</p>
				<ScrollArea class="max-h-64">
					<div class="flex flex-col gap-1">
						{#each documentsStore.library as doc (doc.id)}
							<Button
								variant="ghost"
								class="h-auto justify-start gap-3 px-2 py-2 text-left"
								onclick={() => {
									onattach(doc.id);
									open = false;
									picking = false;
								}}
							>
								<FileTextIcon class="size-4 shrink-0" />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm">{doc.name}</span>
									<span class="text-muted-foreground block font-mono text-[10px] uppercase">
										{(doc.size / 1024).toFixed(0)} KB{doc.pages
											? ` · ${t('common.pages', { n: doc.pages })}`
											: ''}
									</span>
								</span>
							</Button>
						{/each}
					</div>
				</ScrollArea>
			{/if}
		</Popover.Content>
	</Popover.Root>
{/if}

<script lang="ts">
	// The composer's single + menu (spec 019): attach documents and preset
	// actions live behind one entry point, like the ChatGPT/Claude + button.
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Button } from '$lib/components/ui/button';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import { t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';

	let {
		libraryEmpty,
		onupload,
		onattach,
		hasReadyDocs = false,
		onaction = null,
		disabled = false
	}: {
		libraryEmpty: boolean;
		onupload: (files: File[]) => void;
		onattach: (documentId: string) => void;
		/** R3 — preset actions only make sense with something to act on. */
		hasReadyDocs?: boolean;
		onaction?: ((question: string) => void) | null;
		disabled?: boolean;
	} = $props();

	const presetActions = [
		{ label: 'actions.summarize', question: 'actions.summarize.q' },
		{ label: 'actions.dates', question: 'actions.dates.q' },
		{ label: 'actions.amounts', question: 'actions.amounts.q' },
		{ label: 'actions.obligations', question: 'actions.obligations.q' }
	] as const;

	let fileInput = $state<HTMLInputElement | null>(null);
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

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props: menuProps })}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props: tipProps })}
						<Button
							{...menuProps}
							{...tipProps}
							variant="ghost"
							size="icon-sm"
							class="text-muted-foreground"
							aria-label={t('addDocs.menuAria')}
						>
							<PlusIcon />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top">{t('addDocs.menuAria')}</Tooltip.Content>
			</Tooltip.Root>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" side="top" class="w-56">
		<DropdownMenu.Item onclick={() => fileInput?.click()}>
			<UploadIcon class="text-muted-foreground" />
			{t('addDocs.upload')}
		</DropdownMenu.Item>
		{#if !libraryEmpty}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<FolderIcon class="text-muted-foreground" />
					{t('addDocs.choose')}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="max-h-72 w-72 overflow-y-auto">
					{#each documentsStore.library as doc (doc.id)}
						<DropdownMenu.Item onclick={() => onattach(doc.id)}>
							<FileTextIcon class="text-muted-foreground shrink-0" />
							<span class="truncate">{doc.name}</span>
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		{/if}
		{#if hasReadyDocs && onaction}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<ListChecksIcon class="text-muted-foreground" />
					{t('actions.menu')}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="w-56">
					{#each presetActions as action (action.label)}
						<DropdownMenu.Item onclick={() => !disabled && onaction(t(action.question))}>
							{t(action.label)}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>

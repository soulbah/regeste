<script lang="ts">
	// Where a chat gets its documents from, on the home.
	//
	// Two paths, and they do not cost the same. A document already in the library
	// is parsed, chunked and indexed: attaching it is instant. A file from the
	// machine has to go through all of that first. So once anything is in the
	// library the ranked list comes first and the drop zone steps back, instead
	// of a full-width dashed rectangle asking for a file the user may already
	// have given us.
	//
	// With an empty library there is nothing to rank, and the drop zone is the
	// whole story.
	import { Button } from '$lib/components/ui/button';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FileUpIcon from '@lucide/svelte/icons/file-up';
	import DocumentPicker from '$lib/components/document-picker.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';

	let { onattach, onbrowse }: { onattach: (ids: string[]) => void; onbrowse: () => void } =
		$props();

	/** Only ready documents: attaching one that is still indexing would put the
	 * chat in a waiting state the user did not ask for. */
	const usable = $derived(documentsStore.library.filter((d) => d.status === 'ready'));
	const recent = $derived([...usable].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3));
	let pickerOpen = $state(false);
</script>

{#if usable.length === 0}
	<button
		type="button"
		onclick={onbrowse}
		class="group border-border bg-card/40 hover:border-accent-foreground/40 hover:bg-accent/25 focus-visible:ring-ring/50 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-8 py-14 transition-colors outline-none focus-visible:ring-2"
	>
		<span
			class="bg-background group-hover:text-accent-foreground flex size-14 items-center justify-center rounded-full border shadow-sm transition-colors"
		>
			<FileUpIcon
				class="text-muted-foreground group-hover:text-accent-foreground size-6 transition-colors"
			/>
		</span>
		<span class="text-base font-medium">{t('home.dropTitle')}</span>
		<span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
			{t('docsPage.types')}
		</span>
	</button>
{:else}
	<div class="space-y-3 text-left">
		<p class="text-muted-foreground/70 px-1 font-mono text-[10px] tracking-widest uppercase">
			{t('home.pickLead')}
		</p>
		<div class="space-y-1.5">
			{#each recent as doc (doc.id)}
				<Button
					variant="outline"
					class="h-auto w-full justify-start gap-2.5 px-3 py-2.5 font-normal"
					onclick={() => onattach([doc.id])}
				>
					<FileTextIcon class="text-muted-foreground size-4 shrink-0" />
					<span class="truncate">{doc.name}</span>
				</Button>
			{/each}
		</div>
		<div class="flex flex-wrap gap-2 pt-1">
			{#if usable.length > recent.length}
				<Button variant="ghost" size="sm" onclick={() => (pickerOpen = true)}>
					{t('home.pickAll', { count: usable.length })}
				</Button>
			{/if}
			<Button variant="ghost" size="sm" class="gap-1.5" onclick={onbrowse}>
				<FileUpIcon class="size-3.5!" />
				{t('home.addNew')}
			</Button>
		</div>
	</div>

	<DocumentPicker bind:open={pickerOpen} onpick={onattach} />
{/if}

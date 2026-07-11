<script lang="ts">
	// Searchable library picker (spec 019 add-flow): when the library outgrows an
	// inline submenu, "My documents" opens this instead — the ⌘K command surface,
	// scoped to the whole library, so a document is a keystroke away. Picking one
	// attaches it to the current chat and closes.
	import * as Command from '$lib/components/ui/command';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';

	let { open = $bindable(false), onpick }: { open?: boolean; onpick: (id: string) => void } =
		$props();

	function pick(id: string) {
		open = false;
		onpick(id);
	}

	function meta(name: string, pages: number | null): string {
		const dot = name.lastIndexOf('.');
		const ext = dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
		return pages ? `${ext} · ${t('common.pages', { n: pages })}` : ext;
	}
</script>

<Command.Dialog bind:open class="rounded-xl shadow-2xl sm:max-w-[520px]">
	<Command.Input placeholder={t('docs.searchLibrary')} class="h-12" />
	<Command.List class="max-h-[360px] p-2">
		<Command.Empty>{t('docsPage.noMatch')}</Command.Empty>
		{#each documentsStore.library as doc (doc.id)}
			<Command.Item value={`${doc.name} ${doc.id}`} onSelect={() => pick(doc.id)}>
				<FileTextIcon class="text-muted-foreground shrink-0" />
				<span class="min-w-0 flex-1">
					<span class="block truncate text-sm">{doc.name}</span>
					<span
						class="text-muted-foreground block truncate font-mono text-[10px] tracking-wide uppercase"
					>
						{meta(doc.name, doc.pages)}
					</span>
				</span>
			</Command.Item>
		{/each}
	</Command.List>
</Command.Dialog>

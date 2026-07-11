<script lang="ts">
	// Searchable multi-select library picker (spec 019 add-flow): once the library
	// outgrows an inline submenu, "My documents" opens this. Reuses the ⌘K command
	// surface (same search, same green keyboard-highlight) so it feels native, and
	// lets several documents be picked in one pass, then attached together.
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { SvelteSet } from 'svelte/reactivity';
	import { t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';

	let { open = $bindable(false), onpick }: { open?: boolean; onpick: (ids: string[]) => void } =
		$props();

	const selected = new SvelteSet<string>();

	// Start each session with a clean slate.
	$effect(() => {
		if (open) selected.clear();
	});

	function toggle(id: string) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}

	function confirm() {
		if (!selected.size) return;
		const ids = [...selected];
		open = false;
		onpick(ids);
	}

	function meta(name: string, pages: number | null): string {
		const dot = name.lastIndexOf('.');
		const ext = dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
		return pages ? `${ext} · ${t('common.pages', { n: pages })}` : ext;
	}
</script>

<!-- Centered (overriding the palette's top-third anchor): the library list can
     be long, and top-third left the dialog sagging near the bottom edge. -->
<Command.Dialog bind:open class="top-1/2 -translate-y-1/2 rounded-xl shadow-2xl sm:max-w-[640px]">
	<Command.Input placeholder={t('docs.searchLibrary')} class="h-14 text-[15px]" />
	<div class="bg-border h-px shrink-0"></div>
	<Command.List class="max-h-[50vh] p-2">
		<Command.Empty>{t('docsPage.noMatch')}</Command.Empty>
		{#each documentsStore.library as doc (doc.id)}
			<Command.Item
				value={`${doc.name} ${doc.id}`}
				onSelect={() => toggle(doc.id)}
				aria-label={t('docs.useAria', { name: doc.name })}
				class="data-selected:before:hidden"
			>
				<Checkbox
					checked={selected.has(doc.id)}
					tabindex={-1}
					aria-hidden="true"
					class="pointer-events-none"
				/>
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
	<div class="flex items-center justify-end gap-3 border-t px-3 py-2.5">
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button {...props} size="sm" disabled={selected.size === 0} onclick={confirm}>
						{selected.size === 0
							? t('docs.add')
							: t('docs.addCount', { count: selected.size, s: selected.size === 1 ? '' : 's' })}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			{#if selected.size === 0}
				<Tooltip.Content side="top">{t('disabled.selectDoc')}</Tooltip.Content>
			{/if}
		</Tooltip.Root>
	</div>
</Command.Dialog>

<script lang="ts">
	// ⌘K universal search (spec 008, FEATURES F1): chats + document content via
	// FTS5, plus the command registry. Local-only — zero network.
	import * as Command from '$lib/components/ui/command';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/index.svelte';
	import { getLocalDb } from '$lib/local-db/client';
	import type { SearchAllResult } from '$lib/local-db/worker';
	import { searchStore } from '$lib/state/search.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';

	let query = $state('');
	let results = $state<SearchAllResult>({ chats: [], documents: [] });

	let debounce: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const q = query.trim();
		if (debounce) clearTimeout(debounce);
		if (!q) {
			results = { chats: [], documents: [] };
			return;
		}
		debounce = setTimeout(async () => {
			const { db } = await getLocalDb();
			const r = await db.searchAll(q);
			// Only apply if the query hasn't moved on.
			if (q === query.trim()) results = r;
		}, 150);
	});

	$effect(() => {
		if (!searchStore.open) query = '';
	});

	function run(action: () => void) {
		searchStore.open = false;
		action();
	}
</script>

<Command.Dialog bind:open={searchStore.open} shouldFilter={false}>
	<Command.Input placeholder={t('palette.placeholder')} bind:value={query} />
	<Command.List>
		<Command.Empty>
			{query.trim() ? t('palette.noResults') : t('palette.hint')}
		</Command.Empty>
		{#if results.chats.length}
			<Command.Group heading={t('palette.chats')}>
				{#each results.chats as hit (hit.chatId)}
					<Command.Item
						value={`chat-${hit.chatId}`}
						onSelect={() => run(() => goto(resolve(`/chat/${hit.chatId}`)))}
					>
						<MessageSquareIcon class="size-4" />
						<span class="min-w-0">
							<span class="block truncate text-sm">{hit.title}</span>
							<span class="text-muted-foreground block truncate text-xs">{hit.snippet}</span>
						</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		{#if results.documents.length}
			<Command.Group heading={t('palette.documents')}>
				{#each results.documents as hit (hit.chunkId)}
					<Command.Item
						value={`doc-${hit.chunkId}`}
						onSelect={() => run(() => viewerStore.openChunkId(hit.chunkId))}
					>
						<FileTextIcon class="size-4" />
						<span class="min-w-0">
							<span class="block truncate text-sm">
								{hit.name}{hit.page
									? ` · ${t('common.page', { n: hit.page })}`
									: hit.headingPath
										? ` · ${hit.headingPath}`
										: ''}
							</span>
							<span class="text-muted-foreground block truncate text-xs">{hit.snippet}</span>
						</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		<Command.Group heading={t('palette.commands')}>
			<Command.Item value="cmd-new-chat" onSelect={() => run(() => goto(resolve('/')))}>
				<PlusIcon class="size-4" />
				{t('sidebar.newChat')}
			</Command.Item>
			<Command.Item value="cmd-documents" onSelect={() => run(() => goto(resolve('/documents')))}>
				<FolderIcon class="size-4" />
				{t('sidebar.documents')}
			</Command.Item>
			<Command.Item value="cmd-privacy" onSelect={() => run(() => goto(resolve('/privacy')))}>
				<ShieldIcon class="size-4" />
				{t('sidebar.privacyReport')}
			</Command.Item>
		</Command.Group>
	</Command.List>
</Command.Dialog>

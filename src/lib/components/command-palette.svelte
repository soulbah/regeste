<script lang="ts">
	// ⌘K universal search (spec 008 + 021): chats + document content via FTS5,
	// plus commands (navigation, theme, language, settings). Local-only.
	// Metrics follow the cmdk reference palettes: 640px dialog, tall bare input,
	// 44px rows, green accent bar on the selected row, kbd footer.
	import * as Command from '$lib/components/ui/command';
	import Kbd from '$lib/components/kbd.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { setMode } from 'mode-watcher';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import { getLocalDb } from '$lib/local-db/client';
	import type { SearchAllResult } from '$lib/local-db/worker';
	import { searchStore } from '$lib/state/search.svelte';
	import { uiStore } from '$lib/state/ui.svelte';
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

<Command.Dialog
	bind:open={searchStore.open}
	shouldFilter={false}
	class="rounded-xl shadow-2xl sm:max-w-[640px]"
>
	<Command.Input
		placeholder={t('palette.placeholder')}
		bind:value={query}
		class="h-14 text-[17px]"
	/>
	<Command.List class="max-h-[360px] p-2">
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
						<MessageSquareIcon class="text-muted-foreground" />
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
						<FileTextIcon class="text-muted-foreground" />
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
			<Command.Item value="cmd-new-chat" onSelect={() => run(() => goto(resolve('/chat')))}>
				<PlusIcon class="text-muted-foreground" />
				{t('sidebar.newChat')}
			</Command.Item>
			<Command.Item
				value="cmd-documents"
				onSelect={() => run(() => goto(resolve('/chat/documents')))}
			>
				<FolderIcon class="text-muted-foreground" />
				{t('sidebar.documents')}
			</Command.Item>
			<Command.Item value="cmd-settings" onSelect={() => run(() => uiStore.openSettings())}>
				<SettingsIcon class="text-muted-foreground" />
				{t('settings.title')}
			</Command.Item>
			<Command.Item value="cmd-privacy" onSelect={() => run(() => goto(resolve('/chat/privacy')))}>
				<ShieldIcon class="text-muted-foreground" />
				{t('sidebar.privacyReport')}
			</Command.Item>
			<Command.Item value="cmd-theme-light" onSelect={() => run(() => setMode('light'))}>
				<SunIcon class="text-muted-foreground" />
				{t('palette.themeLight')}
			</Command.Item>
			<Command.Item value="cmd-theme-dark" onSelect={() => run(() => setMode('dark'))}>
				<MoonIcon class="text-muted-foreground" />
				{t('palette.themeDark')}
			</Command.Item>
			<Command.Item value="cmd-theme-system" onSelect={() => run(() => setMode('system'))}>
				<MonitorIcon class="text-muted-foreground" />
				{t('palette.themeSystem')}
			</Command.Item>
			<Command.Item value="cmd-lang-en" onSelect={() => run(() => i18n.setLocale('en'))}>
				<LanguagesIcon class="text-muted-foreground" />
				{t('palette.langEn')}
			</Command.Item>
			<Command.Item value="cmd-lang-fr" onSelect={() => run(() => i18n.setLocale('fr'))}>
				<LanguagesIcon class="text-muted-foreground" />
				{t('palette.langFr')}
			</Command.Item>
		</Command.Group>
	</Command.List>
	<!-- The 40px kbd footer: the "product palette" tell (Raycast/Vercel). -->
	<div
		class="text-muted-foreground bg-muted/40 flex h-10 shrink-0 items-center justify-end gap-4 border-t px-4 text-xs"
	>
		<span class="flex items-center gap-1.5"><Kbd>↑↓</Kbd> {t('palette.navigate')}</span>
		<span class="flex items-center gap-1.5"><Kbd>↵</Kbd> {t('palette.open')}</span>
		<span class="flex items-center gap-1.5"><Kbd>esc</Kbd> {t('palette.close')}</span>
	</div>
</Command.Dialog>

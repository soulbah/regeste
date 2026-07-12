<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as Sheet from '$lib/components/ui/sheet';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import CommandPalette from '$lib/components/command-palette.svelte';
	import SettingsDialog from '$lib/components/settings-dialog.svelte';
	import ViewerPanel from '$lib/components/viewer-panel.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SvelteMap } from 'svelte/reactivity';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { searchStore } from '$lib/state/search.svelte';
	import { sessionStore } from '$lib/state/session.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import { panelStore } from '$lib/state/panel.svelte';

	let { children } = $props();

	// Outside a chat, the right pane doesn't exist: ⌘K document results open
	// the viewer in an overlay sheet instead.
	const onChatRoute = $derived(page.route.id === '/chat/[id]');

	// A second tab must fail loudly, not silently orphan the database (the OPFS
	// SAH pool is single-owner; the worker refuses with 'folio-db-busy').
	let dbBusyShown = false;
	function guardDb<T>(p: Promise<T>): Promise<T | void> {
		return p.catch((err) => {
			if (String(err).includes('folio-db-busy') && !dbBusyShown) {
				dbBusyShown = true;
				toast.error(t('app.dbBusy'), { duration: Number.POSITIVE_INFINITY });
				return;
			}
			throw err;
		});
	}

	$effect(() => {
		i18n.init();
		guardDb(documentsStore.init());
		guardDb(chatsStore.refresh());
		// Offline switch loads first so a forced-offline session never phones home.
		guardDb(settingsStore.init().then(() => sessionStore.refresh()));
	});

	// Feedback rules (FEATURES 5bis): ingestion state lives in the documents
	// panel; a toast only announces transitions the user might miss (the
	// document is not part of the chat currently on screen).
	const prevStatuses = new SvelteMap<string, string>();
	$effect(() => {
		const visibleIds = new Set(chatsStore.chatDocuments.map((d) => d.id));
		const onDocumentsPage = page.url.pathname === '/chat/documents';
		for (const doc of documentsStore.documents) {
			const prev = prevStatuses.get(doc.id);
			if (prev && prev !== doc.status && !visibleIds.has(doc.id) && !onDocumentsPage) {
				if (doc.status === 'ready') {
					toast.success(t('toast.ready', { name: doc.name }));
				} else if (doc.status === 'error') {
					toast.error(t('toast.failed', { name: doc.name }), {
						description:
							doc.error === 'scanned_pdf' ? t('toast.failedScanned') : t('toast.failedGeneric')
					});
				}
			}
			prevStatuses.set(doc.id, doc.status);
		}
	});

	// Keep the active chat's document panel live while ingestion progresses.
	$effect(() => {
		void documentsStore.documents;
		chatsStore.refreshChatDocuments();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<svelte:window
	onkeydown={(e) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			searchStore.toggle();
			return;
		}
		// C10 — ⇧⌘O new chat; "/" focuses the composer (outside inputs).
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
			e.preventDefault();
			goto(resolve('/chat'));
			return;
		}
		const target = e.target as HTMLElement;
		const typing =
			target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
		if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
			const composer = document.querySelector<HTMLTextAreaElement>('textarea');
			if (composer) {
				e.preventDefault();
				composer.focus();
			}
		}
	}}
/>

<ModeWatcher defaultMode="system" />
<Toaster position="bottom-right" />
<CommandPalette />
<SettingsDialog />

<Sheet.Root
	open={viewerStore.isOpen && !onChatRoute}
	onOpenChange={(o) => !o && viewerStore.close()}
>
	<Sheet.Content side="right" class="w-full gap-0 p-0 sm:max-w-md">
		<ViewerPanel />
	</Sheet.Content>
</Sheet.Root>

<Sidebar.Provider>
	<AppSidebar />
	<!-- When a route mounts a PanelShell (chat, documents…), the inset stops being
	     a card and becomes a transparent frame: the main content and the contextual
	     panel float as their own cards on the workspace. Other routes keep the card. -->
	<Sidebar.Inset
		class={panelStore.usingShell
			? 'md:overflow-visible md:bg-transparent md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:border-0 md:peer-data-[variant=inset]:shadow-none'
			: undefined}
	>
		{@render children()}
	</Sidebar.Inset>
</Sidebar.Provider>

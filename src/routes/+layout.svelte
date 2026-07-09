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
	import ViewerPanel from '$lib/components/viewer-panel.svelte';
	import { page } from '$app/state';
	import { SvelteMap } from 'svelte/reactivity';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { searchStore } from '$lib/state/search.svelte';
	import { sessionStore } from '$lib/state/session.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';

	let { children } = $props();

	// Outside a chat, the right pane doesn't exist: ⌘K document results open
	// the viewer in an overlay sheet instead.
	const onChatRoute = $derived(page.url.pathname.startsWith('/chat/'));

	$effect(() => {
		documentsStore.init();
		chatsStore.refresh();
		// Offline switch loads first so a forced-offline session never phones home.
		settingsStore.init().then(() => sessionStore.refresh());
	});

	// Feedback rules (FEATURES 5bis): ingestion state lives in the documents
	// panel; a toast only announces transitions the user might miss (the
	// document is not part of the chat currently on screen).
	const prevStatuses = new SvelteMap<string, string>();
	$effect(() => {
		const visibleIds = new Set(chatsStore.chatDocuments.map((d) => d.id));
		const onDocumentsPage = page.url.pathname === '/documents';
		for (const doc of documentsStore.documents) {
			const prev = prevStatuses.get(doc.id);
			if (prev && prev !== doc.status && !visibleIds.has(doc.id) && !onDocumentsPage) {
				if (doc.status === 'ready') {
					toast.success(`${doc.name} is ready`, {
						description: 'Indexed locally — your file never left this device.'
					});
				} else if (doc.status === 'error') {
					toast.error(`${doc.name} could not be indexed`, {
						description:
							doc.error === 'scanned_pdf'
								? 'No extractable text — OCR is not supported yet.'
								: 'Something went wrong while reading this file.'
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
		}
	}}
/>

<ModeWatcher defaultMode="dark" />
<Toaster position="bottom-right" />
<CommandPalette />

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
	<Sidebar.Inset>
		{@render children()}
	</Sidebar.Inset>
</Sidebar.Provider>

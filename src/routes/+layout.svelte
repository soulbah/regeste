<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { page } from '$app/state';
	import { SvelteMap } from 'svelte/reactivity';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { sessionStore } from '$lib/state/session.svelte';

	let { children } = $props();

	$effect(() => {
		documentsStore.init();
		chatsStore.refresh();
		sessionStore.refresh();
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

<ModeWatcher defaultMode="dark" />
<Toaster position="bottom-right" />

<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset>
		{@render children()}
	</Sidebar.Inset>
</Sidebar.Provider>

<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import CommandPalette from '$lib/components/command-palette.svelte';
	import SettingsDialog from '$lib/components/settings-dialog.svelte';
	import ViewerPanel from '$lib/components/viewer-panel.svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import UpdateBanner from '$lib/components/update-banner.svelte';
	import { isShellCache } from '$lib/pwa/cache-names';
	import { pwaStore } from '$lib/state/pwa.svelte';
	import { page } from '$app/state';
	import { dev } from '$app/environment';
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

	// On routes with a contextual panel (chat, documents), the viewer rides that
	// panel. Elsewhere the right pane doesn't exist, so ⌘K document results open
	// the viewer in this overlay sheet instead.

	// The viewer is summoned by a citation, a document row or a ⌘K hit — always
	// for the page the user is on. Leaving that page must drop it BEFORE the
	// next route renders: a stale viewer otherwise hijacks the next chat's
	// panel, and on shell-less routes it flashes into the overlay sheet while
	// the shell unmounts (afterNavigate would fire too late to prevent it).
	beforeNavigate((navigation) => {
		if (navigation.from?.url?.pathname !== navigation.to?.url?.pathname) viewerStore.close();
	});

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
		pwaStore.init();
		guardDb(documentsStore.init());
		guardDb(chatsStore.refresh());
		// Offline switch loads first so a forced-offline session never phones home.
		guardDb(settingsStore.init().then(() => sessionStore.refresh()));
	});

	// Spec 030 — the service worker hosts WebLLM AND caches the app shell, in
	// production only. Dev stays on a Dedicated Worker so HMR never competes with
	// a persistent Service Worker, and any worker left over from a previous
	// build on this localhost port is torn down below.
	$effect(() => {
		if (!('serviceWorker' in navigator)) return;
		if (dev) {
			void (async () => {
				for (const registration of await navigator.serviceWorker.getRegistrations()) {
					void registration.unregister();
				}
				// Only the shell caches: deleting the model caches would re-download
				// gigabytes on every dev boot.
				for (const name of await caches.keys()) {
					if (isShellCache(name)) void caches.delete(name);
				}
			})();
			return;
		}
		const register = () => {
			void navigator.serviceWorker
				.register('/service-worker.js')
				.then((registration) => pwaStore.watch(registration))
				.catch((err) => {
					console.warn('[folio] service worker unavailable:', err);
				});
		};
		if (document.readyState === 'complete') register();
		else window.addEventListener('load', register, { once: true });
	});

	// Storage persistence (spec 030): retry on every start. Chrome caches grants
	// but not denials, so this is cheap, and calling too early races the
	// installed-app registry and silently skips the installed-PWA grant path.
	$effect(() => {
		if (!browser) return;
		const timer = setTimeout(() => void pwaStore.ensurePersisted(), 3000);
		return () => clearTimeout(timer);
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
						description: t('toast.failedGeneric')
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
<UpdateBanner />

<Sheet.Root
	open={viewerStore.isOpen && !panelStore.usingShell}
	onOpenChange={(o) => !o && viewerStore.close()}
>
	<Sheet.Content side="right" class="w-full gap-0 p-0 sm:max-w-md">
		<!-- This sheet portals outside Sidebar.Provider (the app's Tooltip
		     provider); the panel header's tooltips need their own. -->
		<Tooltip.Provider delayDuration={300}>
			<ViewerPanel />
		</Tooltip.Provider>
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

<script lang="ts">
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { Toaster } from '$lib/components/ui/sonner';
	import { beforeNavigate, goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import UpdateBanner from '$lib/components/update-banner.svelte';
	import { isShellCache } from '$lib/pwa/cache-names';
	import { pwaStore } from '$lib/state/pwa.svelte';
	import WorkerFailureNotice from '$lib/components/worker-failure-notice.svelte';
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

	// Two ways the local database can refuse to open, and they need different
	// answers. A second tab is the app's own single-owner rule and closing the
	// other tab fixes it. Blocked storage is the browser refusing getDirectory
	// altogether — a private window, or content blocking set to strict — and no
	// amount of closing tabs helps. Reporting the second as the first is what
	// sent someone hunting for a tab that did not exist.
	let dbNoticeShown = false;
	function guardDb<T>(p: Promise<T>): Promise<T | void> {
		return p.catch((err) => {
			const text = String(err);
			const key = text.includes('regeste-db-blocked')
				? 'app.dbBlocked'
				: text.includes('regeste-db-busy')
					? 'app.dbBusy'
					: null;
			if (key && !dbNoticeShown) {
				dbNoticeShown = true;
				// The toast says what happened; the action opens the entry that says
				// what to change. A message with no way forward is the reason people
				// give up on a page like this one.
				toast.error(t(key), {
					duration: Number.POSITIVE_INFINITY,
					action: {
						label: t('app.whatToDo'),
						onClick: () =>
							goto(
								resolve('/help/[[topic]]', {
									topic: key === 'app.dbBlocked' ? 'storage-blocked' : 'two-tabs'
								})
							)
					}
				});
				return;
			}
			if (key) return;
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
					console.warn('[regeste] service worker unavailable:', err);
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

<!-- Global concerns only. The sidebar, palette, settings modal and viewer sheet
     belong to the (app) group: a sign-in screen must not carry the chrome of
     the application it is the door to. -->
<ModeWatcher defaultMode="system" />
<Toaster position="bottom-right" />
<UpdateBanner />
<WorkerFailureNotice />

{@render children()}

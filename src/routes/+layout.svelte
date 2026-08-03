<script lang="ts">
	import './layout.css';
	import { guidesHref } from '$lib/marketing-links.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { Toaster } from '$lib/components/ui/sonner';
	import { beforeNavigate, goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { openInNewTab } from '$lib/external-page';
	import { isMarketingPage } from '$lib/pwa/sw-routing';
	import { isShellCache } from '$lib/pwa/cache-names';
	import { pwaStore } from '$lib/state/pwa.svelte';
	import WorkerFailureNotice from '$lib/components/worker-failure-notice.svelte';
	import ReportProblemDialog from '$lib/components/report-problem-dialog.svelte';
	import { installErrorFunnel } from '$lib/error-funnel';
	import { uiStore } from '$lib/state/ui.svelte';
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
	import PanicWipeScreen from '$lib/components/panic-wipe-screen.svelte';
	import { panicWipeContext } from '$lib/panic-wipe';

	let { children } = $props();
	const wipeContext = browser
		? panicWipeContext(new URL(window.location.href))
		: { active: false, locale: 'en' as const };
	const panicWipe = wipeContext.active;
	if (panicWipe) i18n.locale = wipeContext.locale;

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

	// The last net: an uncaught exception or unhandled rejection must reach the
	// person, not only the console. Known failures have their own surfaces; this
	// catches the ones nothing anticipated.
	$effect(() => {
		if (browser && !panicWipe) installErrorFunnel();
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
							openInNewTab(guidesHref(key === 'app.dbBlocked' ? 'storage-blocked' : 'two-tabs'))
					}
				});
				return;
			}
			if (key) return;
			throw err;
		});
	}

	// No marketing page may touch the local database: a visitor reading a guide
	// has no reason to take the single-owner lock, and taking it would trip the
	// two-tabs guard on the app running in their other tab. Everything boots on
	// the first navigation into an app route instead.
	//
	// This used to test for '/' alone, which was right when the landing was the
	// only marketing page. how-it-works and the guides have joined it under
	// src/routes/(marketing), and they were booting the database to render prose.
	let dbBooted = false;
	$effect(() => {
		if (panicWipe) return;
		if (isMarketingPage(page.url.pathname)) {
			// No language detection here: the marketing pages carry their language in the
			// path and set it themselves before rendering. Guessing from navigator.language
			// on top of that flipped a French URL back to English the moment it hydrated,
			// so the server sent French and the reader got English, which undoes the point
			// of having the language in the URL at all.
			return;
		}
		if (dbBooted) return;
		dbBooted = true;
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
		if (panicWipe) return;
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

	// The document language follows the dictionary. app.html can only template one
	// value and the app never renders on a server, so a French reader had the whole
	// interface announced as English to a screen reader.
	$effect(() => {
		document.documentElement.lang = i18n.locale;
	});

	// Storage persistence (spec 030): retry on every start. Chrome caches grants
	// but not denials, so this is cheap, and calling too early races the
	// installed-app registry and silently skips the installed-PWA grant path.
	$effect(() => {
		if (!browser || panicWipe) return;
		const timer = setTimeout(() => void pwaStore.ensurePersisted(), 3000);
		return () => clearTimeout(timer);
	});

	// Feedback rules (FEATURES 5bis): ingestion state lives in the documents
	// panel; a toast only announces transitions the user might miss (the
	// document is not part of the chat currently on screen).
	const prevStatuses = new SvelteMap<string, string>();
	$effect(() => {
		if (panicWipe) return;
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
		if (panicWipe) return;
		void documentsStore.documents;
		chatsStore.refreshChatDocuments();
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (panicWipe) return;
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
{#if panicWipe}
	<PanicWipeScreen />
{:else}
	<ReportProblemDialog bind:open={uiStore.reportOpen} />
	<Toaster position="bottom-right" />
	<WorkerFailureNotice />

	{@render children()}
{/if}

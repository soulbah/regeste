<script lang="ts">
	// The application chrome: sidebar, command palette, settings modal, viewer
	// sheet.
	//
	// It used to live in the root layout, which meant every route in the project
	// inherited it, sign-in included. A sign-in screen with the app's sidebar
	// behind it offers a dozen things you cannot do until you finish signing in,
	// so the chrome moved down here into a route group. The group's parentheses
	// keep it out of the URL: /chat is still /chat.
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import { afterNavigate, beforeNavigate, goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Toaster } from '$lib/components/ui/sonner';
	import { browser } from '$app/environment';
	import { openInNewTab } from '$lib/external-page';
	import { guidesHref } from '$lib/marketing-links.svelte';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import { panelStore } from '$lib/state/panel.svelte';
	import { registerAdvisories } from '$lib/state/register-advisories.svelte';
	import WorkerFailureNotice from '$lib/components/worker-failure-notice.svelte';
	import ReportProblemDialog from '$lib/components/report-problem-dialog.svelte';
	import { uiStore } from '$lib/state/ui.svelte';
	import { page } from '$app/state';
	import { SvelteMap } from 'svelte/reactivity';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { searchStore } from '$lib/state/search.svelte';
	import { sessionStore } from '$lib/state/session.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { pwaStore } from '$lib/state/pwa.svelte';
	import PanicWipeScreen from '$lib/components/panic-wipe-screen.svelte';
	import { panicWipeContext } from '$lib/panic-wipe';

	// Dialogs and the viewer ride heavy module graphs (command search opens the
	// database, settings loads the model stores, the viewer loads the document
	// renderer). They are hidden at boot, so they are fetched after first paint
	// and mounted on demand: the app shell no longer parses code it will not
	// show for seconds.
	let Palette: Component | undefined = $state();
	let Settings: Component | undefined = $state();
	let Viewer: Component | undefined = $state();
	let StorageRisk: Component | undefined = $state();
	let heavyKicked = false;
	function kickHeavy() {
		if (heavyKicked) return;
		heavyKicked = true;
		void import('$lib/components/command-palette.svelte').then((m) => (Palette = m.default));
		void import('$lib/components/settings-dialog.svelte').then((m) => (Settings = m.default));
		void import('$lib/components/viewer-panel.svelte').then((m) => (Viewer = m.default));
		void import('$lib/components/storage-risk-dialog.svelte').then(
			(m) => (StorageRisk = m.default)
		);
	}
	onMount(() => {
		// Parse them after the first paint window (LCP), or at the first gesture
		// — parsing them during the initial render would delay the very paint
		// they were moved out of the way of.
		const timer = setTimeout(kickHeavy, 2500);
		window.addEventListener('pointerdown', kickHeavy, { once: true, passive: true });
		window.addEventListener('keydown', kickHeavy, { once: true, passive: true });
		return () => {
			clearTimeout(timer);
			window.removeEventListener('pointerdown', kickHeavy);
			window.removeEventListener('keydown', kickHeavy);
		};
	});

	let { children } = $props();

	registerAdvisories();

	// The isolated wipe boot must restart the runtime once so no closed database
	// or terminated worker remains mounted. Confirm that restart in plain sight,
	// preserve the chosen language, then remove the one-shot URL marker without
	// another navigation.
	const wipeContext = browser
		? panicWipeContext(new URL(window.location.href))
		: { active: false, complete: false, locale: 'en' as const };
	const panicWipe = wipeContext.active;
	if (panicWipe || wipeContext.complete) i18n.locale = wipeContext.locale;

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
							openInNewTab(guidesHref(key === 'app.dbBlocked' ? 'storage-blocked' : 'two-tabs'))
					}
				});
				return;
			}
			if (key) return;
			throw err;
		});
	}

	// Everything boots here, on the first app route: the local database, the
	// stores and the PWA plumbing. Marketing pages never touch the database — a
	// visitor reading a guide has no reason to take the single-owner lock, and
	// taking it would trip the two-tabs guard on the app running in their other
	// tab.
	let dbBooted = false;
	$effect(() => {
		if (panicWipe) return;
		if (dbBooted) return;
		dbBooted = true;
		i18n.init(wipeContext.complete ? wipeContext.locale : undefined);
		pwaStore.init();
		guardDb(documentsStore.init());
		guardDb(chatsStore.refresh());
		// Offline switch loads first so a forced-offline session never phones home.
		guardDb(settingsStore.init().then(() => sessionStore.refresh()));
	});

	let wipeCompletionShown = false;
	afterNavigate(() => {
		if (!wipeContext.complete || wipeCompletionShown) return;
		wipeCompletionShown = true;
		toast.success(t('settings.wipe.complete'));
		replaceState(resolve('/chat'), {});
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

{#if panicWipe}
	<PanicWipeScreen />
{:else}
	{#if Palette}
		<Palette />
	{/if}
	{#if Settings}
		<Settings />
	{/if}

	{#if Viewer}
		<Sheet.Root
			open={viewerStore.isOpen && !panelStore.usingShell}
			onOpenChange={(o) => !o && viewerStore.close()}
		>
			<Sheet.Content side="right" class="w-full gap-0 p-0 sm:max-w-md">
				<!-- This sheet portals outside Sidebar.Provider (the app's Tooltip
				     provider); the panel header's tooltips need their own. -->
				<Tooltip.Provider delayDuration={300}>
					<Viewer />
				</Tooltip.Provider>
			</Sheet.Content>
		</Sheet.Root>
	{/if}

	<Sidebar.Provider>
		<AppSidebar />
		<!-- When a route mounts a PanelShell (chat, documents…), the inset stops
		     being a card and becomes a transparent frame: the main content and the
		     contextual panel float as their own cards on the workspace. Other
		     routes keep the card. -->
		<Sidebar.Inset
			class={panelStore.usingShell
				? 'md:overflow-visible md:bg-transparent md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:border-0 md:peer-data-[variant=inset]:shadow-none'
				: undefined}
		>
			{@render children()}
		</Sidebar.Inset>
	</Sidebar.Provider>

	{#if StorageRisk}
		<StorageRisk />
	{/if}
	<ReportProblemDialog bind:open={uiStore.reportOpen} />
	<Toaster position="bottom-right" />
	<WorkerFailureNotice />
{/if}

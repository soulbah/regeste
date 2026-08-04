<script lang="ts">
	// Root layout: what every route shares — styles, theme, i18n document
	// language, the error funnel and the service worker. Everything heavier
	// (database, stores, toasts, keyboard shortcuts, wipe flow) lives in the
	// (app) group layout: a marketing visitor must not parse the chat pipeline.
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';
	import { browser } from '$app/environment';
	import { dev } from '$app/environment';
	import { isShellCache } from '$lib/pwa/cache-names';
	import { pwaStore } from '$lib/state/pwa.svelte';
	import { installErrorFunnel } from '$lib/error-funnel';
	import { i18n } from '$lib/i18n/index.svelte';

	let { children } = $props();

	// The last net: an uncaught exception or unhandled rejection must reach the
	// person, not only the console. Known failures have their own surfaces; this
	// catches the ones nothing anticipated.
	$effect(() => {
		if (browser) installErrorFunnel();
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

	// The document language follows the dictionary. app.html can only template one
	// value and the app never renders on a server, so a French reader had the whole
	// interface announced as English to a screen reader.
	$effect(() => {
		document.documentElement.lang = i18n.locale;
	});
</script>

<ModeWatcher defaultMode="system" />
{@render children()}

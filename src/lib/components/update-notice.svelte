<script lang="ts">
	// Spec 030 — an update that activated mid-session would tear a loaded model
	// out of an in-flight generation and leave the page importing chunk names the
	// deploy no longer serves, so it is never applied while anything long runs.
	// But a waiting worker that is never applied AT ALL is how a shell goes stale
	// for good: the next deploy purges the hashed chunks it still asks for, and
	// only a hard refresh recovers. So it also applies itself once the work is
	// done and the tab is hidden, where the reload is one nobody watches happen.
	import { Button } from '$lib/components/ui/button';
	import ArrowDownToLineIcon from '@lucide/svelte/icons/arrow-down-to-line';
	import { t } from '$lib/i18n/index.svelte';
	import { pwaStore } from '$lib/state/pwa.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { workerHealth } from '$lib/state/worker-health.svelte';

	const busy = $derived(
		llmStore.status === 'generating' ||
			llmStore.status === 'downloading' ||
			llmStore.status === 'loading' ||
			documentsStore.ingesting > 0
	);
	// A dead worker still owns the louder slot: both say Reload, and "a new
	// version is ready" is a poor answer to "search just stopped working".
	const show = $derived(pwaStore.updateReady && !busy && !workerHealth.failed);

	$effect(() => {
		if (!pwaStore.updateReady || busy) return;
		const applyWhenHidden = () => {
			if (document.visibilityState === 'hidden') pwaStore.applyUpdate();
		};
		applyWhenHidden();
		document.addEventListener('visibilitychange', applyWhenHidden);
		return () => document.removeEventListener('visibilitychange', applyWhenHidden);
	});
</script>

{#if show}
	<!-- In the sidebar's own footer, above the account row.
	     It used to be fixed at the top centre of the viewport, where it sat across
	     the header and covered the chat's title — and it rendered from the root
	     layout, so it also appeared on the landing, which can never go stale: the
	     shell cache only claims /chat (see $lib/pwa/sw-routing.ts), so only the app
	     has a shell to become stale. Here it is persistent chrome out of the
	     reading path, which is what the guidance asks for when a message must stay
	     until it is acted on rather than fade like a toast. -->
	<div
		class="update-notice border-accent-foreground/25 bg-accent-foreground/[0.06] mb-2 flex items-center gap-2.5 rounded-lg border px-2.5 py-2"
		role="status"
	>
		<ArrowDownToLineIcon class="text-accent-foreground size-3.5 shrink-0" />
		<p class="min-w-0 flex-1 text-xs leading-snug">{t('update.ready')}</p>
		<Button
			size="sm"
			variant="ghost"
			class="text-accent-foreground hover:text-accent-foreground h-7 shrink-0 px-2 text-xs"
			onclick={() => pwaStore.applyUpdate()}
		>
			{t('update.cta')}
		</Button>
	</div>
{/if}

<style>
	/* It appears without warning while someone is reading, so it rises in rather
	   than blinking into place. One short entrance earns a glance; in the sidebar
	   it no longer needs to travel far to be noticed. */
	.update-notice {
		animation: update-rise 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes update-rise {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.update-notice {
			animation: none;
		}
	}
</style>

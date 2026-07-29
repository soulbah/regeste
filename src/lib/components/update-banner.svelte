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
	// A dead worker owns the bottom slot: both cards sit at bottom-4 left-1/2 and
	// both say Reload, so side by side they read as one confused message, and
	// "a new version is ready" is a poor answer to "search just stopped working".
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
	<!-- Top centre, not bottom: at the bottom it sat over the composer and read
	     as a toast, which is what you show for something that can be missed.
	     A stale shell asks for chunks the next deploy stops serving, and only a
	     hard refresh recovers it, so this one has to be seen. It still blocks
	     nothing: the app keeps working behind it and it is dismissible by acting
	     on it. -->
	<div
		class="update-banner bg-card ring-accent-foreground/25 fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2.5 shadow-lg ring-1"
		role="status"
	>
		<span
			class="bg-accent-foreground/10 flex size-7 shrink-0 items-center justify-center rounded-full"
		>
			<ArrowDownToLineIcon class="text-accent-foreground size-3.5" />
		</span>
		<p class="text-sm">{t('update.ready')}</p>
		<Button size="sm" onclick={() => pwaStore.applyUpdate()}>{t('update.cta')}</Button>
	</div>
{/if}

<style>
	/* It appears without warning while someone is reading, so it drops in rather
	   than blinking into place: the movement is what gets noticed, and one short
	   entrance is enough to earn a glance without nagging. */
	.update-banner {
		animation: update-drop 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes update-drop {
		from {
			opacity: 0;
			transform: translate(-50%, -0.75rem);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.update-banner {
			animation: none;
		}
	}
</style>

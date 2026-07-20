<script lang="ts">
	// Spec 030 — an update that activated mid-session would tear a loaded model
	// out of an in-flight generation and leave the page importing chunk names the
	// deploy no longer serves, so it is never applied while anything long runs.
	// But a waiting worker that is never applied AT ALL is how a shell goes stale
	// for good: the next deploy purges the hashed chunks it still asks for, and
	// only a hard refresh recovers. So it also applies itself once the work is
	// done and the tab is hidden, where the reload is one nobody watches happen.
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';
	import { pwaStore } from '$lib/state/pwa.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';

	const busy = $derived(
		llmStore.status === 'generating' ||
			llmStore.status === 'downloading' ||
			llmStore.status === 'loading' ||
			documentsStore.ingesting > 0
	);
	const show = $derived(pwaStore.updateReady && !busy);

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
	<div
		class="bg-card fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-3 py-2 shadow-md"
		role="status"
	>
		<p class="text-xs">{t('update.ready')}</p>
		<Button size="sm" onclick={() => pwaStore.applyUpdate()}>{t('update.cta')}</Button>
	</div>
{/if}

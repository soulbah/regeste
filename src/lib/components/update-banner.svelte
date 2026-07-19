<script lang="ts">
	// Spec 030 — a waiting worker is never applied on its own: an update that
	// activated mid-session would tear a loaded model out of an in-flight
	// generation and leave the page importing chunk names the deploy no longer
	// serves. The user applies it, and only while nothing long is running.
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';
	import { pwaStore } from '$lib/state/pwa.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';

	const busy = $derived(
		llmStore.status === 'generating' ||
			llmStore.status === 'downloading' ||
			llmStore.status === 'loading' ||
			Object.keys(documentsStore.ingests).length > 0
	);
	const show = $derived(pwaStore.updateReady && !busy);
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

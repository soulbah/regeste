<script lang="ts">
	// Staged product states on the landing's shared fixture ($lib/landing-fixture)
	// so the sandbox and the landing can never drift apart. Dev-only.
	//
	// ?scene=answer | presend | mark, ?lang=fr | en pick what is on stage.
	import { page } from '$app/state';
	import PrivateTurn from '$lib/components/private-turn.svelte';
	import PresendPanel from '$lib/components/presend-panel.svelte';
	import BrandMark from '$lib/components/brand-mark.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { LANDING_FIXTURE } from '$lib/landing-fixture';
	import type { SearchHit } from '$lib/types';

	const scene = $derived(page.url.searchParams.get('scene') ?? 'answer');
	const lang = $derived(page.url.searchParams.get('lang') === 'en' ? 'en' : 'fr');
	const fix = $derived(LANDING_FIXTURE[lang]);

	$effect(() => {
		// The store's async init can land after us and restore a saved locale;
		// watching it keeps the stage on the requested language.
		if (i18n.locale !== lang) i18n.locale = lang;
	});

	// The pre-send panel reads the store; feed it the staged review.
	$effect(() => {
		if (scene !== 'presend') return;
		settingsStore.assistedConsented = true;
		chatsStore.pendingAssisted = {
			chatId: 'stage',
			question: fix.presendQ,
			hits: fix.presendHits.map((h, index): SearchHit => ({
				chunkId: index + 1,
				documentId: 'stage-doc',
				documentName: fix.doc,
				text: h.text,
				page: h.page,
				headingPath: h.heading,
				score: 0.84 - index * 0.13
			})),
			conversationContext: null,
			route: 'targeted'
		};
	});
</script>

<div class="bg-background min-h-svh p-10">
	{#if scene === 'answer'}
		<div id="stage" class="mx-auto max-w-3xl space-y-6 p-2">
			<div class="flex justify-end">
				<div class="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
					{fix.question}
				</div>
			</div>
			<PrivateTurn
				content={fix.answer}
				citations={fix.citations}
				excerpts={fix.excerpts}
				mode="private"
			/>
		</div>
	{:else if scene === 'presend'}
		<div id="stage" class="border-border bg-card mx-auto h-[560px] w-[400px] rounded-xl border">
			<PresendPanel />
		</div>
	{:else}
		<div id="stage" class="mx-auto w-fit"><BrandMark size={96} /></div>
	{/if}
</div>

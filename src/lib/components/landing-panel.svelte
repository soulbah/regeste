<script lang="ts">
	// Chapters 03 and 04, rendered live for the same reason the hero is.
	//
	// A still shipped at 2480 px measured ratio 1.01 on a retina display and
	// 0.67 on a DPR-3 phone — sharp only on exactly one class of screen, blurry
	// the moment anyone zooms. These two chapters show nothing but panels, and a
	// panel is DOM: rendering the app's own component is sharp everywhere, costs
	// no download, and cannot drift from the product.
	//
	// Only in-memory stores are seeded; the landing must never open the local
	// database. Inert, so no handler can fire and reach one.
	import PresendPanel from '$lib/components/presend-panel.svelte';
	import WhatAiSawPanel from '$lib/components/what-ai-saw-panel.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { LANDING_FIXTURE } from '$lib/landing-fixture';
	import type { SearchHit } from '$lib/types';

	let { kind }: { kind: 'review' | 'record' } = $props();

	const fix = $derived(LANDING_FIXTURE[i18n.locale]);

	// Seeded on every locale change, because the page applies ?lang= after mount.
	$effect(() => {
		const fixNow = fix;
		if (kind === 'review') {
			settingsStore.assistedConsented = true;
			chatsStore.pendingAssisted = {
				chatId: 'landing',
				question: fixNow.presendQ,
				hits: fixNow.presendHits.map((h, i): SearchHit => ({
					chunkId: i + 1,
					documentId: 'landing-doc',
					documentName: fixNow.doc,
					text: h.text,
					page: h.page,
					headingPath: h.heading,
					// Real relevance figures: the panel prints these as percentages.
					score: 0.036 - i * 0.012
				})),
				conversationContext: null,
				route: 'targeted'
			};
			return;
		}
		chatsStore.messages = [
			{ id: 'lp-q', role: 'user', mode: null, content: fixNow.presendQ, createdAt: 0 },
			{
				id: 'lp-a',
				role: 'assistant',
				mode: 'assisted',
				content: fixNow.subletAnswer,
				createdAt: 1
			}
		] as typeof chatsStore.messages;
		chatsStore.excerptsByMessage = {
			'lp-a': fixNow.presendHits.map((h, i) => ({
				messageId: 'lp-a',
				chunkId: null,
				sent: i !== 2,
				excluded: i === 2,
				snippet: h.text,
				documentName: fixNow.doc,
				locator: `p. ${h.page}`
			}))
		};
		chatsStore.privacyByMessage = {
			'lp-a': {
				messageId: 'lp-a',
				mode: 'assisted',
				destination: 'cloud',
				excerptCount: 2,
				bytesSent: 843
			}
		};
		chatsStore.waisMessageId = 'lp-a';
	});
</script>

<Tooltip.Provider delayDuration={300}>
	<div
		class="border-border bg-card mx-auto h-[600px] w-full max-w-md lg:h-[720px] overflow-hidden rounded-2xl border shadow-xl shadow-black/5"
		aria-hidden="true"
		inert
	>
		{#if kind === 'review'}
			<PresendPanel onhide={() => {}} />
		{:else}
			<WhatAiSawPanel onhide={() => {}} />
		{/if}
	</div>
</Tooltip.Provider>

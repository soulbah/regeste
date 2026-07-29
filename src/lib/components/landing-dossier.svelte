<script lang="ts">
	// Chapter 03: one question at two moments, as two leaves of one dossier.
	//
	// These were two sections. They are not two features — the fixture already
	// proves it: the pre-send panel reviews `presendQ`, and the record panel keeps
	// the trace of that same question's answer. Two chapters built from the same
	// template, each holding a 448px panel adrift in a 1232px page, is the
	// monotony and the emptiness in one move.
	//
	// The panel is not too small. `panel-shell.svelte:122` makes the app's real
	// right panel `sm:max-w-md`, and forcing it to 1232px was measured to produce
	// a 1126px truncated 14px heading over a half-empty scroll area. 448px is the
	// truth; it was only unplaced. Put it in a room and it is contained.
	//
	// Only in-memory stores are seeded — the landing must never open the local
	// database — and both leaves are inert, so no handler can fire and reach one.
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import PresendPanel from '$lib/components/presend-panel.svelte';
	import WhatAiSawPanel from '$lib/components/what-ai-saw-panel.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { t, i18n } from '$lib/i18n/index.svelte';
	import { LANDING_FIXTURE } from '$lib/landing-fixture';
	import { assistedPayloadBytes, buildAssistedExcerpts } from '$lib/assisted-payload';
	import type { SearchHit } from '$lib/types';

	const fix = $derived(LANDING_FIXTURE[i18n.locale]);

	/** The third passage is the one the visitor unticks, in both leaves. */
	const EXCLUDED = 2;

	const hits = $derived(
		fix.presendHits.map((h, i): SearchHit => ({
			chunkId: i + 1,
			documentId: 'landing-doc',
			documentName: fix.doc,
			text: h.text,
			page: h.page,
			headingPath: h.heading,
			// Real relevance figures: the panel prints these as percentages.
			score: 0.036 - i * 0.012
		}))
	);

	/** Both leaves and the ledger read one computation, through the same helper
	 * the real request is measured with. Two figures 40px apart that disagree
	 * would undo the only argument this section makes. */
	const bytesOf = (rows: SearchHit[]) =>
		assistedPayloadBytes(fix.presendQ, buildAssistedExcerpts(rows), null);
	const offeredBytes = $derived(bytesOf(hits));
	const sentBytes = $derived(bytesOf(hits.filter((_, i) => i !== EXCLUDED)));
	/** The same one-decimal kilobyte the panels print, with the locale's own
	 * unit: French writes Ko, and a ledger reading KB beside a panel footer
	 * reading Ko is the kind of seam this whole section argues it does not have. */
	const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} ${t('landing.deck.kbUnit')}`;
	const passages = (count: number) => t('common.passages', { count, s: count > 1 ? 's' : '' });

	const MOMENTS = ['before', 'after'] as const;
	const DECK_NOTES = ['landing.deck.f1', 'landing.deck.f2'] as const;
	type Moment = (typeof MOMENTS)[number];
	let moment = $state<Moment>('before');

	const LEDGER = $derived({
		before: [
			{
				label: t('landing.deck.found'),
				value: `${passages(hits.length)} · ${kb(offeredBytes)}`
			},
			{ label: t('landing.deck.keep'), value: passages(1) },
			{ label: t('landing.deck.ready'), value: `${passages(2)} · ${kb(sentBytes)}` }
		],
		after: [
			{ label: t('landing.deck.gone'), value: `${passages(2)} · ${kb(sentBytes)}` },
			{ label: t('landing.deck.stayed'), value: passages(1) },
			{ label: t('landing.deck.keptWith'), value: t('landing.deck.keptWithValue') }
		]
	});

	const NAMES = $derived({ before: t('landing.deck.before'), after: t('landing.deck.after') });

	// Seeded on every locale change, because the page applies ?lang= after mount.
	$effect(() => {
		const rows = hits;
		settingsStore.assistedConsented = true;
		chatsStore.pendingAssisted = {
			chatId: 'landing',
			question: fix.presendQ,
			hits: rows,
			conversationContext: null,
			route: 'targeted'
		};
		chatsStore.messages = [
			{ id: 'lp-q', role: 'user', mode: null, content: fix.presendQ, createdAt: 0 },
			{ id: 'lp-a', role: 'assistant', mode: 'assisted', content: fix.subletAnswer, createdAt: 1 }
		] as typeof chatsStore.messages;
		chatsStore.excerptsByMessage = {
			'lp-a': rows.map((h, i) => ({
				messageId: 'lp-a',
				chunkId: null,
				sent: i !== EXCLUDED,
				excluded: i === EXCLUDED,
				snippet: h.text,
				documentName: fix.doc,
				locator: `p. ${h.page}`
			}))
		};
		chatsStore.privacyByMessage = {
			'lp-a': {
				messageId: 'lp-a',
				mode: 'assisted',
				destination: 'cloud',
				excerptCount: rows.length - 1,
				bytesSent: sentBytes
			}
		};
		chatsStore.waisMessageId = 'lp-a';
	});
</script>

<Tabs.Root
	bind:value={() => moment, (v) => (moment = v as Moment)}
	class="grid gap-y-12 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-center lg:gap-x-10 xl:grid-cols-[27rem_minmax(0,1fr)] xl:gap-x-16"
>
	<!-- Left: the words. The ledger is the readable content of each moment, so it
	     is what the tabs actually control; the deck on the right is a picture of
	     the product. bits-ui resolves aria-controls by id, so the panels living in
	     a different grid column than the list is legal. -->
	<div>
		<p class="text-muted-foreground font-mono text-[11px] tracking-widest uppercase" id="dossier">
			<span class="text-accent-foreground">[</span>
			03
		</p>
		<h2 class="font-display mt-4 text-3xl leading-tight tracking-tight text-balance">
			{t('landing.deck.title')}
		</h2>
		<p class="text-muted-foreground mt-3 leading-relaxed">{t('landing.deck.sub')}</p>

		{#each MOMENTS as id (id)}
			<Tabs.Content value={id} class="border-border mt-8 border-t">
				<dl>
					{#each LEDGER[id] as row (row.label)}
						<div class="border-border border-b py-4">
							<dt class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								{row.label}
							</dt>
							<dd class="mt-1.5 text-lg">{row.value}</dd>
						</div>
					{/each}
				</dl>
			</Tabs.Content>
		{/each}

		<div class="mt-8 space-y-3">
			{#each DECK_NOTES as note (note)}
				<p class="text-muted-foreground font-mono text-[11px] leading-relaxed">
					<span class="text-accent-foreground">[</span>
					{t(note)}
				</p>
			{/each}
		</div>
	</div>

	<!-- Right: the stage. -->
	<div class="min-w-0">
		<!-- The rail names both moments in words before anyone clicks, so the
		     section still says what it has to say at zero clicks.
		     The two moments are chips sitting ON the rule, not labels under a pair
		     of ticks: a 9px dot over mono capitals reads as a printed timeline and
		     nobody presses it. A bordered object with a fill, punched through the
		     line it sits on, reads as pressable at a glance. The rule survives
		     underneath because it carries the page's crossing grammar. -->
		<div class="relative pb-10">
			<p
				class="text-muted-foreground mb-4 text-center font-mono text-[11px] tracking-widest uppercase"
			>
				{moment === 'before' ? t('landing.deck.intact') : `${passages(2)} · ${kb(sentBytes)}`}
			</p>
			<div class="absolute inset-x-0 top-[46px] flex items-center" aria-hidden="true">
				<span class="border-border flex-1 border-t"></span>
				<span class="border-border w-1/2 border-t border-dashed"></span>
				<span class="border-border flex-1 border-t"></span>
			</div>
			<Tabs.List
				class="relative grid h-auto w-full grid-cols-2 bg-transparent p-0 group-data-horizontal/tabs:h-auto"
			>
				{#each MOMENTS as id (id)}
					<Tabs.Trigger
						value={id}
						class="border-border data-[state=active]:bg-card data-[state=active]:border-foreground/25 hover:bg-card/70 bg-background mx-auto h-auto w-fit cursor-pointer gap-2.5 rounded-md border px-3.5 py-2 whitespace-normal data-[state=active]:shadow-sm"
					>
						<!-- Hollow reads as "not reached yet", which on a timeline is
						     exactly right. -->
						<span
							class="border-border size-[9px] shrink-0 rounded-full border-2 transition-colors {moment ===
							id
								? 'bg-foreground border-foreground'
								: 'bg-background'}"
						></span>
						<span class="font-mono text-[11px] tracking-widest uppercase">{NAMES[id]}</span>
					</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</div>

		<!-- The room. The floor is bg-muted/30 and the leaves are bg-card, which is
		     already lighter than the page in both themes, so they sit above the
		     floor before a single pixel of shadow is drawn. -->
		<div class="border-border bg-muted/30 overflow-hidden rounded-2xl border">
			<div class="border-border flex items-center gap-2.5 border-b px-6 py-3.5">
				<MonitorIcon class="text-muted-foreground size-4" />
				<span class="font-mono text-[10px] tracking-widest uppercase">{t('hiw.frame')}</span>
			</div>

			<div class="p-6 lg:p-8">
				<Tooltip.Provider delayDuration={300}>
					<!-- Two fixed slots; the leaves swap slots. No rotation at any value:
					     rotation means shuffle, and this is a clock. The back leaf is
					     offset up and to the right, toward the moment it belongs to.
					     The drop is 56px, the exact height of a panel's header rail, so
					     what shows above the front leaf is the back panel's own title,
					     whole. At 24px that title was sliced through the middle with a
					     second, landing-written label printed on top of it. -->
					<div class="relative mx-auto h-[606px] w-[488px] max-w-full lg:h-[676px]">
						{#each MOMENTS as id (id)}
							<div
								class="leaf border-border bg-card absolute top-0 left-0 h-[550px] w-[448px] max-w-full overflow-hidden rounded-xl border lg:h-[620px] {moment ===
								id
									? 'leaf-front'
									: 'leaf-back'}"
							>
								<div class="h-full" aria-hidden="true" inert>
									{#if id === 'before'}
										<!-- The third passage arrives already unticked, so the leaf
										     agrees with the ledger beside it and with the record
										     behind it: one passage kept back, two ready to leave,
										     and the panel's own footer counts 2/3 at the same
										     kilobytes the ledger prints. -->
										<PresendPanel onhide={() => {}} excludedChunkIds={[hits[EXCLUDED].chunkId]} />
									{:else}
										<WhatAiSawPanel onhide={() => {}} />
									{/if}
								</div>
							</div>
						{/each}

						<!-- The exposed strips of the back leaf are the second trigger. They
					     carry no label of their own: the strip is exactly the back
					     panel's header rail, which already names it in the product's own
					     words, and a landing label on top of that is two names for one
					     thing, overlapping. -->
						<button
							type="button"
							class="focus-visible:ring-ring/50 absolute inset-0 cursor-pointer rounded-xl focus-visible:ring-2 focus-visible:outline-none"
							style="clip-path: polygon(0 0, 100% 0, 100% 100%, calc(100% - 40px) 100%, calc(100% - 40px) 56px, 0 56px);"
							aria-label={t('landing.deck.bring', {
								name: NAMES[moment === 'before' ? 'after' : 'before']
							})}
							onclick={() => (moment = moment === 'before' ? 'after' : 'before')}
						></button>
					</div>
				</Tooltip.Provider>
			</div>
		</div>
	</div>
</Tabs.Root>

<style>
	/* Transitions, not keyframes: a fast second click retargets mid-flight
	   instead of jumping. z-index swaps immediately and is never transitioned, or
	   the rising leaf would slide in behind the other one. */
	.leaf {
		transition:
			transform 420ms cubic-bezier(0.16, 1, 0.3, 1),
			opacity 300ms linear,
			box-shadow 420ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.leaf-front {
		transform: translate3d(0, 56px, 0) scale(1);
		opacity: 1;
		z-index: 20;
		box-shadow:
			0 24px 48px -12px rgb(0 0 0 / 0.18),
			0 8px 16px -8px rgb(0 0 0 / 0.1);
	}

	.leaf-back {
		transform: translate3d(40px, 0, 0) scale(0.985);
		opacity: 0.58;
		z-index: 10;
		box-shadow: 0 16px 32px -12px rgb(0 0 0 / 0.12);
	}

	@media (prefers-reduced-motion: reduce) {
		.leaf {
			transition: opacity 150ms linear;
		}
	}
</style>

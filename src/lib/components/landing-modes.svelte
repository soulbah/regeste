<script lang="ts">
	// Chapter 01, as a drawing you operate rather than three columns of prose.
	//
	// The claim this section carries is about topology: reading and searching
	// happen on this machine in all three modes, and only the last step can move.
	// A sentence saying so is a sentence; the same thing drawn, with a boundary
	// that visibly stays uncrossed on This device, is checkable. Picking a card
	// re-routes the drawing, which is the whole argument in one movement.
	//
	// The drawing is the app's own /how-it-works component, not a landing replica.
	import * as Tabs from '$lib/components/ui/tabs';
	import DataFlow from '$lib/components/data-flow.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { ASSISTED_ENABLED } from '$lib/flags';
	import type { ChatMode } from '$lib/types';

	// Same source of truth as /how-it-works: with the Assisted endpoint off, the
	// Cloud card must not exist, or the page markets a mode the build does not
	// offer.
	const MODES = (
		ASSISTED_ENABLED ? (['private', 'assisted', 'myai'] as const) : (['private', 'myai'] as const)
	) satisfies readonly ChatMode[];

	let mode = $state<ChatMode>('private');

	const COPY = $derived({
		private: {
			name: t('modes.private.name'),
			desc: t('landing.modes.private'),
			cost: t('landing.modes.private.cost')
		},
		assisted: {
			name: t('modes.assisted.name'),
			desc: t('landing.modes.assisted'),
			cost: t('landing.modes.assisted.cost')
		},
		myai: {
			name: t('modes.myai.name'),
			desc: t('landing.modes.myai'),
			cost: t('landing.modes.myai.cost')
		}
	});
</script>

<Tabs.Root bind:value={() => mode, (v) => (mode = v as ChatMode)} class="gap-0">
	<!-- The cards are the control. Every default tabs-list style is stripped: the
	     base ships a 40px pill with a muted fill, which fights a 143px card.
	     The height lock has to be released under its own variant prefix — the base
	     writes `group-data-horizontal/tabs:h-10`, and a plain `h-auto` is a
	     different key to tailwind-merge, so it does not override it and the cards
	     overflow the list into the drawing below. -->
	<Tabs.List
		class="grid h-auto w-full gap-6 bg-transparent p-0 group-data-horizontal/tabs:h-auto {MODES.length ===
		3
			? 'lg:grid-cols-3'
			: 'lg:grid-cols-2'}"
	>
		{#each MODES as id (id)}
			<Tabs.Trigger
				value={id}
				class="border-border data-[state=active]:bg-card data-[state=inactive]:bg-card/40 hover:bg-card/70 h-auto flex-none cursor-pointer flex-col items-start gap-2 rounded-2xl border p-6 text-left whitespace-normal data-[state=active]:shadow-lg data-[state=active]:shadow-black/5"
			>
				<span class="font-display text-2xl tracking-tight">{COPY[id].name}</span>
				<span class="text-muted-foreground text-sm leading-relaxed">{COPY[id].desc}</span>
				<!-- The cost, not the benefit. Naming what it asks of you first is what
				     makes the rest believable, and the in-product mode cards already
				     read this way. -->
				<span class="text-muted-foreground mt-1 font-mono text-[11px] leading-relaxed">
					{COPY[id].cost}
				</span>
			</Tabs.Trigger>
		{/each}
	</Tabs.List>

	<!-- The active card feeds the room, and the hairline descends from that card,
	     not from the middle of the row: a centred connector under a left-hand
	     selection says the three cards feed the room as a group, which is not what
	     the control means. A hairline rather than a card welded to the room's top
	     edge, because the first card's corner sits exactly on the room's radius
	     and a flush join would break there. -->
	<div
		class="grid {MODES.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-6"
		aria-hidden="true"
	>
		{#each MODES as id (id)}
			<div class="flex justify-center">
				<span class="h-8 border-l {mode === id ? 'border-border' : 'border-transparent'}"></span>
			</div>
		{/each}
	</div>

	<div aria-hidden="true">
		<DataFlow {mode} bleed />
	</div>

	<!-- What the drawing says, in words, for anyone who cannot see it. Each panel
	     is the tab's accessible content; the picture above is decoration as far as
	     assistive technology is concerned. -->
	{#each MODES as id (id)}
		<Tabs.Content value={id} class="sr-only">
			{t(`hiw.${id}.leaves` as Parameters<typeof t>[0])}
		</Tabs.Content>
	{/each}
</Tabs.Root>

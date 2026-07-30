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
	<!-- items-stretch, because the base list centres its items: a card whose
	     description wraps to two lines then grew taller than its neighbours and the
	     row looked broken. Stretch plus h-full on the trigger gives one height for
	     the three, set by the tallest. -->
	<Tabs.List
		class="grid h-auto w-full items-stretch gap-6 bg-transparent p-0 group-data-horizontal/tabs:h-auto {MODES.length ===
		3
			? 'lg:grid-cols-3'
			: 'lg:grid-cols-2'}"
	>
		{#each MODES as id (id)}
			<Tabs.Trigger
				value={id}
				class="border-border data-[state=active]:bg-card data-[state=inactive]:bg-card/40 hover:bg-card/70 data-[state=active]:border-accent-foreground/40 group/mode relative h-full flex-none cursor-pointer flex-col items-start gap-2 rounded-2xl border p-6 pt-11 text-left whitespace-normal transition-[background-color,border-color,transform] hover:-translate-y-0.5 data-[state=active]:shadow-lg data-[state=active]:shadow-black/5"
			>
				<!-- The cards did not read as clickable, and testers had to be told.
				     Three affordances, because one was demonstrably not enough: a radio
				     mark that fills when chosen, a verb saying what a click does, and a
				     lift on hover. The mark is the load-bearing one — a filled dot beside
				     two hollow ones is the one pattern everybody has already learned. -->
				<span class="absolute top-5 left-6 flex items-center gap-2">
					<span
						class="border-border group-data-[state=active]/mode:border-accent-foreground group-data-[state=active]/mode:bg-accent-foreground size-[13px] rounded-full border-2 transition-colors"
					></span>
					<span
						class="text-muted-foreground group-data-[state=active]/mode:text-accent-foreground font-mono text-[10px] tracking-widest uppercase transition-colors"
					>
						{mode === id ? t('landing.modes.showing') : t('landing.modes.show')}
					</span>
				</span>
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

	<!-- The line leaves the card that is showing, not the middle of the row: it says
	     "this card feeds that drawing", and centred under three cards it said nothing
	     at all. It rides the same grid as the cards and moves column when the
	     selection moves.
	     It stays green and static, and the connector at the trust boundary stays
	     amber and animated, so a vertical line still tells you which side of the
	     boundary you are on: green never leaves the browser. -->
	<div
		class="flex justify-center py-8 lg:grid lg:gap-6 {MODES.length === 3
			? 'lg:grid-cols-3'
			: 'lg:grid-cols-2'}"
		aria-hidden="true"
	>
		<span
			class="border-accent-foreground/40 h-8 border-l transition-[grid-column] lg:mx-auto"
			style="grid-column-start: {MODES.findIndex((id) => id === mode) + 1}"
		></span>
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

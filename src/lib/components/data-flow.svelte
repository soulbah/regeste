<script lang="ts">
	// Two rooms and one line between them.
	//
	// The first version drew the flow as a row of grey pills with arrows, which
	// is a breadcrumb trail, not a data flow: everything had the same weight,
	// nothing was contained by anything, and the trust boundary was a rule with
	// pills floating near it. A boundary diagram only says something when the
	// things on each side are visibly *inside* something.
	//
	// So: containers. The browser holds every step that never leaves. Below the
	// dashed line sits a second room, drawn in all three modes: Cloud and Your
	// server put the answer step in it, This device leaves it struck out and
	// empty. Choosing a mode moves that step across, and the line states its
	// payload. That single movement is the whole product claim, and it is the only
	// thing here that animates.
	//
	// Lifted out of /how-it-works so the landing shows the same drawing rather
	// than a second one that drifts. Two surfaces, one file.
	import BinaryIcon from '@lucide/svelte/icons/binary';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import QuoteIcon from '@lucide/svelte/icons/quote';
	import ScissorsIcon from '@lucide/svelte/icons/scissors';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ServerIcon from '@lucide/svelte/icons/server';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { t } from '$lib/i18n/index.svelte';
	import type { ChatMode } from '$lib/types';
	import type { Component } from 'svelte';
	import type { MessageKey } from '$lib/i18n/index.svelte';

	let {
		mode,
		bleed = false
	}: {
		mode: ChatMode;
		/** Landing: the dashed rule runs to both viewport edges while its label and
		 * payload sentence stay on the container. */
		bleed?: boolean;
	} = $props();

	type Step = { key: MessageKey; icon: Component<{ class?: string }> };

	const NAMES = $derived({
		private: t('modes.private.name'),
		assisted: t('modes.assisted.name'),
		myai: t('modes.myai.name')
	});

	/** Only This device keeps the answer on this side of the line. */
	const crosses = $derived(mode !== 'private');

	// The steps that never move, in the order they happen. Each carries an icon
	// because five identical grey rectangles are not a sequence — a reader needs
	// to tell reading from splitting at a glance.
	//
	// All five on the landing too. Showing three to spare a general-public reader
	// the words "Splitting" and "Encoding" was a false economy: the lane then
	// jumps from reading a file to having an index with no account of how one
	// becomes the other, and a reader notices that hole faster than they trip on
	// the words.
	const INGEST = [
		{ key: 'hiw.step.document', icon: FileTextIcon },
		{ key: 'hiw.step.parsing', icon: BookOpenIcon },
		{ key: 'hiw.step.chunking', icon: ScissorsIcon },
		{ key: 'hiw.step.embeddings', icon: BinaryIcon },
		{ key: 'hiw.step.index', icon: DatabaseIcon }
	] satisfies Step[];
	const ASK = [
		{ key: 'hiw.step.question', icon: MessageSquareTextIcon },
		{ key: 'hiw.step.search', icon: SearchIcon },
		{ key: 'hiw.step.passages', icon: QuoteIcon }
	] satisfies Step[];

	const ZONE_ICON = $derived(mode === 'assisted' ? CloudIcon : ServerIcon);

	const detail = $derived({
		leaves: t(`hiw.${mode}.leaves` as Parameters<typeof t>[0])
	});
</script>

{#snippet lane(label: string, index: string, steps: Step[])}
	<div>
		<p
			class="text-muted-foreground mb-5 flex items-baseline justify-center gap-2.5 font-mono text-[10px] tracking-widest uppercase"
		>
			<span class="text-accent-foreground">{index}</span>
			{label}
		</p>
		<!-- Centred, fixed-width nodes rather than a stretched row. Five steps,
		     then three, then one: centring them is what makes that a funnel you can
		     see, where left-aligning the same nodes just reads as ragged rows.
		     The connector sits at mt-[22px], the vertical centre of a node, so it
		     meets the icons instead of the labels. -->
		<div class="flex flex-wrap items-start justify-center gap-y-6">
			{#each steps as step, i (step.key)}
				{#if i > 0}
					<span
						class="border-border/50 flow flow-x mt-[22px] hidden w-10 border-t md:block lg:w-16"
						style="--flow-delay: {i * 0.34}s"
					></span>
				{/if}
				<div class="flex w-32 flex-col items-center gap-3 text-center lg:w-36">
					<span
						class="border-border bg-card flex size-11 items-center justify-center rounded-xl border"
					>
						<step.icon class="text-muted-foreground size-[18px]" />
					</span>
					<span class="text-[13px] leading-snug">{t(step.key)}</span>
				</div>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet answerLane()}
	<!-- Centred, not parked in the first column: this step is alone in its room,
	     and a lone node hugging the left edge reads as a lane that got cut off
	     rather than as a destination. -->
	<div>
		<p
			class="text-muted-foreground mb-5 flex items-baseline justify-center gap-2.5 font-mono text-[10px] tracking-widest uppercase"
		>
			<span class="text-accent-foreground">03</span>
			{t('hiw.lane.answer')}
		</p>
		<div class="hiw-node flex w-32 flex-col items-center gap-3 text-center lg:mx-auto lg:w-36">
			<span
				class="flex size-11 items-center justify-center rounded-xl border {crosses
					? 'border-amber-500/40 bg-amber-500/10'
					: 'border-accent-foreground/30 bg-accent-foreground/10'}"
			>
				<SparklesIcon
					class="size-[18px] {crosses
						? 'text-amber-700 dark:text-amber-500'
						: 'text-accent-foreground'}"
				/>
			</span>
			<span class="text-[13px] leading-snug">{t('hiw.step.answer')}</span>
		</div>
	</div>
{/snippet}

<!-- Room one. Everything in here happens on the machine in front of you, in
     every mode, which is why it is drawn as a container and not as a list.
     Writing the answer is lane 03, not a node dangling off lane 02 on a vertical
     stub. Readers told us the stub read as "the answer comes straight after Local
     search", skipping Top passages entirely, and they were right: it is a third
     step and it now says so. -->
<div class="border-border bg-card/25 rounded-2xl border">
	<div class="border-border flex items-center gap-2.5 border-b px-6 py-3.5">
		<MonitorIcon class="text-muted-foreground size-4" />
		<span class="font-mono text-[10px] tracking-widest uppercase">{t('hiw.frame')}</span>
	</div>

	<div class="space-y-9 px-6 py-8 sm:px-8">
		{@render lane(t('hiw.lane.ingest'), '01', INGEST)}
		{@render lane(t('hiw.lane.ask'), '02', ASK)}
		{#if !crosses}
			{@render answerLane()}
		{/if}
	</div>
</div>

<!-- The line, and its payload. What crosses is the single most important
     sentence here, so it is written on the boundary itself rather than in a
     footnote under a diagram.
     The vertical connector appears here and nowhere else. Every other line in
     this drawing is horizontal, so a vertical one carries exactly one meaning:
     something left the room. -->
<div class="py-7 {bleed ? '-mx-[calc(50vw-50%)] px-[calc(50vw-50%)]' : 'px-2'}">
	{#if crosses}
		<div class="flex justify-center pb-5" aria-hidden="true">
			<span
				class="flow flow-y flow-amber h-8 border-l border-amber-500/40"
				style="--flow-delay: 1.1s"
			></span>
		</div>
	{/if}
	<div class="flex items-center gap-4">
		<span class="border-border flex-1 border-t border-dashed"></span>
		<span
			class="font-mono text-[10px] tracking-widest whitespace-nowrap uppercase {crosses
				? 'text-amber-700 dark:text-amber-500'
				: 'text-muted-foreground'}"
		>
			{crosses ? t('hiw.boundaryCrossed') : t('hiw.boundaryIntact')}
		</span>
		<span class="border-border flex-1 border-t border-dashed"></span>
	</div>
	{#if crosses}
		<p
			class="mx-auto mt-3.5 max-w-3xl text-center text-sm leading-relaxed text-amber-700 dark:text-amber-500/90"
		>
			{detail.leaves}
		</p>
	{/if}
</div>

<!-- Room two, always drawn.
     It used to vanish on This device, on the theory that the absence was the
     statement. Readers could not compare against something that was not there, so
     the room stays and shows itself empty instead: the same frame, one occupied
     and one visibly not. That contrast is the whole argument of the drawing, and
     it only exists if both boxes exist. -->
{#if crosses}
	<div class="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04]">
		<div class="flex items-center gap-2.5 border-b border-amber-500/25 px-6 py-3.5">
			<ZONE_ICON class="size-4 text-amber-700 dark:text-amber-500" />
			<span class="font-mono text-[10px] tracking-widest uppercase">{NAMES[mode]}</span>
		</div>
		<div class="px-6 py-8 sm:px-8">
			{@render answerLane()}
		</div>
	</div>
{:else}
	<!-- Same room, same name, same header colour, marked unused. Naming it
	     "Nothing leaves" made it a different box from the one Cloud draws, and two
	     different boxes cannot be compared; keeping Cloud's own header, amber
	     included, is what makes the comparison land.
	     The state goes in a tag, not a strikethrough. A line through the word
	     negates the word, so on the name of a mode we actually offer it reads as
	     "Cloud is disabled" rather than "Cloud is not being used here", and at
	     10px mono capitals the rule crosses the letters and costs legibility.
	     Amber stays on the header only. The frame keeps a neutral dashed border and
	     no fill, so the colour identifies which room this is without a filled amber
	     block claiming, in the one mode where nothing leaves, that something did. -->
	<div class="border-border/70 rounded-2xl border border-dashed">
		<div
			class="border-border/70 flex items-center gap-2.5 border-b border-dashed px-6 py-3.5 sm:gap-3"
		>
			<CloudIcon class="size-4 text-amber-700 dark:text-amber-500" />
			<span class="font-mono text-[10px] tracking-widest uppercase">
				{NAMES.assisted}
			</span>
			<span
				class="border-border/70 text-muted-foreground/80 rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-widest uppercase"
			>
				{t('hiw.zone.unused')}
			</span>
		</div>
		<p class="px-6 py-8 text-center text-sm leading-relaxed sm:px-8">{detail.leaves}</p>
	</div>
{/if}

<style>
	/* Something travels the connectors, because the connectors are the only place
	   on this page where the product's one claim is a claim about movement. The
	   pulse is the accent green while it circulates inside the browser, and amber
	   on the two segments that cross the boundary — so picking Cloud does not just
	   move a node, it changes the colour of what is in transit. That is the whole
	   argument, drawn, and it is also the only place the accent colour appears in
	   the middle of the page: one meaningful use rather than green sprinkled about.

	   Background-position rather than a translated dot: one compositable property,
	   no extra element per connector, and it rides whatever length the connector
	   happens to be at that breakpoint.

	   --accent-foreground, not --color-accent-foreground: the latter is declared
	   once at the root as var(--accent-foreground) and inherits down already
	   resolved, so inside the landing's inverted band it would still hand back the
	   light-scheme green. */
	.flow {
		position: relative;
	}

	/* The animation name is written literally in each direction's rule, never handed
	   in through a custom property. Svelte prefixes a component's @keyframes with its
	   scope hash and rewrites the declarations that name them, and it cannot see
	   through var(): the name resolved to an unscoped `flow-x`, which no longer
	   existed, so this never ran once. It looked like a visibility problem for weeks
	   and it was a dead reference. */
	.flow::after {
		content: '';
		position: absolute;
		background-repeat: no-repeat;
		animation-duration: 2.9s;
		animation-timing-function: linear;
		animation-iteration-count: infinite;
		animation-delay: var(--flow-delay, 0s);
	}

	/* A spark of fixed length, not a proportion of the connector.
	   At 45% of its own segment the highlight measured 18px on a 40px connector,
	   and the gradient spends its ends on transparency, so two or three pixels were
	   actually lit: the animation ran and nobody could see it. 26px carries the same
	   weight on every segment and at every breakpoint, and the colour stops keep a
	   tight bright core instead of a long fade. */
	.flow-x::after {
		inset: -1px 0 auto 0;
		height: 1px;
		background-image: linear-gradient(
			90deg,
			transparent 0%,
			var(--accent-foreground) 45%,
			var(--accent-foreground) 55%,
			transparent 100%
		);
		background-size: 26px 100%;
		animation-name: flow-x;
	}

	.flow-y::after {
		inset: 0 auto 0 -1px;
		width: 1px;
		background-image: linear-gradient(
			180deg,
			transparent 0%,
			var(--accent-foreground) 45%,
			var(--accent-foreground) 55%,
			transparent 100%
		);
		background-size: 100% 26px;
		animation-name: flow-y;
	}

	.flow-amber.flow-y::after {
		background-image: linear-gradient(180deg, transparent, var(--color-amber-500), transparent);
	}

	@keyframes flow-x {
		from {
			background-position: -26px 0;
		}
		to {
			background-position: calc(100% + 26px) 0;
		}
	}

	@keyframes flow-y {
		from {
			background-position: 0 -26px;
		}
		to {
			background-position: 0 calc(100% + 26px);
		}
	}

	/* The answer step re-enters when it changes rooms. One movement, on the one
	   element that actually moved; nothing else animates. */
	.hiw-node {
		animation: hiw-drop 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes hiw-drop {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hiw-node,
		.flow::after {
			animation: none;
		}

		/* The pulse is the only thing carrying the accent here, so leave one at
		   rest on each connector rather than an unmarked hairline. */
		.flow::after {
			background-position: 50% 50%;
		}
	}
</style>

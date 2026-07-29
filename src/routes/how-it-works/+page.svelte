<script lang="ts">
	// Two rooms and one line between them.
	//
	// The first version drew the flow as a row of grey pills with arrows, which
	// is a breadcrumb trail, not a data flow: everything had the same weight,
	// nothing was contained by anything, and the trust boundary was a rule with
	// pills floating near it. A boundary diagram only says something when the
	// things on each side are visibly *inside* something.
	//
	// So: containers. The browser holds every step that never leaves. Cloud and
	// Your server get a second room below the dashed line; This device gets no
	// second room at all, because there is nothing to put in one. Choosing a
	// mode moves the answer step across, and the line states its payload. That
	// single movement is the whole product claim, and it is the only thing on
	// the page that animates.
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
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
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';
	import { ASSISTED_ENABLED } from '$lib/flags';
	import type { ChatMode } from '$lib/types';
	import type { Component } from 'svelte';
	import type { MessageKey } from '$lib/i18n/index.svelte';

	type Step = { key: MessageKey; icon: Component<{ class?: string }> };

	const MODES = (
		ASSISTED_ENABLED ? (['private', 'assisted', 'myai'] as const) : (['private', 'myai'] as const)
	) satisfies readonly ChatMode[];

	let mode = $state<ChatMode>('private');

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
		leaves: t(`hiw.${mode}.leaves` as Parameters<typeof t>[0]),
		stays: t(`hiw.${mode}.stays` as Parameters<typeof t>[0]),
		server: t(`hiw.${mode}.server` as Parameters<typeof t>[0])
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
					<span class="border-border mt-[22px] hidden w-10 border-t md:block lg:w-16"></span>
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

{#snippet answerNode()}
	<!-- Centred, not parked in the first column: this step is alone in its room,
	     and a lone node hugging the left edge reads as a lane that got cut off
	     rather than as a destination. -->
	<div class="hiw-node flex justify-center">
		<div class="flex w-32 flex-col items-center gap-3 text-center lg:w-36">
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

<svelte:head><title>{t('hiw.title')} · Regeste</title></svelte:head>

<div class="bg-background min-h-svh">
	<header class="flex h-14 items-center px-4">
		<Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" href={resolve('/chat')}>
			<ArrowLeftIcon class="size-3.5!" />
			{t('auth.back')}
		</Button>
	</header>

	<div class="mx-auto max-w-6xl px-6 pt-8 pb-28">
		<h1 class="font-display text-[2.4rem] leading-[1.1] tracking-tight">{t('hiw.title')}</h1>
		<p class="text-muted-foreground mt-4 max-w-2xl text-lg leading-relaxed text-balance">
			{t('hiw.intro')}
		</p>

		<!-- The only control on the page, because the mode is the only variable in
		     the flow. -->
		<div class="bg-muted/60 mt-9 inline-flex gap-0.5 rounded-lg p-0.5">
			{#each MODES as id (id)}
				<Button
					variant="ghost"
					size="sm"
					class="h-8 rounded-[7px] px-3.5 {mode === id
						? 'bg-card dark:bg-foreground/14 hover:bg-card text-foreground shadow-xs'
						: 'text-muted-foreground'}"
					aria-pressed={mode === id}
					onclick={() => (mode = id)}
				>
					{NAMES[id]}
				</Button>
			{/each}
		</div>

		<!-- Room one. Everything in here happens on the machine in front of you,
		     in every mode, which is why it is drawn as a container and not as a
		     list. -->
		<div class="border-border bg-card/25 mt-8 rounded-2xl border">
			<div class="border-border flex items-center gap-2.5 border-b px-6 py-3.5">
				<MonitorIcon class="text-muted-foreground size-4" />
				<span class="font-mono text-[10px] tracking-widest uppercase">{t('hiw.frame')}</span>
			</div>

			<div class="space-y-9 px-6 pt-8 sm:px-8">
				{@render lane(t('hiw.lane.ingest'), '01', INGEST)}
				{@render lane(t('hiw.lane.ask'), '02', ASK)}
			</div>

			<!-- The descent. The answer comes out of the question chain, not out of
			     indexing, so it hangs below lane 02 on a vertical connector rather
			     than sitting in a third row of its own: a third row implied the two
			     passes above it narrowed into one, and they do not.
			     When the mode crosses, the connector runs out of the bottom of the
			     room and the boundary cuts it. -->
			<div class="flex flex-col items-center px-6 pb-8 sm:px-8">
				<span class="h-8 border-l {crosses ? 'border-amber-500/40' : 'border-border'}"></span>
				{#if !crosses}
					<div class="pt-4">{@render answerNode()}</div>
				{/if}
			</div>
		</div>

		<!-- The line, and its payload. What crosses is the single most important
		     sentence on the page, so it is written on the boundary itself rather
		     than in a footnote under a diagram. -->
		<div class="px-2 py-7">
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
			<!-- max-w-3xl, not xl: the longest of the three payloads fits on one line
			     at this measure, so switching modes does not reflow the sentence from
			     one line to two and back. -->
			<p
				class="mx-auto mt-3.5 max-w-3xl text-center text-sm leading-relaxed {crosses
					? 'text-amber-700 dark:text-amber-500/90'
					: 'text-muted-foreground'}"
			>
				{detail.leaves}
			</p>
		</div>

		<!-- Room two, only when there is one. On This device nothing sits below the
		     line, which the other two modes make legible by putting a room there:
		     the absence is the statement, and it does not need a sentence saying so
		     on top of the label, the payload line and the proof below. -->
		{#if crosses}
			<div class="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04]">
				<div class="flex items-center gap-2.5 border-b border-amber-500/25 px-6 py-3.5">
					<ZONE_ICON class="size-4 text-amber-700 dark:text-amber-500" />
					<span class="font-mono text-[10px] tracking-widest uppercase">{NAMES[mode]}</span>
				</div>
				<!-- The connector picks up where the boundary cut it. -->
				<div class="flex flex-col items-center px-6 pt-0 pb-8 sm:px-8">
					<span class="h-8 border-l border-amber-500/40"></span>
					<div class="pt-4">{@render answerNode()}</div>
				</div>
			</div>
		{/if}

		<!-- The facts a diagram cannot draw. Hairlines rather than boxes: three
		     more bordered cards under a bordered diagram turns the page into
		     packaging. -->
		<div class="mt-14 grid gap-x-12 gap-y-8 sm:grid-cols-2">
			{#each [{ label: t('hiw.whatStays'), body: detail.stays }, { label: t('hiw.server'), body: detail.server }] as fact (fact.label)}
				<div class="border-border border-t pt-5">
					<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
						{fact.label}
					</p>
					<p class="mt-2.5 leading-relaxed">{fact.body}</p>
				</div>
			{/each}
		</div>

		<!-- A claim is only worth something if it can be checked. -->
		<div class="border-border mt-8 flex items-start gap-3 border-t pt-5">
			<WifiOffIcon class="text-muted-foreground mt-1 size-4 shrink-0" />
			<div>
				<p class="font-medium">{t('hiw.proofTitle')}</p>
				<p class="text-muted-foreground mt-1.5 leading-relaxed">{t('hiw.proofBody')}</p>
			</div>
		</div>

		<p class="text-muted-foreground mt-14 text-sm leading-relaxed">{t('hiw.footer')}</p>
	</div>
</div>

<style>
	/* The answer step re-enters when it changes rooms. One movement, on the one
	   element that actually moved; nothing else on the page animates. */
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
		.hiw-node {
			animation: none;
		}
	}
</style>

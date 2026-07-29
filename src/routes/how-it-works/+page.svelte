<script lang="ts">
	// One diagram, three states, and a dashed line.
	//
	// This was three columns of prose saying the same three things about three
	// modes, which is a table pretending to be an explanation. The subject is a
	// data flow, so it is drawn as one, in the grammar that field settled on
	// long ago: a trust boundary is a dashed line, and the whole story is what
	// crosses it.
	//
	// Everything happens above the line except one step. Choosing a mode moves
	// that step, and only that step — which is exactly the claim the product
	// makes, and the one a reader can check by cutting the network. The node
	// animates when it changes sides, because seeing it move IS the argument;
	// nothing else on the page moves.
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { Button } from '$lib/components/ui/button';
	import AmbientWash from '$lib/components/ambient-wash.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { ASSISTED_ENABLED } from '$lib/flags';
	import type { ChatMode } from '$lib/types';

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

	// The steps that never move, in the order they happen.
	const INGEST = [
		'hiw.step.document',
		'hiw.step.parsing',
		'hiw.step.chunking',
		'hiw.step.embeddings',
		'hiw.step.index'
	] as const;
	const ASK = ['hiw.step.question', 'hiw.step.search', 'hiw.step.passages'] as const;

	const detail = $derived({
		leaves: t(`hiw.${mode}.leaves` as Parameters<typeof t>[0]),
		stays: t(`hiw.${mode}.stays` as Parameters<typeof t>[0]),
		server: t(`hiw.${mode}.server` as Parameters<typeof t>[0])
	});
</script>

<svelte:head><title>{t('hiw.title')} · Regeste</title></svelte:head>

<div class="bg-background relative min-h-svh">
	<AmbientWash top="-8%" />

	<header class="relative flex h-14 items-center px-4">
		<Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" href={resolve('/chat')}>
			<ArrowLeftIcon class="size-3.5!" />
			{t('auth.back')}
		</Button>
	</header>

	<div class="relative mx-auto max-w-3xl px-6 pt-6 pb-24">
		<h1 class="font-display text-3xl tracking-tight">{t('hiw.title')}</h1>
		<p class="text-muted-foreground mt-2.5 max-w-xl text-sm leading-relaxed text-balance">
			{t('hiw.intro')}
		</p>

		<!-- The only control on the page, because the mode is the only variable in
		     the flow. -->
		<div class="bg-muted/60 mt-8 inline-flex gap-0.5 rounded-lg p-0.5">
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

		<div class="mt-8">
			<div class="border-border bg-card/25 rounded-xl border p-5 sm:p-7">
				<p class="text-muted-foreground/70 mb-5 font-mono text-[10px] tracking-widest uppercase">
					{t('hiw.frame')}
				</p>

				<div class="space-y-5">
					<div class="flex flex-wrap items-center gap-x-1.5 gap-y-2">
						{#each INGEST as step, i (step)}
							{#if i > 0}<span class="text-muted-foreground/40 text-xs">→</span>{/if}
							<span class="bg-muted/70 rounded-md px-2.5 py-1 text-xs">{t(step)}</span>
						{/each}
					</div>
					<div class="flex flex-wrap items-center gap-x-1.5 gap-y-2">
						{#each ASK as step, i (step)}
							{#if i > 0}<span class="text-muted-foreground/40 text-xs">→</span>{/if}
							<span class="bg-muted/70 rounded-md px-2.5 py-1 text-xs">{t(step)}</span>
						{/each}
					</div>
				</div>

				<!-- The boundary: dashed, because that is what a trust boundary is,
				     and labelled so the line reads without a legend. -->
				<div class="my-7 flex items-center gap-3">
					<span class="border-border flex-1 border-t border-dashed"></span>
					<span
						class="font-mono text-[10px] tracking-widest whitespace-nowrap uppercase {crosses
							? 'text-amber-600 dark:text-amber-500'
							: 'text-muted-foreground/60'}"
					>
						{crosses ? t('hiw.boundaryCrossed') : t('hiw.boundaryIntact')}
					</span>
					<span class="border-border flex-1 border-t border-dashed"></span>
				</div>

				<!-- Where the answer is written: above the line for This device, below
				     it for the other two. The movement is the explanation. -->
				<div class="flex justify-center">
					{#key mode}
						<span
							class="hiw-node inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm {crosses
								? 'border-amber-500/40 bg-amber-500/10'
								: 'border-border bg-muted/70'}"
						>
							<span
								class="size-1.5 rounded-full {crosses ? 'bg-amber-500' : 'bg-muted-foreground/40'}"
							></span>
							{NAMES[mode]}
							<span class="text-muted-foreground/60 text-xs">· {t('hiw.step.answer')}</span>
						</span>
					{/key}
				</div>
			</div>

			<p
				class="mt-3 text-xs leading-relaxed {crosses
					? 'text-amber-700 dark:text-amber-500/90'
					: 'text-muted-foreground'}"
			>
				{detail.leaves}
			</p>
		</div>

		<!-- The two facts a diagram cannot draw, for the mode on screen. -->
		<div class="mt-8 grid gap-4 sm:grid-cols-2">
			{#each [{ label: t('hiw.whatStays'), body: detail.stays }, { label: t('hiw.server'), body: detail.server }] as fact (fact.label)}
				<div class="border-border bg-card/25 rounded-xl border p-4">
					<p class="text-muted-foreground/70 font-mono text-[10px] tracking-widest uppercase">
						{fact.label}
					</p>
					<p class="mt-2 text-sm leading-relaxed">{fact.body}</p>
				</div>
			{/each}
		</div>

		<!-- A claim is only worth something if it can be checked. -->
		<div class="border-border bg-card/25 mt-4 flex items-start gap-3 rounded-xl border p-4">
			<WifiOffIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
			<div>
				<p class="text-sm font-medium">{t('hiw.proofTitle')}</p>
				<p class="text-muted-foreground mt-1 text-sm leading-relaxed">{t('hiw.proofBody')}</p>
			</div>
		</div>

		<p class="text-muted-foreground/70 mt-8 text-xs leading-relaxed">{t('hiw.footer')}</p>
	</div>
</div>

<style>
	/* The node re-enters when the mode changes. One movement, on the one element
	   that actually changed sides. */
	.hiw-node {
		animation: hiw-drop 340ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes hiw-drop {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hiw-node {
			animation: none;
		}
	}
</style>

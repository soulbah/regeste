<script lang="ts">
	// First run, step one: pick the engine that will answer.
	//
	// Cards rather than the composer's dropdown, because this is the one
	// decision standing between the user and a working app, and a dropdown hides
	// the thing that actually differs between the options: what each one costs
	// to set up. Every card states that cost up front (a download and its size,
	// a sign-in, an endpoint of your own) so the choice is made on facts rather
	// than on three names.
	//
	// One card carries "Best for this device", and it is measured, never a
	// static Recommended: the ladder reads this adapter's real buffer limit and
	// the free space this origin has, so the promise is one we have checked.
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import HelpLink from '$lib/components/help-link.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { modeReadiness } from '$lib/state/mode-readiness.svelte';
	import { myaiStore } from '$lib/state/myai.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { dispatchMode } from '$lib/state/mode-dispatch';
	import { ASSISTED_ENABLED } from '$lib/flags';
	import type { ChatMode } from '$lib/types';

	let { onchosen }: { onchosen: (mode: ChatMode) => void } = $props();

	const MODE_IDS = (
		ASSISTED_ENABLED ? (['private', 'assisted', 'myai'] as const) : (['private', 'myai'] as const)
	) satisfies readonly ChatMode[];

	// Derived, not a plain const: the names come from the dictionary and have to
	// follow a language switch.
	const LABELS = $derived({
		private: t('modes.private.name'),
		assisted: t('modes.assisted.name'),
		myai: t('modes.myai.name')
	});
	const DESCRIPTIONS = {
		private: 'modes.private.description',
		assisted: 'modes.assisted.description',
		myai: 'modes.myai.description'
	} as const;

	$effect(() => {
		llmStore.init();
		myaiStore.init();
	});

	// Same rule as the composer's picker so the two can never disagree: no
	// usable in-browser model means the honest pick is a remote one.
	const bestMode = $derived.by<ChatMode | null>(() => {
		if (llmStore.status === 'detecting') return null;
		if (llmStore.status === 'unavailable' || llmStore.tier?.id === 'lite')
			return ASSISTED_ENABLED ? 'assisted' : 'myai';
		return 'private';
	});

	/** What this mode asks of the user before it can answer. */
	function cost(id: ChatMode): string {
		if (id === 'private') {
			// No tier means the device has not been measured yet, whatever the status
			// claims. Checked rather than assumed, because the assumption printed
			// "One-time download ·" with nothing after it, on the one screen someone
			// has to make a decision from.
			if (llmStore.status === 'detecting' || !llmStore.tier) return t('modes.private.checking');
			if (llmStore.status === 'unavailable') return t('modes.private.unavailable');
			return t('onboard.cost.download', { size: llmStore.downloadLabel });
		}
		return id === 'assisted' ? t('onboard.cost.signIn') : t('onboard.cost.endpoint');
	}

	const cards = $derived(
		MODE_IDS.map((id) => ({
			id,
			label: LABELS[id],
			line: t(DESCRIPTIONS[id]),
			cost: cost(id),
			best: bestMode === id,
			blocked: modeReadiness(id).state === 'blocked'
		}))
	);

	function choose(id: ChatMode) {
		// The choice is recorded either way: it is what moves the home off this
		// screen and on to "here is what is still missing". What is NOT recorded
		// is activation — dispatchMode only calls back when the mode can answer,
		// so nobody ends up with Cloud showing as the active mode while signed
		// out. It also owns the routing, so this screen and the composer's picker
		// can no longer disagree about where a sign-in lives.
		void settingsStore.setDefaultMode(id);
		void settingsStore.markModeChosen();
		dispatchMode(id, onchosen);
	}
</script>

<!-- Two columns self-hosted, three when this build offers Assisted. Written
     out because Tailwind only emits classes it can see in the source.

     The row forms at lg, not sm. Three cards need about 1024px: at 768px the
     sm rule gave them 130px each, which clipped the "Best for this device"
     badge mid-word and wrapped every description to one word per line. A card
     whose job is to carry the facts a decision turns on cannot be 130px wide. -->
<div class="grid gap-4 sm:gap-5 {MODE_IDS.length === 3 ? 'lg:grid-cols-3' : 'sm:grid-cols-2'}">
	{#each cards as card, index (card.id)}
		<div
			class="onboard-card border-border bg-card/40 hover:border-foreground/20 relative flex flex-col gap-5 overflow-hidden rounded-2xl border p-6 text-left transition-[transform,border-color] duration-300 hover:-translate-y-0.5 sm:p-7 {card.blocked
				? 'opacity-60'
				: ''}"
			style="--enter-delay: {120 + index * 70}ms"
		>
			{#if card.best}
				<!-- One sweep of light across the recommended card as the screen
				     settles, then nothing. A loop would pull the eye forever on a
				     screen whose job is to be left. -->
				<span aria-hidden="true" class="onboard-sheen"></span>
			{/if}
			<div class="flex items-baseline justify-between gap-3">
				<span class="font-serif text-lg leading-none font-medium tracking-tight">{card.label}</span>
				{#if card.best}
					<Badge variant="secondary" class="shrink-0 text-[10px]">{t('modes.best')}</Badge>
				{/if}
			</div>
			<p class="text-muted-foreground flex-1 text-sm leading-relaxed">{card.line}</p>
			<!-- The cost sits under a hairline: it is the fact the choice turns on,
			     and a rule separates it from the description without adding a box. -->
			<p
				class="text-muted-foreground border-border/60 border-t pt-4 font-mono text-[11px] tracking-wider uppercase"
			>
				{card.cost}
			</p>
			{#if card.blocked}
				<!-- A disabled button with no explanation is a dead end on the one
				     screen someone cannot get past. -->
				<HelpLink topic={card.id === 'private' ? 'no-webgpu' : 'network'} class="self-start" />
			{:else}
				<Button
					variant={card.best ? 'default' : 'outline'}
					class="w-full"
					onclick={() => choose(card.id)}
				>
					{t('onboard.pick')}
				</Button>
			{/if}
		</div>
	{/each}
</div>

<style>
	/* One orchestrated entrance, nothing that repeats. The cards rise in turn as
	   the page settles, which reads as the interface arriving rather than as
	   decoration; anything looping would compete with the choice being asked. */
	.onboard-card {
		animation: onboard-rise 480ms cubic-bezier(0.16, 1, 0.3, 1) both;
		animation-delay: var(--enter-delay);
	}

	@keyframes onboard-rise {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}

	.onboard-sheen {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			105deg,
			transparent 35%,
			color-mix(in oklab, var(--accent-foreground) 14%, transparent) 50%,
			transparent 65%
		);
		transform: translateX(-100%);
		animation: onboard-sweep 1100ms ease-out both;
		/* After the cards have landed. */
		animation-delay: 620ms;
	}

	@keyframes onboard-sweep {
		to {
			transform: translateX(100%);
		}
	}

	/* Someone who asked their system for less motion gets the layout, instantly. */
	@media (prefers-reduced-motion: reduce) {
		.onboard-card {
			animation: none;
		}
		.onboard-sheen {
			display: none;
		}
	}
</style>

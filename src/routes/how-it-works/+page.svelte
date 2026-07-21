<script lang="ts">
	// T4 (spec 009): static per-mode data-flow explainer, à la Brave Leo.
	// O2/T3 (spec 014): pipeline schema + offline proof.
	// Reworked 2026-07: one browser frame around the whole pipeline (the frame IS
	// the privacy claim), a ledger the eye can compare row by row (subgrid), amber
	// reserved for the two cells and the one caption where data actually leaves.
	// No static dots: Private is the default state and stays undecorated.
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { t } from '$lib/i18n/index.svelte';

	const modes = $derived([
		{
			name: 'Private',
			egress: false,
			leaves: t('hiw.private.leaves'),
			stays: t('hiw.private.stays'),
			server: t('hiw.private.server')
		},
		{
			name: 'Assisted',
			egress: true,
			leaves: t('hiw.assisted.leaves'),
			stays: t('hiw.assisted.stays'),
			server: t('hiw.assisted.server')
		},
		{
			name: 'My AI',
			egress: true,
			leaves: t('hiw.myai.leaves'),
			stays: t('hiw.myai.stays'),
			server: t('hiw.myai.server')
		}
	]);

	const ingestSteps = $derived([
		t('hiw.step.document'),
		t('hiw.step.parsing'),
		t('hiw.step.chunking'),
		t('hiw.step.embeddings'),
		t('hiw.step.index')
	]);
	const askSteps = $derived([t('hiw.step.question'), t('hiw.step.search'), t('hiw.step.passages')]);
</script>

<svelte:head><title>{t('hiw.title')} · Regeste</title></svelte:head>

<div class="flex h-full flex-col">
	<header class="flex h-14 shrink-0 items-center gap-1 border-b px-4">
		<Sidebar.Trigger class="shrink-0 md:hidden" />
		<div class="min-w-0 px-1">
			<h1 class="font-display text-lg tracking-tight">{t('hiw.title')}</h1>
			<p class="text-muted-foreground text-xs">{t('hiw.subtitle')}</p>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-4xl space-y-10 px-6 py-10">
			<p class="text-foreground/90 max-w-2xl font-display text-xl leading-snug tracking-tight">
				{t('hiw.intro')}
			</p>

			<!-- The pipeline, drawn inside its actual boundary: the browser. -->
			<section aria-label={t('hiw.pipeline')}>
				<div class="bg-card/40 relative rounded-xl border border-dashed p-5 pt-7">
					<span
						class="bg-background text-muted-foreground absolute -top-2 left-4 rounded-sm px-2 font-mono text-[10px] tracking-widest uppercase"
					>
						{t('hiw.frame')}
					</span>
					<div class="space-y-4">
						<div class="flex flex-wrap items-center gap-2 text-xs">
							{#each ingestSteps as step, i (step)}
								{#if i > 0}<span class="text-muted-foreground/60">→</span>{/if}
								<span class="bg-accent rounded-md px-2.5 py-1.5">{step}</span>
							{/each}
						</div>
						<div class="flex flex-wrap items-center gap-2 text-xs">
							{#each askSteps as step, i (step)}
								{#if i > 0}<span class="text-muted-foreground/60">→</span>{/if}
								<span class="bg-accent rounded-md px-2.5 py-1.5">{step}</span>
							{/each}
							<span class="text-muted-foreground/60">→</span>
							<span class="rounded-md border px-2.5 py-1.5 font-medium">{t('hiw.step.modes')}</span>
							<span class="text-muted-foreground/60">→</span>
							<span class="bg-accent rounded-md px-2.5 py-1.5">{t('hiw.step.answer')}</span>
						</div>
					</div>
				</div>
				<!-- The single caption allowed to wear amber: it marks the one exit. -->
				<p class="text-mode-assisted mt-3 flex max-w-2xl items-start gap-1.5 px-1 text-xs">
					<ArrowUpRightIcon class="mt-0.5 size-3.5 shrink-0" />
					{t('hiw.onlyMode')}
				</p>
			</section>

			<!-- The ledger: one row per question, three answers side by side. -->
			<section
				class="grid overflow-hidden rounded-xl border md:grid-cols-3 md:grid-rows-[auto_1fr_auto_auto]"
			>
				{#each modes as mode, i (mode.name)}
					<article
						class="gap-y-5 p-5 md:row-span-4 md:grid md:grid-rows-subgrid {i > 0
							? 'border-t md:border-t-0 md:border-s'
							: ''}"
					>
						<h3 class="font-display text-xl tracking-tight">{mode.name}</h3>
						<div>
							<p
								class="{mode.egress
									? 'text-mode-assisted'
									: 'text-muted-foreground'} font-mono text-[10px] tracking-widest uppercase"
							>
								{t('hiw.whatLeaves')}
							</p>
							<p class="mt-1.5 text-sm leading-relaxed">{mode.leaves}</p>
						</div>
						<div>
							<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								{t('hiw.whatStays')}
							</p>
							<p class="text-muted-foreground mt-1.5 text-sm leading-relaxed">{mode.stays}</p>
						</div>
						<div>
							<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								{t('hiw.server')}
							</p>
							<p class="text-muted-foreground mt-1.5 text-sm leading-relaxed">{mode.server}</p>
						</div>
					</article>
				{/each}
			</section>

			<!-- T3: the offline proof (Secret Llama pattern) — the claim you can run. -->
			<section class="flex items-start gap-4 rounded-xl border p-5">
				<WifiOffIcon class="text-muted-foreground mt-1 size-5 shrink-0" />
				<div class="space-y-1">
					<h3 class="font-display text-lg tracking-tight">{t('hiw.proofTitle')}</h3>
					<p class="text-muted-foreground max-w-2xl text-sm leading-relaxed">
						{t('hiw.proofBody')}
					</p>
				</div>
			</section>

			<p class="text-muted-foreground text-xs">
				{t('hiw.footer')}
			</p>
		</div>
	</div>
</div>

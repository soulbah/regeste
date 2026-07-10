<script lang="ts">
	// T4 (spec 009): static per-mode data-flow explainer, à la Brave Leo.
	// O2/T3 (spec 014): pipeline schema + offline proof.
	// Plain claims a reader can verify against the open source.
	import { Badge } from '$lib/components/ui/badge';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { t } from '$lib/i18n/index.svelte';
	const modes = $derived([
		{
			name: 'Private',
			dot: 'bg-mode-private',
			leaves: t('hiw.private.leaves'),
			stays: t('hiw.private.stays'),
			server: t('hiw.private.server')
		},
		{
			name: 'Assisted',
			dot: 'bg-mode-assisted',
			leaves: t('hiw.assisted.leaves'),
			stays: t('hiw.assisted.stays'),
			server: t('hiw.assisted.server')
		},
		{
			name: 'My AI',
			dot: 'bg-mode-myai',
			leaves: t('hiw.myai.leaves'),
			stays: t('hiw.myai.stays'),
			server: t('hiw.myai.server')
		}
	]);
</script>

<svelte:head><title>{t('hiw.title')} · Folio</title></svelte:head>

<div class="flex h-full flex-col">
	<header class="flex h-14 shrink-0 items-center gap-1 border-b px-4">
		<Sidebar.Trigger class="shrink-0 md:hidden" />
		<div class="min-w-0 px-1">
			<h1 class="font-display text-lg tracking-tight">{t('hiw.title')}</h1>
			<p class="text-muted-foreground text-xs">{t('hiw.subtitle')}</p>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-3xl space-y-6 px-6 py-8">
			<p class="text-muted-foreground max-w-xl text-sm">
				{t('hiw.intro')}
			</p>
			<div class="grid gap-4 md:grid-cols-3">
				{#each modes as mode (mode.name)}
					<div class="space-y-3 rounded-xl border p-4">
						<p class="flex items-center gap-2 font-medium">
							<span class="size-2 rounded-full {mode.dot}"></span>
							{mode.name}
						</p>
						<div>
							<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								{t('hiw.whatLeaves')}
							</p>
							<p class="mt-1 text-sm leading-relaxed">{mode.leaves}</p>
						</div>
						<div>
							<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								{t('hiw.whatStays')}
							</p>
							<p class="mt-1 text-sm leading-relaxed">{mode.stays}</p>
						</div>
						<div>
							<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								{t('hiw.server')}
							</p>
							<p class="mt-1 text-sm leading-relaxed">{mode.server}</p>
						</div>
					</div>
				{/each}
			</div>
			<!-- O2: the pipeline, in plain boxes — everything left of the mode choice
			     runs in this browser. -->
			<div class="space-y-3 rounded-xl border p-4">
				<p class="font-medium">{t('hiw.pipeline')}</p>
				<div class="flex flex-wrap items-center gap-2 text-xs">
					{#each [t('hiw.step.document'), t('hiw.step.parsing'), t('hiw.step.chunking'), t('hiw.step.embeddings'), t('hiw.step.index')] as step, i (step)}
						{#if i > 0}<span class="text-muted-foreground">→</span>{/if}
						<span class="bg-accent rounded-md px-2 py-1">{step}</span>
					{/each}
					<Badge variant="outline" class="ml-1 gap-1 font-mono text-[10px] uppercase">
						<span class="bg-mode-private size-1.5 rounded-full"></span>
						{t('hiw.allBrowser')}
					</Badge>
				</div>
				<div class="flex flex-wrap items-center gap-2 text-xs">
					{#each [t('hiw.step.question'), t('hiw.step.search'), t('hiw.step.passages'), t('hiw.step.modes'), t('hiw.step.answer')] as step, i (step)}
						{#if i > 0}<span class="text-muted-foreground">→</span>{/if}
						<span class="rounded-md px-2 py-1 {step.includes('/') ? 'border' : 'bg-accent'}"
							>{step}</span
						>
					{/each}
				</div>
				<p class="text-muted-foreground text-xs">
					{t('hiw.onlyMode')}
				</p>
			</div>

			<!-- T3: the offline proof (Secret Llama pattern). -->
			<div class="space-y-1 rounded-xl border p-4">
				<p class="font-medium">{t('hiw.proofTitle')}</p>
				<p class="text-muted-foreground text-sm">
					{t('hiw.proofBody')}
				</p>
			</div>

			<p class="text-muted-foreground text-xs">
				{t('hiw.footer')}
			</p>
		</div>
	</div>
</div>

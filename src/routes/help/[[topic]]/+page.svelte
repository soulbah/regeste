<script lang="ts">
	// What to do when the browser gets in the way.
	//
	// Its own page, outside the (app) group, for the same reason sign-in is: you
	// arrive here because something is broken, and the app's chrome behind it
	// would offer a dozen things that are broken too. The way back is one link.
	//
	// Written as a reference rather than a wall: symptom first, because that is
	// what someone recognises, then the cause in one sentence, then the steps.
	// Every entry has an id, and every failure inside the app links straight to
	// its own — landing on a page of five problems when you have one is how a
	// help page stops being read.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { Button } from '$lib/components/ui/button';
	import AmbientWash from '$lib/components/ambient-wash.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { HELP_TOPICS } from '$lib/help-topics';

	// A route param rather than a fragment: /help/storage-blocked is a URL
	// someone can paste to a colleague, and it survives a reload. The entry
	// named is lifted; the rest stay legible below it.
	const focused = $derived(page.params.topic ?? '');
</script>

<svelte:head><title>{t('help.title')} · Regeste</title></svelte:head>

<div class="bg-background relative min-h-svh">
	<AmbientWash top="-6%" />

	<header class="relative flex h-14 items-center px-4">
		<Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" href={resolve('/chat')}>
			<ArrowLeftIcon class="size-3.5!" />
			{t('auth.back')}
		</Button>
	</header>

	<div class="relative mx-auto max-w-2xl px-6 pt-8 pb-24">
		<h1 class="font-display text-3xl tracking-tight">{t('help.title')}</h1>
		<p class="text-muted-foreground mt-2.5 text-sm leading-relaxed text-balance">
			{t('help.intro')}
		</p>

		<div class="mt-10 space-y-4">
			{#each HELP_TOPICS as topic (topic.id)}
				<section
					id={topic.id}
					class="scroll-mt-20 rounded-xl border p-5 transition-colors {focused === topic.id
						? 'border-accent-foreground/40 bg-card/60'
						: 'border-border bg-card/25'}"
				>
					<h2 class="font-display text-lg tracking-tight">{t(topic.title)}</h2>

					<p class="text-muted-foreground mt-3 font-mono text-[10px] tracking-widest uppercase">
						{t('help.symptom')}
					</p>
					<p class="mt-1 text-sm leading-relaxed">{t(topic.symptom)}</p>

					<p class="text-muted-foreground mt-4 font-mono text-[10px] tracking-widest uppercase">
						{t('help.cause')}
					</p>
					<p class="text-muted-foreground mt-1 text-sm leading-relaxed">{t(topic.cause)}</p>

					<p class="text-muted-foreground mt-4 font-mono text-[10px] tracking-widest uppercase">
						{t('help.fix')}
					</p>
					<ol class="mt-2 space-y-1.5">
						{#each topic.fix as step, index (step)}
							<li class="flex gap-2.5 text-sm leading-relaxed">
								<span class="text-muted-foreground/70 shrink-0 font-mono text-xs">
									{index + 1}
								</span>
								<span>{t(step)}</span>
							</li>
						{/each}
					</ol>
				</section>
			{/each}
		</div>

		<p class="text-muted-foreground/70 mt-10 text-xs leading-relaxed text-balance">
			{t('help.footnote')}
		</p>
	</div>
</div>

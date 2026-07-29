<script lang="ts">
	// A small library of guides, and one article per guide.
	//
	// The first version stacked all five problems as bordered cards on one page.
	// That fragments what should read as a document, and hands someone with one
	// problem a wall of four others they do not have. Cards are for things you
	// choose between; prose is for things you read.
	//
	// So it is set as an article: back link, category, headline, the symptom as
	// a lead paragraph, a rule, then cause and steps. Recognising the symptom is
	// what tells a reader they are on the right page, which is why it is the
	// lead and not a labelled field halfway down.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';
	import { HELP_TOPICS } from '$lib/help-topics';

	// A route param rather than a fragment: /help/storage-blocked is a URL
	// someone can paste to a colleague, and it survives a reload.
	const topic = $derived(HELP_TOPICS.find((entry) => entry.id === page.params.topic) ?? null);
	const others = $derived(HELP_TOPICS.filter((entry) => entry.id !== topic?.id).slice(0, 3));
</script>

<svelte:head>
	<title>{topic ? t(topic.title) : t('help.title')} · Regeste</title>
</svelte:head>

<!-- The bar and the footer come from (marketing)/+layout.svelte.
     One back link, and only from inside an article, where it means "up to the
     library". The index used to offer "Back to chat", which was a lie about
     where the reader is: most arrive from the landing or a search result, and
     some have never opened the chat. -->
{#if topic}
	<div class="mx-auto max-w-2xl px-6 pt-8">
		<Button
			variant="ghost"
			size="sm"
			class="text-muted-foreground -ml-3 gap-1.5"
			href={resolve('/(marketing)/help/[[topic]]', { topic: undefined })}
		>
			<ArrowLeftIcon class="size-3.5!" />
			{t('help.allGuides')}
		</Button>
	</div>
{/if}

{#if topic}
	<article class="mx-auto max-w-2xl px-6 pt-10 pb-28">
		<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
			{t(topic.kind)}
		</p>
		<h1 class="font-display mt-3.5 text-[2.2rem] leading-[1.15] tracking-tight text-balance">
			{t(topic.title)}
		</h1>
		<p class="text-muted-foreground mt-5 text-lg leading-relaxed text-balance">
			{t(topic.symptom)}
		</p>

		<hr class="border-border my-10" />

		<h2 class="text-base font-semibold">{t('help.cause')}</h2>
		<p class="mt-3 leading-relaxed">{t(topic.cause)}</p>

		<h2 class="mt-10 text-base font-semibold">{t('help.fix')}</h2>
		<ol class="mt-5 space-y-4">
			{#each topic.fix as step, index (step)}
				<li class="flex gap-4">
					<span
						class="bg-accent-foreground/10 text-accent-foreground mt-px flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px]"
					>
						{index + 1}
					</span>
					<span class="leading-relaxed">{t(step)}</span>
				</li>
			{/each}
		</ol>

		<hr class="border-border my-10" />

		<p class="text-muted-foreground text-sm leading-relaxed">{t('help.footnote')}</p>

		<!-- The other guides, at the end rather than alongside: someone who got
			     here with a problem reads one article, and only then wants a list. -->
		<p class="text-muted-foreground mt-14 font-mono text-[10px] tracking-widest uppercase">
			{t('help.more')}
		</p>
		<div class="mt-3 divide-y">
			{#each others as entry (entry.id)}
				<a
					href={resolve('/(marketing)/help/[[topic]]', { topic: entry.id })}
					class="group hover:text-accent-foreground flex items-center gap-4 py-3 text-sm transition-colors"
				>
					<span class="min-w-0 flex-1 truncate">{t(entry.title)}</span>
					<ArrowRightIcon
						class="text-muted-foreground size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
					/>
				</a>
			{/each}
		</div>
	</article>
{:else}
	<!-- The index: every guide, one entry each, symptom first. -->
	<div class="mx-auto max-w-2xl px-6 pt-10 pb-28">
		<h1 class="font-display text-[2.2rem] leading-[1.15] tracking-tight">{t('help.title')}</h1>
		<p class="text-muted-foreground mt-4 text-lg leading-relaxed text-balance">
			{t('help.intro')}
		</p>

		<div class="mt-12 divide-y border-t">
			{#each HELP_TOPICS as entry (entry.id)}
				<a
					href={resolve('/(marketing)/help/[[topic]]', { topic: entry.id })}
					class="group flex items-start gap-5 py-6"
				>
					<div class="min-w-0 flex-1">
						<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
							{t(entry.kind)}
						</p>
						<p class="group-hover:text-accent-foreground mt-2 font-medium transition-colors">
							{t(entry.title)}
						</p>
						<p class="text-muted-foreground mt-1.5 text-sm leading-relaxed">
							{t(entry.symptom)}
						</p>
					</div>
					<ArrowRightIcon
						class="text-muted-foreground mt-7 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
					/>
				</a>
			{/each}
		</div>

		<p class="text-muted-foreground mt-12 text-sm leading-relaxed">{t('help.footnote')}</p>
	</div>
{/if}

<script lang="ts">
	// The landing. Set like a document, because that is what the product reads:
	// left margin, serif display, mono kickers, the bracket opening each section
	// the way it opens the wordmark. Light paper by default, charcoal when the
	// OS asks.
	//
	// The screenshots are not screenshots. The hero and both feature visuals
	// embed the product's real components with fixture data, framed in a window
	// chrome and inert (aria-hidden, no pointer events): what the page shows is
	// what the app renders, at every pixel density, in both themes and both
	// languages.
	//
	// Privacy appears twice, deliberately: once in the hero subline (the fact),
	// once on the review section (the proof). Nowhere else.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import BrandMark from '$lib/components/brand-mark.svelte';
	import PrivateTurn from '$lib/components/private-turn.svelte';
	import { t, i18n } from '$lib/i18n/index.svelte';
	import { LANDING_FIXTURE } from '$lib/landing-fixture';

	const GITHUB = 'https://github.com/soulbah/regeste';

	// ?lang=fr|en overrides the detected language: a shareable localized URL,
	// and the only language control this page needs.
	$effect(() => {
		const lang = page.url.searchParams.get('lang');
		if ((lang === 'fr' || lang === 'en') && i18n.locale !== lang) i18n.locale = lang;
	});

	const fix = $derived(LANDING_FIXTURE[i18n.locale]);

	const MODES = [
		{
			name: 'modes.private.name',
			desc: 'landing.modes.private',
			fact: 'landing.modes.private.fact'
		},
		{
			name: 'modes.assisted.name',
			desc: 'landing.modes.assisted',
			fact: 'landing.modes.assisted.fact'
		},
		{ name: 'modes.myai.name', desc: 'landing.modes.myai', fact: 'landing.modes.myai.fact' }
	] as const;
</script>

<svelte:head>
	<title>Regeste</title>
	<meta name="description" content={t('landing.hero.sub')} />
</svelte:head>

{#snippet githubIcon(cls: string)}
	<svg viewBox="0 0 16 16" fill="currentColor" class={cls} aria-hidden="true">
		<path
			d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
		/>
	</svg>
{/snippet}

{#snippet kicker(index: string, id: string)}
	<p class="text-muted-foreground font-mono text-[11px] tracking-widest uppercase" {id}>
		<span class="text-accent-foreground">[</span>
		{index}
	</p>
{/snippet}

<div class="bg-background min-h-svh">
	<!-- ——— Nav ——— -->
	<header class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
		<a href={resolve('/')} class="font-display text-lg tracking-tight">
			<span class="text-accent-foreground">[</span>Regeste
		</a>
		<nav class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground max-sm:hidden"
				href={resolve('/how-it-works')}
			>
				{t('landing.nav.how')}
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground max-sm:hidden"
				href={resolve('/help/[[topic]]', { topic: undefined })}
			>
				{t('landing.nav.guides')}
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground gap-1.5"
				href={GITHUB}
				target="_blank"
				rel="noopener"
			>
				{@render githubIcon('size-4')}
				{t('landing.nav.github')}
			</Button>
			<Button size="sm" class="ml-2" href={resolve('/chat')}>{t('landing.cta')}</Button>
		</nav>
	</header>

	<!-- ——— Hero ——— -->
	<section class="mx-auto max-w-6xl px-6 pt-16 sm:pt-24">
		<div class="max-w-2xl">
			<h1
				class="land-rise font-display text-[2.6rem] leading-[1.08] tracking-tight text-balance sm:text-[3.4rem]"
			>
				{t('landing.hero.title')}
			</h1>
			<p
				class="land-rise text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed"
				style="--rise-delay: 70ms"
			>
				{t('landing.hero.sub')}
			</p>
			<div class="land-rise mt-8 flex flex-wrap items-center gap-3" style="--rise-delay: 140ms">
				<Button size="lg" href={resolve('/chat')} class="gap-2">
					{t('landing.cta')}
					<ArrowRightIcon class="size-4" />
				</Button>
				<Button
					size="lg"
					variant="outline"
					href={GITHUB}
					target="_blank"
					rel="noopener"
					class="gap-2"
				>
					{@render githubIcon('size-4')}
					{t('landing.cta.code')}
				</Button>
			</div>
			<p
				class="land-rise text-muted-foreground mt-5 font-mono text-[11px] tracking-widest uppercase"
				style="--rise-delay: 200ms"
			>
				{t('landing.hero.facts')}
			</p>
		</div>

		<!-- The product, live. -->
		<div class="land-rise mt-14 sm:mt-20" style="--rise-delay: 260ms">
			<div
				class="border-border bg-card/40 overflow-hidden rounded-2xl border shadow-xl shadow-black/5"
				aria-hidden="true"
			>
				<div class="border-border relative flex h-10 items-center border-b px-4">
					<span class="flex gap-1.5">
						{#each [0, 1, 2] as i (i)}
							<span class="bg-foreground/15 size-2.5 rounded-full"></span>
						{/each}
					</span>
					<span
						class="text-muted-foreground absolute left-1/2 -translate-x-1/2 font-mono text-[11px]"
					>
						{fix.doc}
					</span>
				</div>
				<div class="pointer-events-none p-6 select-none sm:p-10">
					<div class="mx-auto max-w-3xl space-y-6">
						<div class="flex justify-end">
							<div class="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
								{fix.question}
							</div>
						</div>
						<PrivateTurn
							content={fix.answer}
							citations={fix.citations}
							excerpts={fix.excerpts}
							mode="private"
						/>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ——— Modes ——— -->
	<section class="mx-auto max-w-6xl px-6 pt-24 sm:pt-32">
		{@render kicker('01', 'modes')}
		<h2 class="font-display mt-4 text-3xl leading-tight tracking-tight text-balance">
			{t('landing.modes.title')}
		</h2>
		<p class="text-muted-foreground mt-3 max-w-xl leading-relaxed">{t('landing.modes.sub')}</p>

		<div class="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-3">
			{#each MODES as mode (mode.name)}
				<div class="border-border border-t pt-5">
					<h3 class="font-medium">{t(mode.name)}</h3>
					<p class="text-muted-foreground mt-2 text-sm leading-relaxed">{t(mode.desc)}</p>
					<p class="text-muted-foreground mt-4 font-mono text-[11px] leading-relaxed">
						{t(mode.fact)}
					</p>
				</div>
			{/each}
		</div>

		<Button
			variant="ghost"
			size="sm"
			class="text-muted-foreground mt-8 -ml-3 gap-1.5"
			href={resolve('/how-it-works')}
		>
			{t('landing.modes.link')}
			<ArrowRightIcon class="size-3.5" />
		</Button>
	</section>

	<!-- ——— Citations ——— -->
	<section class="mx-auto max-w-6xl px-6 pt-24 sm:pt-32">
		<div class="grid items-center gap-12 lg:grid-cols-2">
			<div>
				{@render kicker('02', 'citations')}
				<h2 class="font-display mt-4 text-3xl leading-tight tracking-tight text-balance">
					{t('landing.cite.title')}
				</h2>
				<p class="text-muted-foreground mt-3 max-w-md leading-relaxed">{t('landing.cite.sub')}</p>
			</div>
			<!-- The strip and the passage it opens, in the product's own dress. -->
			<div class="pointer-events-none select-none" aria-hidden="true">
				<div class="flex flex-wrap gap-1.5">
					{#each fix.citations as c, i (i)}
						<span
							class="border-border bg-card inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs"
						>
							<span class="text-accent-foreground font-mono text-[10px] font-semibold">{i + 1}</span
							>
							<span class="max-w-40 truncate">{c.documentName}</span>
							<span class="text-muted-foreground font-mono text-[10px]">{c.locator}</span>
						</span>
					{/each}
				</div>
				<div class="border-border bg-card mt-3 rounded-xl border p-4 shadow-lg shadow-black/5">
					<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
						{fix.doc} · {fix.citations[0].locator}
					</p>
					<p class="mt-2.5 text-sm leading-relaxed">
						{fix.citations[0].snippet.split(fix.highlight)[0]}<span
							class="bg-accent rounded-[3px] px-0.5">{fix.highlight}</span
						>{fix.citations[0].snippet.split(fix.highlight)[1] ?? ''}
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ——— Review before sending ——— -->
	<section class="mx-auto max-w-6xl px-6 pt-24 sm:pt-32">
		<div class="grid items-center gap-12 lg:grid-cols-2">
			<!-- Panel replica: same primitives, fixture rows, one passage unticked
			     so the exclusion is visible rather than described. -->
			<div class="pointer-events-none select-none max-lg:order-2" aria-hidden="true">
				<div
					class="border-border bg-card mx-auto max-w-sm rounded-xl border shadow-lg shadow-black/5"
				>
					<div class="border-border border-b p-4">
						<p class="text-sm font-medium">{t('presend.title')}</p>
						<p class="text-muted-foreground mt-0.5 text-xs">{fix.presendQ}</p>
					</div>
					<div class="space-y-2 p-3">
						<p class="text-muted-foreground px-1 font-mono text-[10px] tracking-widest uppercase">
							{t('presend.passages')}
						</p>
						{#each fix.presendHits as hit, i (i)}
							<div
								class="flex items-start gap-3 rounded-md border p-2.5 {i === 2 ? 'opacity-40' : ''}"
							>
								<Checkbox checked={i !== 2} tabindex={-1} />
								<span class="min-w-0">
									<span class="text-muted-foreground block font-mono text-[10px] uppercase">
										{fix.doc} · {hit.heading}
									</span>
									<span class="mt-0.5 block text-xs leading-relaxed">
										{hit.text.slice(0, 110)}…
									</span>
								</span>
							</div>
						{/each}
					</div>
					<div class="border-border flex items-center justify-between gap-3 border-t p-4">
						<span class="text-muted-foreground font-mono text-[10px]">
							{t('presend.count', {
								selected: '2',
								total: '3',
								kb: i18n.locale === 'fr' ? '0,8' : '0.8'
							})}
						</span>
						<Button size="sm" tabindex={-1} class="gap-1.5">
							<CheckIcon class="size-3.5" />
							{t('common.send')}
						</Button>
					</div>
				</div>
			</div>
			<div class="max-lg:order-1">
				{@render kicker('03', 'review')}
				<h2 class="font-display mt-4 text-3xl leading-tight tracking-tight text-balance">
					{t('landing.review.title')}
				</h2>
				<p class="text-muted-foreground mt-3 max-w-md leading-relaxed">{t('landing.review.sub')}</p>
			</div>
		</div>
	</section>

	<!-- ——— Open source ——— -->
	<section class="mx-auto max-w-6xl px-6 pt-24 pb-8 sm:pt-32">
		<div class="border-border border-t pt-16 text-center sm:pt-20">
			<div class="flex justify-center"><BrandMark size={40} /></div>
			<h2 class="font-display mt-6 text-3xl leading-tight tracking-tight text-balance">
				{t('landing.oss.title')}
			</h2>
			<p class="text-muted-foreground mx-auto mt-3 max-w-md leading-relaxed text-balance">
				{t('landing.oss.sub')}
			</p>
			<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
				<Button size="lg" href={resolve('/chat')} class="gap-2">
					{t('landing.cta')}
					<ArrowRightIcon class="size-4" />
				</Button>
				<Button
					size="lg"
					variant="outline"
					href={GITHUB}
					target="_blank"
					rel="noopener"
					class="gap-2"
				>
					{@render githubIcon('size-4')}
					{t('landing.oss.cta')}
				</Button>
			</div>
		</div>
	</section>

	<!-- ——— Footer ——— -->
	<footer class="mx-auto max-w-6xl px-6 pt-16 pb-10">
		<div class="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-6">
			<p class="text-muted-foreground text-sm">
				<span class="font-display text-foreground text-base tracking-tight">
					<span class="text-accent-foreground">[</span>Regeste
				</span>
				<span class="mx-2">·</span>
				{t('landing.footer.tagline')}
			</p>
			<nav class="flex items-center gap-1">
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground"
					href={resolve('/how-it-works')}
				>
					{t('landing.nav.how')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground"
					href={resolve('/help/[[topic]]', { topic: undefined })}
				>
					{t('landing.nav.guides')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground gap-1.5"
					href={GITHUB}
					target="_blank"
					rel="noopener"
				>
					{@render githubIcon('size-4')}
					{t('landing.nav.github')}
				</Button>
			</nav>
		</div>
	</footer>
</div>

<style>
	/* One orchestrated reveal on load; nothing animates after it. */
	.land-rise {
		animation: land-rise 640ms cubic-bezier(0.16, 1, 0.3, 1) both;
		animation-delay: var(--rise-delay, 0ms);
	}

	@keyframes land-rise {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.land-rise {
			animation: none;
		}
	}
</style>

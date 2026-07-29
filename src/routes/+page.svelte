<script lang="ts">
	// The landing. Set like a document, because that is what the product reads:
	// left margin, serif display, mono kickers, the bracket opening each section
	// the way it opens the wordmark. Light paper by default, charcoal when the
	// OS asks.
	//
	// The hero runs the product live in the DOM (landing-demo.svelte) — the same
	// choice every reference site makes, and the only way UI text stays sharp at
	// every pixel density. The chapters below show stills photographed off the
	// capture stage (/dev/landing-stage): the real panels, a real lease PDF put
	// through the real pipeline and opened by the real viewer on the highlighted
	// clause. Regenerate with .benchmark-corpus/scripts/landing-capture.mjs.
	//
	// Composition follows the reference grammar (Linear): a chapter is a header
	// row, one wide capture, then two mono footnotes; the modes section breathes
	// between chapters without a capture. Privacy appears twice, deliberately:
	// the hero fact and the review proof. Nowhere else.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { mode } from 'mode-watcher';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Button } from '$lib/components/ui/button';
	import BrandMark from '$lib/components/brand-mark.svelte';
	import LandingDemo from '$lib/components/landing-demo.svelte';
	import LandingPanel from '$lib/components/landing-panel.svelte';
	import { t, i18n } from '$lib/i18n/index.svelte';
	import { reveal, revealStagger } from '$lib/landing-motion';

	const GITHUB = 'https://github.com/soulbah/regeste';

	// Exactly what the file picker accepts: .pdf, .docx, .md, .txt — a fifth
	// badge would be a promise the app does not keep. Hand-placed and lightly
	// rotated rather than gridded: a grid rebuilds the feature row this replaces.
	const FORMATS = [
		{ ext: 'PDF', file: 'pdf', x: 2, y: 2, rot: -6 },
		{ ext: 'DOCX', file: 'word', x: 47, y: 14, rot: 5 },
		{ ext: 'MD', file: 'markdown', x: 8, y: 46, rot: 4 },
		{ ext: 'TXT', file: 'document', x: 52, y: 58, rot: -4 }
	] as const;

	// ?lang=fr|en overrides the detected language: a shareable localized URL,
	// and the only language control this page needs.
	$effect(() => {
		const lang = page.url.searchParams.get('lang');
		if ((lang === 'fr' || lang === 'en') && i18n.locale !== lang) i18n.locale = lang;
	});

	const scheme = $derived(mode.current === 'dark' ? 'dark' : 'light');

	// Sticky nav: the border and blur arrive with the first scroll, the market
	// convention for landings whose hero starts flush under the bar.
	let scrolled = $state(false);
	$effect(() => {
		const on = () => (scrolled = window.scrollY > 8);
		on();
		window.addEventListener('scroll', on, { passive: true });
		return () => window.removeEventListener('scroll', on);
	});

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

	const CHAPTERS = [
		{
			index: '02',
			id: 'citations',
			scene: 'cite',
			title: 'landing.cite.title',
			sub: 'landing.cite.sub',
			notes: ['landing.cite.f1', 'landing.cite.f2']
		},
		{
			index: '03',
			id: 'review',
			panel: 'review',
			title: 'landing.review.title',
			sub: 'landing.review.sub',
			notes: ['landing.review.f1', 'landing.review.f2']
		},
		{
			index: '04',
			id: 'record',
			panel: 'record',
			title: 'landing.wais.title',
			sub: 'landing.wais.sub',
			notes: ['landing.wais.f1', 'landing.wais.f2']
		}
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

<!-- A capture of the real application, framed in window chrome. -->
{#snippet capture(scene: string, alt: string, eager: boolean)}
	<div class="border-border bg-card/40 overflow-hidden rounded-2xl border shadow-xl shadow-black/5">
		<img
			src={`/landing/${scene}-${i18n.locale}-${scheme}.webp`}
			{alt}
			class="block w-full"
			loading={eager ? 'eager' : 'lazy'}
			decoding="async"
		/>
	</div>
{/snippet}

<div class="bg-background min-h-svh">
	<!-- ——— Nav ——— -->
	<header
		class="sticky top-0 z-40 transition-[background-color,border-color] duration-300 {scrolled
			? 'bg-background/85 border-border border-b backdrop-blur-md'
			: 'border-b border-transparent'}"
	>
		<div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
			<a href={resolve('/')} class="font-display text-2xl tracking-tight">
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
		</div>
	</header>

	<!-- ——— Hero ——— -->
	<section class="mx-auto max-w-7xl px-6 pt-16 sm:pt-24">
		<div class="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
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

			<!-- The formats this reads, as a constellation rather than a row of
			     labelled cards: a visitor recognises the extensions instantly, and
			     the hero keeps its right side alive without a second heading. -->
			<div
				class="land-rise relative hidden h-72 lg:block"
				style="--rise-delay: 300ms"
				aria-hidden="true"
			>
				{#each FORMATS as f, i (f.ext)}
					<span
						class="border-border bg-card absolute flex w-32 flex-col items-start gap-3 rounded-2xl border p-4 shadow-lg shadow-black/5"
						style="left:{f.x}%; top:{f.y}%; --float-delay:{i * 0.9}s; rotate:{f.rot}deg"
					>
						<img src="/landing/formats/{f.file}.svg" alt="" width="34" height="34" />
						<span class="font-mono text-[11px] tracking-wide">{f.ext}</span>
					</span>
				{/each}
			</div>
		</div>

		<div class="land-rise mt-14 sm:mt-20" style="--rise-delay: 260ms">
			<LandingDemo />
		</div>
	</section>

	<!-- ——— Modes: the chapter break, no capture. ——— -->
	<section class="mx-auto max-w-7xl px-6 pt-24 sm:pt-32">
		<div use:reveal>
			{@render kicker('01', 'modes')}
			<h2 class="font-display mt-4 text-3xl leading-tight tracking-tight text-balance">
				{t('landing.modes.title')}
			</h2>
			<p class="text-muted-foreground mt-3 max-w-xl leading-relaxed">{t('landing.modes.sub')}</p>
		</div>

		<div class="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-3" use:revealStagger={{ step: 0.1 }}>
			{#each MODES as m (m.name)}
				<div class="border-border border-t pt-5">
					<h3 class="font-medium">{t(m.name)}</h3>
					<p class="text-muted-foreground mt-2 text-sm leading-relaxed">{t(m.desc)}</p>
					<p class="text-muted-foreground mt-4 font-mono text-[11px] leading-relaxed">
						{t(m.fact)}
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

	<!-- ——— Chapters: header row, one wide capture, two footnotes. ——— -->
	{#each CHAPTERS as chapter (chapter.id)}
		<section class="mx-auto max-w-7xl px-6 pt-24 sm:pt-32">
			<div class="grid items-end gap-x-12 gap-y-4 lg:grid-cols-2" use:reveal>
				<div>
					{@render kicker(chapter.index, chapter.id)}
					<h2 class="font-display mt-4 text-3xl leading-tight tracking-tight text-balance">
						{t(chapter.title)}
					</h2>
				</div>
				<p class="text-muted-foreground max-w-xl leading-relaxed lg:justify-self-end">
					{t(chapter.sub)}
				</p>
			</div>

			<div class="mt-10" use:reveal={{ delay: 0.1 }}>
				{#if 'panel' in chapter}
					<LandingPanel kind={chapter.panel} />
				{:else}
					{@render capture(chapter.scene, t(chapter.title), false)}
				{/if}
			</div>

			<div class="mt-6 grid gap-x-10 gap-y-3 sm:grid-cols-2">
				{#each chapter.notes as note (note)}
					<p class="text-muted-foreground font-mono text-[11px] leading-relaxed">
						<span class="text-accent-foreground">[</span>
						{t(note)}
					</p>
				{/each}
			</div>
		</section>
	{/each}

	<!-- ——— Open source ——— -->
	<section class="mx-auto max-w-7xl px-6 pt-24 pb-8 sm:pt-32">
		<div class="border-border border-t pt-16 text-center sm:pt-20" use:reveal>
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
	<footer class="mx-auto max-w-7xl px-6 pt-16 pb-10">
		<div class="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-6">
			<p class="text-muted-foreground text-sm">
				<span class="font-display text-foreground text-base tracking-tight">
					<span class="text-accent-foreground">[</span>Regeste
				</span>
				<span class="mx-2">·</span>
				{t('landing.footer.copyright')}
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
	/* One orchestrated reveal on load; scroll reveals reuse the same rise. */
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

	/* A slow drift, each tile on its own offset, so the group breathes without
	   ever drawing the eye away from the headline. */
	.land-rise span {
		animation: land-float 7s ease-in-out infinite both;
		animation-delay: var(--float-delay, 0s);
	}

	@keyframes land-float {
		50% {
			transform: translateY(-7px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.land-rise,
		.land-rise span {
			animation: none;
		}
	}
</style>

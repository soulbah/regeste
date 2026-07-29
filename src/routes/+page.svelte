<script lang="ts">
	// The landing. Set like a document, because that is what the product reads:
	// left margin, serif display, mono kickers, the bracket opening each section
	// the way it opens the wordmark. Light paper by default, charcoal when the
	// OS asks.
	//
	// The hero runs the product live in the DOM (landing-demo.svelte) — the same
	// choice every reference site makes, and the only way UI text stays sharp at
	// every pixel density.
	//
	// Three chapters, deliberately three different shapes, because four sections
	// built from one template is what made the middle read as filler: an inverted
	// full-bleed band holding a drawing you operate, then contained text beside a
	// picture cropped by the viewport, then a margin column beside a stacked
	// dossier. Tall, short, tall.
	//
	// One line grammar ties them together: a solid hairline is inside the machine,
	// a dashed one is a crossing, a bordered rectangle with a mono header rail is
	// a room. Privacy is stated twice and nowhere else — the hero fact, and the
	// boundary in [ 01 where it is the whole message.
	//
	// The one still left (chapter 02) comes off the capture stage
	// (/dev/landing-stage): a real lease PDF put through the real pipeline and
	// opened by the real viewer on the highlighted clause. Regenerate with
	// .benchmark-corpus/scripts/landing-capture.mjs. It stays a still because a
	// live citation click needs the local database, which this page must not open.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { mode } from 'mode-watcher';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Button } from '$lib/components/ui/button';
	import BrandMark from '$lib/components/brand-mark.svelte';
	import LandingDemo from '$lib/components/landing-demo.svelte';
	import LandingModes from '$lib/components/landing-modes.svelte';
	import LandingDossier from '$lib/components/landing-dossier.svelte';
	import { t, i18n } from '$lib/i18n/index.svelte';
	import { reveal } from '$lib/landing-motion';

	const GITHUB = 'https://github.com/soulbah/regeste';

	const CITE_NOTES = ['landing.cite.f1', 'landing.cite.f2'] as const;

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

	<!-- ——— [ 01 — the drawing, on an inverted band. ———
	     The one full-bleed moment on the page. In light mode the band carries the
	     `dark` class, so every token inside resolves to the dark scope with no
	     per-element work; in dark mode it would vanish against the page, so it
	     becomes the card surface between two hairlines instead. -->
	<section
		class={scheme === 'light'
			? 'dark bg-background text-foreground mt-24 py-20 sm:mt-32 sm:py-28'
			: 'bg-card border-border mt-24 border-y py-20 sm:mt-32 sm:py-28'}
	>
		<div class="mx-auto max-w-7xl px-6">
			<div class="grid items-end gap-x-12 gap-y-4 lg:grid-cols-2" use:reveal>
				<div>
					{@render kicker('01', 'modes')}
					<h2 class="font-display mt-4 text-3xl leading-tight tracking-tight text-balance">
						{t('landing.modes.title')}
					</h2>
				</div>
				<p class="text-muted-foreground max-w-xl leading-relaxed lg:justify-self-end">
					{t('landing.modes.sub')}
				</p>
			</div>

			<div class="mt-12" use:reveal={{ delay: 0.1 }}>
				<LandingModes />
			</div>
		</div>
	</section>

	<!-- ——— [ 02 — the plate that runs off the page. ———
	     Contained text, escaping picture, weight hard right: maximum contrast with
	     the symmetric band above. The footnotes move into the text column, because
	     a two-across row of footnotes under every picture is a third of why the
	     page read as a template. -->
	<section class="overflow-x-clip pt-24 sm:pt-28">
		<div
			class="mx-auto grid max-w-7xl items-center gap-y-10 px-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-x-14 xl:grid-cols-[26rem_minmax(0,1fr)]"
		>
			<div use:reveal>
				{@render kicker('02', 'citations')}
				<h2 class="font-display mt-4 text-3xl leading-tight tracking-tight text-balance">
					{t('landing.cite.title')}
				</h2>
				<p class="text-muted-foreground mt-3 leading-relaxed">{t('landing.cite.sub')}</p>

				<div class="border-border mt-8 space-y-3 border-t pt-6">
					{#each CITE_NOTES as note (note)}
						<p class="text-muted-foreground font-mono text-[11px] leading-relaxed">
							<span class="text-accent-foreground">[</span>
							{t(note)}
						</p>
					{/each}
				</div>

				<!-- The leader points at the picture, not at a pixel inside it, so it
				     survives both locales and both schemes. -->
				<div class="mt-8 hidden items-center gap-3 lg:-mr-14 lg:flex" aria-hidden="true">
					<span
						class="border-border text-accent-foreground rounded-md border px-2 py-0.5 font-mono text-[11px]"
					>
						[1]
					</span>
					<span class="border-border h-px flex-1 border-t"></span>
				</div>
			</div>

			<div class="lg:mr-[max(calc((1232px-100vw)/2),-8rem)]" use:reveal={{ delay: 0.1 }}>
				<!-- Bordered on three sides only. That single square corner is what
				     says "cropped by the page" rather than "mistake". -->
				<div
					class="border-border bg-card/40 overflow-hidden rounded-l-2xl border-y border-l shadow-xl shadow-black/5 max-lg:rounded-2xl max-lg:border-r"
				>
					<img
						src={`/landing/cite-${i18n.locale}-${scheme}.webp`}
						alt={t('landing.cite.title')}
						class="block w-full lg:w-[52rem] lg:max-w-none xl:w-[68rem]"
						loading="lazy"
						decoding="async"
					/>
				</div>
				<p class="text-muted-foreground mt-3 font-mono text-[10px] tracking-widest uppercase">
					{t('landing.cite.fig')}
				</p>
			</div>
		</div>
	</section>

	<!-- ——— [ 03 — the dossier. Two moments of one question, stacked. ——— -->
	<section class="mx-auto max-w-7xl px-6 pt-32 sm:pt-40" use:reveal>
		<LandingDossier />
	</section>

	<!-- ——— The foot: open source, then the footer, on one inverted band. ———
	     Inverted for the same reason the closing band is dark on every reference
	     page: the page needs a full stop, and ink is the only one available on
	     paper. The footer comes inside it, because ending the CTA on ink and then
	     switching back to paper for six links puts a seam two centimetres from the
	     bottom of the page. -->
	<div
		class={scheme === 'light'
			? 'dark bg-background text-foreground mt-24 sm:mt-32'
			: 'bg-card border-border mt-24 border-t sm:mt-32'}
	>
		<section class="mx-auto max-w-7xl px-6 pt-20 pb-8 sm:pt-28">
			<div class="text-center" use:reveal>
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

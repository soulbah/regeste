<script lang="ts">
	// The chrome every marketing page shares: the sticky bar, the closing CTA and
	// the footer.
	//
	// It exists because /how-it-works and /help used to open with a "Back to chat"
	// button and end in nothing. That button was a lie about where the reader is:
	// most arrive from the landing, or from a search result, having never seen the
	// chat, and it sent them somewhere they had not been. These are pages of the
	// marketing site, so they get the site's bar and the site's footer, and the way
	// back is the wordmark, like anywhere else on the web.
	//
	// The closing band is inverted in light mode: the page needs a full stop, and
	// ink is the only one available on paper. The footer sits inside it, because
	// ending on ink and switching back to paper for six links puts a seam two
	// centimetres from the bottom.
	import { resolve } from '$app/paths';
	import {
		guidesHref,
		howItWorksHref,
		landingHref,
		privacyHref
	} from '$lib/marketing-links.svelte';
	import { page } from '$app/state';
	import { mode } from 'mode-watcher';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Button } from '$lib/components/ui/button';
	import BrandMark from '$lib/components/brand-mark.svelte';
	import GithubIcon from '$lib/components/github-icon.svelte';
	import { t, i18n, browserLocale } from '$lib/i18n/index.svelte';
	import { reveal } from '$lib/landing-motion';
	import { GITHUB, LICENSE_DOC } from '$lib/links';
	import { NEW_TAB } from '$lib/external-page';
	import { WEB_ANALYTICS_TOKEN } from '$lib/analytics';

	let { children } = $props();

	// Synchronously, in the script body, not in an $effect: an effect never runs on
	// the server, which is exactly how every page came to be rendered in English
	// whatever its URL said. The body runs at the top of the render and Svelte's SSR
	// render has no await inside it, so a request cannot be interleaved with another
	// of a different language even though the dictionary is one module instance.
	// Read from page.data rather than the data prop: the prop read is flagged
	// as a local-only capture by the compiler, and the value is identical here
	// (this layout is the only loader on the route tree).
	i18n.locale = page.data.locale;
	$effect(() => {
		i18n.locale = page.data.locale;
	});

	// This page at its French address. Every branch goes through resolve(), so the
	// router owns the URL shape: hand-building "/fr" + pathname is how a link survives
	// a route rename and starts 404ing in silence.
	const frHref = $derived.by(() => {
		const id = page.route.id;
		if (id?.endsWith('/how-it-works')) return howItWorksHref('fr');
		if (id?.endsWith('/privacy')) return privacyHref('fr');
		if (id?.includes('/help/')) return guidesHref(page.params.topic, 'fr');
		return landingHref('fr');
	});

	// No language switch in the bar. The machine already knows which language its
	// owner reads, and a page nobody has read yet is the worst moment to ask: the
	// switch sat next to the one button that matters, and it was the only control
	// there that made the reader do the app's arithmetic for it.
	//
	// So a French browser on an English address is carried across once, replacing
	// the entry so Back does not bounce. Never the reverse: /fr is an address
	// somebody chose and shared, and an English machine opening it is reading
	// French on purpose. ?lang=fr was the old switch and those links are already
	// out there, so they land here too.
	//
	// It happens in the browser because it can happen nowhere else: these pages are
	// prerendered, served straight off the asset store, and no server sees the
	// request to read its Accept-Language.
	$effect(() => {
		if (page.data.locale === 'fr') return;
		if (page.url.searchParams.get('lang') !== 'fr' && browserLocale() !== 'fr') return;
		location.replace(frHref);
	});

	const scheme = $derived(mode.current === 'dark' ? 'dark' : 'light');

	// The border and blur arrive with the first scroll, the market convention for
	// pages whose content starts flush under the bar.
	let scrolled = $state(false);
	$effect(() => {
		const on = () => (scrolled = window.scrollY > 8);
		on();
		window.addEventListener('scroll', on, { passive: true });
		return () => window.removeEventListener('scroll', on);
	});
</script>

<svelte:head>
	{#if WEB_ANALYTICS_TOKEN}
		<script
			type="module"
			src="https://static.cloudflareinsights.com/beacon.min.js"
			data-cf-beacon={`{"token": "${WEB_ANALYTICS_TOKEN}"}`}
		></script>
	{/if}
</svelte:head>

<!-- overflow-x-clip, not auto: the chapters mount the app's own 448px panels and
     the trust boundary runs a rule to both viewport edges, so on a narrow phone
     something is always wider than the screen. Clipping keeps the document from
     scrolling sideways; clip rather than hidden so it creates no scroll container
     and position:sticky on the header keeps working. -->
<div class="bg-background min-h-svh overflow-x-clip">
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
					href={howItWorksHref()}
				>
					{t('landing.nav.how')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground max-sm:hidden"
					href={guidesHref()}
				>
					{t('landing.nav.guides')}
				</Button>
				<!-- The label goes, the mark stays. Two links were already hidden below sm
				     and this one still overflowed the viewport by 10px at 375px, which is
				     an iPhone SE: the page scrolled sideways. An icon-only link needs its
				     name for assistive technology, hence the aria-label. -->
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground gap-1.5 max-sm:px-2"
					href={GITHUB}
					target="_blank"
					rel="noopener"
					aria-label={t('landing.nav.github')}
				>
					<GithubIcon />
					<span class="max-sm:hidden">{t('landing.nav.github')}</span>
				</Button>
				<Button size="sm" class="ml-2" href={resolve('/chat')}>{t('landing.cta')}</Button>
			</nav>
		</div>
	</header>

	<main>{@render children()}</main>

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
						<GithubIcon />
						{t('landing.oss.cta')}
					</Button>
				</div>
			</div>
		</section>

		<!-- Footer links carry the full foreground, not the muted token. Muted grey on
		     the light surface measures 2.64:1 against the 4.5 required, and the inverted
		     band cannot be relied on to be there: an accessibility checker sampled this
		     footer in its light state and was right to fail it. -->
		<footer class="mx-auto max-w-7xl px-6 pt-16 pb-10">
			<div class="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-6">
				<p class="text-foreground/90 text-sm">
					<span class="font-display text-foreground text-base tracking-tight">
						<span class="text-accent-foreground">[</span>Regeste
					</span>
					<span class="mx-2">·</span>
					{t('landing.footer.copyright')}
					<span class="mx-2">·</span>
					<!-- A licence name is a term of art, and printing one without a way to
					     look it up asks the reader to already know what they are allowed to
					     do with this code. h-auto p-0 so it sits on the line rather than
					     becoming a third control in a row of two. -->
					<Button
						variant="link"
						class="text-foreground/90 hover:text-foreground h-auto p-0 text-sm underline-offset-4"
						href={LICENSE_DOC}
						{...NEW_TAB}
					>
						{t('landing.footer.license')}
					</Button>
				</p>
				<!-- flex-wrap, or the page's clip cuts these off rather than the row folding.
				     Four French labels are 483px, wider than any phone, and the links are
				     the whole point of a footer. -->
				<nav class="flex flex-wrap items-center gap-1">
					<Button variant="ghost" size="sm" class="text-foreground/90" href={howItWorksHref()}>
						{t('landing.nav.how')}
					</Button>
					<Button variant="ghost" size="sm" class="text-foreground/90" href={guidesHref()}>
						{t('landing.nav.guides')}
					</Button>
					<Button variant="ghost" size="sm" class="text-foreground/90" href={privacyHref()}>
						{t('policy.title')}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="text-foreground/90 gap-1.5"
						href={GITHUB}
						target="_blank"
						rel="noopener"
					>
						<GithubIcon />
						{t('landing.nav.github')}
					</Button>
				</nav>
			</div>
		</footer>
	</div>
</div>

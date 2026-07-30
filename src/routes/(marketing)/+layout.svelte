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
	import { page } from '$app/state';
	import { mode } from 'mode-watcher';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Button } from '$lib/components/ui/button';
	import BrandMark from '$lib/components/brand-mark.svelte';
	import GithubIcon from '$lib/components/github-icon.svelte';
	import { t, i18n } from '$lib/i18n/index.svelte';
	import { reveal } from '$lib/landing-motion';
	import { GITHUB } from '$lib/links';

	let { children } = $props();

	// ?lang=fr|en overrides the detected language: a shareable localized URL, and
	// the only language control these pages need.
	$effect(() => {
		const lang = page.url.searchParams.get('lang');
		if ((lang === 'fr' || lang === 'en') && i18n.locale !== lang) i18n.locale = lang;
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
					href={resolve('/how-it-works')}
				>
					{t('landing.nav.how')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground max-sm:hidden"
					href={resolve('/(marketing)/help/[[topic]]', { topic: undefined })}
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

	{@render children()}

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
				</p>
				<!-- flex-wrap, or the page's clip cuts these off rather than the row folding.
				     Four French labels are 483px, wider than any phone, and the links are
				     the whole point of a footer. -->
				<nav class="flex flex-wrap items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						class="text-foreground/90"
						href={resolve('/how-it-works')}
					>
						{t('landing.nav.how')}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="text-foreground/90"
						href={resolve('/(marketing)/help/[[topic]]', { topic: undefined })}
					>
						{t('landing.nav.guides')}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="text-foreground/90"
						href={resolve('/(marketing)/privacy')}
					>
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

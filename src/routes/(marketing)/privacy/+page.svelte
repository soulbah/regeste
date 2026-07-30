<script lang="ts">
	// The privacy policy, set as an article rather than a wall of clauses.
	//
	// Google requires this URL to publish an OAuth consent screen, which is why it
	// exists now, but the content is not compliance filler: every claim was read
	// off the code. The device section comes from the fact that no table in
	// src/lib/server/db/schema.ts holds content. The cloud section comes from the
	// log line at api/assisted/+server.ts, which prints counters and a truncated
	// account id and nothing else. The analytics section comes from there being no
	// such dependency in package.json and no third-party script in app.html.
	//
	// The IP address and browser identification on a session row are disclosed
	// because they are there (schema.ts:23-24). A policy that omits them to sound
	// cleaner is simply false, and the one thing this page cannot afford is to be
	// caught out by someone reading the schema it points at.
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/state';
	import { i18n } from '$lib/i18n/index.svelte';
	import { privacySchema } from '$lib/structured-data';
	import PageMeta from '$lib/components/page-meta.svelte';
	import GithubIcon from '$lib/components/github-icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { CONTACT_EMAIL, GITHUB } from '$lib/links';

	const SECTIONS = ['device', 'server', 'cloud', 'signin', 'models', 'tracking', 'delete'] as const;
</script>

<PageMeta
	title={t('policy.title')}
	description={t('policy.intro')}
	jsonLd={privacySchema(page.url.origin, t, i18n.locale)}
/>

<article class="mx-auto max-w-2xl px-6 pt-14 pb-8">
	<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
		{t('policy.updated')}
	</p>
	<h1 class="font-display mt-4 text-[2.4rem] leading-[1.1] tracking-tight">{t('policy.title')}</h1>
	<p class="text-muted-foreground mt-5 text-lg leading-relaxed text-balance">
		{t('policy.intro')}
	</p>

	<div class="mt-12 space-y-10">
		{#each SECTIONS as key (key)}
			<section>
				<h2 class="font-display border-border border-t pt-6 text-2xl tracking-tight">
					{t(`policy.${key}.title` as Parameters<typeof t>[0])}
				</h2>
				<p class="mt-3.5 leading-relaxed">
					{t(`policy.${key}.body` as Parameters<typeof t>[0])}
				</p>
			</section>
		{/each}

		<section>
			<h2 class="font-display border-border border-t pt-6 text-2xl tracking-tight">
				{t('policy.contact.title')}
			</h2>
			<p class="mt-3.5 leading-relaxed">{t('policy.contact.body')}</p>
			<!-- The address printed, not hidden behind a word: mailto fails silently
			     with no mail client registered, and on this page of all pages a dead
			     end would be the wrong impression to leave. -->
			<p class="mt-2">
				<a href={`mailto:${CONTACT_EMAIL}`} class="text-accent-foreground font-mono text-sm">
					{CONTACT_EMAIL}
				</a>
			</p>
		</section>
	</div>

	<!-- The claim above is checkable, so the check is one click away. -->
	<div class="border-border mt-12 border-t pt-6">
		<p class="text-muted-foreground text-sm leading-relaxed">{t('policy.source')}</p>
		<Button
			variant="outline"
			size="sm"
			class="mt-4 gap-2"
			href={GITHUB}
			target="_blank"
			rel="noopener"
		>
			<GithubIcon />
			{t('landing.oss.cta')}
		</Button>
	</div>
</article>

<script lang="ts">
	// The mode is the only variable in the flow, so it is the only control on the
	// page. The drawing it drives lives in $lib/components/data-flow.svelte, which
	// the landing renders too.
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { Button } from '$lib/components/ui/button';
	import DataFlow from '$lib/components/data-flow.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { ASSISTED_ENABLED } from '$lib/flags';
	import type { ChatMode } from '$lib/types';

	const MODES = (
		ASSISTED_ENABLED ? (['private', 'assisted', 'myai'] as const) : (['private', 'myai'] as const)
	) satisfies readonly ChatMode[];

	let mode = $state<ChatMode>('private');

	const NAMES = $derived({
		private: t('modes.private.name'),
		assisted: t('modes.assisted.name'),
		myai: t('modes.myai.name')
	});

	const detail = $derived({
		stays: t(`hiw.${mode}.stays` as Parameters<typeof t>[0]),
		server: t(`hiw.${mode}.server` as Parameters<typeof t>[0])
	});
</script>

<svelte:head><title>{t('hiw.title')} · Regeste</title></svelte:head>

<div class="bg-background min-h-svh">
	<header class="flex h-14 items-center px-4">
		<Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" href={resolve('/chat')}>
			<ArrowLeftIcon class="size-3.5!" />
			{t('auth.back')}
		</Button>
	</header>

	<div class="mx-auto max-w-6xl px-6 pt-8 pb-28">
		<h1 class="font-display text-[2.4rem] leading-[1.1] tracking-tight">{t('hiw.title')}</h1>
		<p class="text-muted-foreground mt-4 max-w-2xl text-lg leading-relaxed text-balance">
			{t('hiw.intro')}
		</p>

		<!-- The only control on the page, because the mode is the only variable in
		     the flow. -->
		<div class="bg-muted/60 mt-9 inline-flex gap-0.5 rounded-lg p-0.5">
			{#each MODES as id (id)}
				<Button
					variant="ghost"
					size="sm"
					class="h-8 rounded-[7px] px-3.5 {mode === id
						? 'bg-card dark:bg-foreground/14 hover:bg-card text-foreground shadow-xs'
						: 'text-muted-foreground'}"
					aria-pressed={mode === id}
					onclick={() => (mode = id)}
				>
					{NAMES[id]}
				</Button>
			{/each}
		</div>

		<!-- The drawing itself lives in a component: the landing shows the same one,
		     and two copies would drift. -->
		<div class="mt-8">
			<DataFlow {mode} />
		</div>

		<!-- The facts a diagram cannot draw. Hairlines rather than boxes: three
		     more bordered cards under a bordered diagram turns the page into
		     packaging. -->
		<div class="mt-14 grid gap-x-12 gap-y-8 sm:grid-cols-2">
			{#each [{ label: t('hiw.whatStays'), body: detail.stays }, { label: t('hiw.server'), body: detail.server }] as fact (fact.label)}
				<div class="border-border border-t pt-5">
					<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
						{fact.label}
					</p>
					<p class="mt-2.5 leading-relaxed">{fact.body}</p>
				</div>
			{/each}
		</div>

		<!-- A claim is only worth something if it can be checked. -->
		<div class="border-border mt-8 flex items-start gap-3 border-t pt-5">
			<WifiOffIcon class="text-muted-foreground mt-1 size-4 shrink-0" />
			<div>
				<p class="font-medium">{t('hiw.proofTitle')}</p>
				<p class="text-muted-foreground mt-1.5 leading-relaxed">{t('hiw.proofBody')}</p>
			</div>
		</div>

		<p class="text-muted-foreground mt-14 text-sm leading-relaxed">{t('hiw.footer')}</p>
	</div>
</div>

<script lang="ts">
	// Constant header of the right contextual panel (spec 019): whatever the
	// content (Sources, review, What AI saw, viewer), the name sits left and
	// the hide control sits right, always in the same place. ← goes back to
	// the default content; » hides the whole panel.
	import { Button } from '$lib/components/ui/button';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ChevronsRightIcon from '@lucide/svelte/icons/chevrons-right';
	import { t } from '$lib/i18n/index.svelte';

	let {
		title,
		subtitle = null,
		onback = null,
		onhide = null
	}: {
		title: string;
		subtitle?: string | null;
		onback?: (() => void) | null;
		onhide?: (() => void) | null;
	} = $props();
</script>

<div class="flex items-center gap-1 border-b p-3">
	{#if onback}
		<Button
			variant="ghost"
			size="icon-sm"
			class="shrink-0"
			onclick={onback}
			aria-label={t('panel.backAria')}
		>
			<ArrowLeftIcon />
		</Button>
	{/if}
	<div class="min-w-0 flex-1 px-1">
		<h2 class="truncate text-sm font-semibold">{title}</h2>
		{#if subtitle}
			<p class="text-muted-foreground truncate text-xs">{subtitle}</p>
		{/if}
	</div>
	{#if onhide}
		<Button
			variant="ghost"
			size="icon-sm"
			class="shrink-0"
			onclick={onhide}
			aria-label={t('panel.hideAria')}
		>
			<ChevronsRightIcon />
		</Button>
	{/if}
</div>

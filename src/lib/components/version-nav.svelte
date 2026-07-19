<script lang="ts">
	// ‹ n/N › navigation for a turn that has several answer versions (Try again
	// keeps the previous one). Shared, because a version group can mix real
	// answers with grounded refusals, which render as notices: without this in
	// both places, landing on a refusal stranded the user with no way forward.
	import { Button } from '$lib/components/ui/button';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { t } from '$lib/i18n/index.svelte';

	let {
		versions,
		messageId,
		onswitch
	}: {
		/** Every version id of this turn, oldest first. */
		versions: string[] | null;
		messageId: string | null;
		onswitch: ((id: string) => void) | null;
	} = $props();

	const index = $derived(versions && messageId ? versions.indexOf(messageId) : -1);
	const show = $derived(!!versions && versions.length > 1 && index >= 0 && !!onswitch);
</script>

{#if show && versions && onswitch}
	<span class="text-muted-foreground flex items-center gap-0.5">
		<Button
			variant="ghost"
			size="icon-xs"
			class="text-muted-foreground size-6"
			disabled={index === 0}
			aria-label={t('turn.prevVersion')}
			onclick={() => onswitch(versions[index - 1])}
		>
			<ChevronLeftIcon />
		</Button>
		<span class="font-mono text-[10px] tabular-nums">{index + 1}/{versions.length}</span>
		<Button
			variant="ghost"
			size="icon-xs"
			class="text-muted-foreground size-6"
			disabled={index === versions.length - 1}
			aria-label={t('turn.nextVersion')}
			onclick={() => onswitch(versions[index + 1])}
		>
			<ChevronRightIcon />
		</Button>
	</span>
{/if}

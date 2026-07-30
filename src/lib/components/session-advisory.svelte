<script lang="ts">
	// The one slot, and the pattern every condition is presented in.
	//
	// Placed in the sidebar footer above the account row, because that is
	// persistent chrome out of the reading path: a message that must stay until it
	// is acted on cannot be a toast, and it must not sit across the content the way
	// the old update banner covered the chat's title.
	//
	// The grammar is fixed so that three different conditions cannot invent three
	// different shapes: a mark, one line naming the consequence, one action, and a
	// way to close it. Level changes only the mark's colour, and only where the
	// project's colour rule allows it — amber for a real degradation, the accent for
	// something merely worth knowing, and nothing decorative on either.
	import ArrowDownToLineIcon from '@lucide/svelte/icons/arrow-down-to-line';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import XIcon from '@lucide/svelte/icons/x';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';
	import { advisories } from '$lib/state/advisories.svelte';
	import { NEW_TAB } from '$lib/external-page';

	const current = $derived(advisories.current);

	// The update is the friendly case and keeps its own mark; the other two are
	// conditions, and a gauge reads as "how well this is running" where a warning
	// triangle would read as "broken".
	const MARK = {
		notice: ArrowDownToLineIcon,
		degraded: GaugeIcon,
		blocked: CircleAlertIcon
	} as const;
</script>

{#if current}
	{@const Mark = MARK[current.level]}
	<div class="advisory border-border bg-card/60 mb-2 rounded-lg border px-2.5 py-2" role="status">
		<div class="flex items-start gap-2.5">
			<Mark
				class="mt-0.5 size-3.5 shrink-0 {current.level === 'notice'
					? 'text-accent-foreground'
					: 'text-amber-700 dark:text-amber-500'}"
			/>
			<p class="min-w-0 flex-1 text-xs leading-snug">{current.text}</p>
			<Button
				variant="ghost"
				size="icon"
				class="text-muted-foreground -mt-1 -mr-1 size-6 shrink-0"
				aria-label={t('common.close')}
				onclick={() => advisories.dismiss(current.id)}
			>
				<XIcon class="size-3!" />
			</Button>
		</div>
		{#if current.action || current.topic}
			<div class="mt-1.5 flex items-center gap-1 pl-6">
				{#if current.action}
					<Button
						variant="ghost"
						size="sm"
						class="text-accent-foreground hover:text-accent-foreground h-6 px-1.5 text-xs"
						onclick={current.action.run}
					>
						{current.action.label}
					</Button>
				{/if}
				{#if current.topic}
					<Button
						variant="ghost"
						size="sm"
						class="text-muted-foreground h-6 px-1.5 text-xs"
						href={resolve('/(marketing)/help/[[topic]]', { topic: current.topic })}
						{...NEW_TAB}
					>
						{t('app.whatToDo')}
					</Button>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* It appears while someone is reading, so it rises in once. Nothing loops:
	   a warning that keeps moving is a warning people cover with their hand. */
	.advisory {
		animation: advisory-rise 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes advisory-rise {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.advisory {
			animation: none;
		}
	}
</style>

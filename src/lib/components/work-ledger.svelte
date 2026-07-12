<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { t } from '$lib/i18n/index.svelte';
	import type { MethodSummary, WorkStep } from '$lib/types';

	let { steps = [], method = null }: { steps?: WorkStep[]; method?: MethodSummary | null } =
		$props();
	let open = $state(false);

	function label(step: WorkStep): string {
		const state = step.status === 'done' ? 'done' : 'active';
		return t(`work.${step.id}.${state}` as Parameters<typeof t>[0], {
			count: step.count ?? 0
		});
	}
</script>

{#if method}
	<Collapsible.Root bind:open>
		<Collapsible.Trigger
			class="text-muted-foreground hover:text-foreground group flex items-center gap-1.5 py-1 font-mono text-[10px] tracking-wide uppercase transition-colors"
		>
			<ChevronRightIcon class="size-3 transition-transform group-data-[state=open]:rotate-90" />
			{t('work.method')}
		</Collapsible.Trigger>
		<Collapsible.Content class="border-muted mt-1 border-l pl-3">
			<div class="text-muted-foreground space-y-1 py-1 text-xs">
				<p>
					{t(`work.method.${method.kind}` as Parameters<typeof t>[0], {
						count: method.passageCount
					})}
				</p>
				{#if method.reasoningUsed}<p>{t('work.method.reasoning')}</p>{/if}
				{#if method.calculation}<p class="font-mono text-[11px]">{method.calculation}</p>{/if}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
{:else if steps.length}
	<div class="border-muted relative overflow-hidden border-l pl-3" aria-live="polite">
		<div
			class="bg-foreground/10 motion-safe:animate-pulse absolute top-0 bottom-0 left-0 w-px"
		></div>
		<div class="space-y-1 py-1">
			{#each steps as step (step.id)}
				<div
					class="flex items-center gap-2 text-xs"
					class:text-muted-foreground={step.status !== 'active'}
				>
					{#if step.status === 'done'}
						<CheckIcon class="size-3.5" />
					{:else if step.status === 'active'}
						<LoaderCircleIcon class="size-3.5 motion-safe:animate-spin" />
					{:else}
						<CircleIcon class="size-3.5 opacity-30" />
					{/if}
					<span>{label(step)}</span>
				</div>
			{/each}
		</div>
	</div>
{/if}

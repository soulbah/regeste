<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Button } from '$lib/components/ui/button';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { t } from '$lib/i18n/index.svelte';
	import type { MethodSummary, WorkStep } from '$lib/types';

	let {
		steps = [],
		method = null,
		thinking = null
	}: { steps?: WorkStep[]; method?: MethodSummary | null; thinking?: string | null } = $props();
	let open = $state(false);
	let notesOpen = $state(false);

	// Live seconds while draft notes stream — same meta grammar as the ms
	// timings on completed steps.
	let thinkingSeconds = $state(0);
	$effect(() => {
		if (!thinking) {
			thinkingSeconds = 0;
			return;
		}
		const startedAt = performance.now();
		const timer = setInterval(() => {
			thinkingSeconds = Math.round((performance.now() - startedAt) / 1000);
		}, 1000);
		return () => clearInterval(timer);
	});

	function label(step: WorkStep): string {
		const state = step.status === 'done' ? 'done' : 'active';
		const text = t(`work.${step.id}.${state}` as Parameters<typeof t>[0], {
			count: step.count ?? 0
		});
		if (step.status === 'active' && step.id === 'write' && thinking && thinkingSeconds > 0)
			return `${text} · ${thinkingSeconds} s`;
		return step.status === 'done' && step.elapsedMs ? `${text} · ${step.elapsedMs} ms` : text;
	}

	/** Tail of the live notes: the freshest words are the informative ones. */
	const thinkingTail = $derived.by(() => {
		if (!thinking) return '';
		const tail = thinking.replace(/\s+/g, ' ').trim().slice(-220);
		const wordStart = tail.indexOf(' ');
		return wordStart > 0 ? `…${tail.slice(wordStart)}` : tail;
	});
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
				<!-- The old summary line claims notes are hidden; with stored notes it
				     would be both false and redundant. -->
				{#if method.reasoningUsed && !method.reasoning}<p>{t('work.method.reasoning')}</p>{/if}
				{#if method.calculation}<p class="font-mono text-[11px]">{method.calculation}</p>{/if}
				{#if method.reasoning}
					<div class="pt-1">
						<p class="font-mono text-[10px] tracking-wide uppercase">
							{t('work.method.notes')}{method.reasoningMs
								? ` · ${Math.max(1, Math.round(method.reasoningMs / 1000))} s`
								: ''}
						</p>
						<p
							class="mt-1 text-[11px] leading-snug whitespace-pre-wrap opacity-80 {notesOpen
								? ''
								: 'line-clamp-6'}"
						>
							{method.reasoning}
						</p>
						<Button
							variant="ghost"
							class="text-muted-foreground hover:text-foreground h-auto p-0 text-[11px]"
							onclick={() => (notesOpen = !notesOpen)}
						>
							{notesOpen ? t('work.method.notesLess') : t('work.method.notesAll')}
						</Button>
					</div>
				{/if}
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
				{#if step.id === 'write' && step.status === 'active' && thinkingTail}
					<p class="text-muted-foreground line-clamp-2 pl-5 text-[11px] leading-snug opacity-80">
						{thinkingTail}
					</p>
				{/if}
			{/each}
		</div>
	</div>
{/if}

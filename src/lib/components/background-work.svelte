<script lang="ts">
	// Everything the app is doing that the reader did not ask for, in the one
	// place they are already looking: directly above the input.
	//
	// Three jobs share this surface because they share a situation — the app is
	// busy, the chat still works, and the reader deserves to know why. Each is a
	// row rather than a competing banner, so two running at once read as one
	// list instead of two interruptions.
	//
	// The model download was the reason for the rewrite. It has two phases the
	// store has always distinguished and the interface never did: `downloading`
	// pulls the weights, `loading` puts them in memory. Showing one bar for both
	// meant the bar reached 100% and then sat there, which reads as a freeze. It
	// is now two named steps, and the second says why it is slow.
	import { Progress } from '$lib/components/ui/progress';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { t } from '$lib/i18n/index.svelte';

	interface Job {
		id: string;
		title: string;
		body: string;
		/** 0-100, or null when the work reports no measurable progress. */
		percent: number | null;
		/** Right-aligned count, for work measured in whole units rather than %. */
		tally?: string;
	}

	const jobs = $derived.by<Job[]>(() => {
		const rows: Job[] = [];
		if (llmStore.status === 'downloading') {
			rows.push({
				id: 'model-download',
				title: t('work.model.downloading.title'),
				body: t('work.model.downloading.body', { size: llmStore.downloadLabel }),
				percent: Math.round(llmStore.progress * 100)
			});
		} else if (llmStore.status === 'loading') {
			// No percentage here on purpose: the engine reports none for this
			// phase, and a bar that moves on its own would be inventing one.
			rows.push({
				id: 'model-load',
				title: t('work.model.loading.title'),
				body: t('work.model.loading.body'),
				percent: null
			});
		}
		if (documentsStore.reindexTotal > 0) {
			rows.push({
				id: 'reindex',
				title: t('reindex.title'),
				body: t('reindex.body'),
				percent: Math.round((documentsStore.reindexDone / documentsStore.reindexTotal) * 100),
				tally: `${documentsStore.reindexDone}/${documentsStore.reindexTotal}`
			});
		}
		return rows;
	});
</script>

{#if jobs.length}
	<div class="border-border -mx-3 -mt-3 mb-3 space-y-3 border-b px-3 py-2.5" aria-live="polite">
		{#each jobs as job (job.id)}
			<div>
				<div class="flex items-baseline justify-between gap-4">
					<p class="truncate text-xs font-medium">{job.title}</p>
					<p
						class="text-muted-foreground shrink-0 font-mono text-[10px] tracking-wider tabular-nums"
					>
						{job.tally ?? (job.percent !== null ? `${job.percent}%` : '')}
					</p>
				</div>
				<p class="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">{job.body}</p>
				{#if job.percent !== null}
					<Progress value={job.percent} class="mt-2 h-1" />
				{:else}
					<!-- Indeterminate: the phase reports no number, and the guidance for
					     that case is a moving indicator rather than a still bar, which
					     reads as stalled. -->
					<div class="bg-secondary mt-2 h-1 overflow-hidden rounded-full">
						<div
							class="bg-primary/70 h-full w-1/3 rounded-full motion-safe:animate-[work_1.4s_ease-in-out_infinite]"
						></div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	@keyframes work {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(400%);
		}
	}
</style>

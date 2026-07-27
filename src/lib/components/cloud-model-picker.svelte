<script lang="ts">
	// Which Cloud model answers, shown next to the mode pill and only in Cloud
	// mode, since it is the only mode whose cost the maintainer carries.
	//
	// Each row states what today's remaining budget buys on that model. Same
	// budget, three numbers: picking the quick one roughly quadruples how many
	// questions are left, and that is the whole trade, visible before choosing
	// rather than discovered afterwards.
	//
	// No invented currency. Consumer AI products meter in the unit of the thing
	// itself — Claude counts messages, Perplexity counts searches — and the
	// tools that moved to credits did so because their models differ by up to
	// thirty times, where a request count genuinely cannot describe the cost.
	// Three models inside a factor of five do not need a word to learn.
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { t } from '$lib/i18n/index.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { CLOUD_MODELS, answersLeft, type CloudModelKey } from '$lib/cloud-models';

	let { value, onselect }: { value: CloudModelKey; onselect: (key: CloudModelKey) => void } =
		$props();

	let open = $state(false);

	const rows = $derived(
		CLOUD_MODELS.map((model) => ({
			key: model.key,
			name: t(`cloudModel.${model.key}`),
			// The tier name says what to expect, this says what is running. Nobody
			// should have to take "Standard" on faith.
			model: model.name,
			line: t(`cloudModel.${model.key}.line`),
			// null until the budget is known: a made-up number here would be the
			// one thing this control exists to avoid.
			left: settingsStore.quota ? answersLeft(settingsStore.quota.remaining, model) : null
		}))
	);
	const current = $derived(rows.find((r) => r.key === value) ?? rows[1]);
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="sm" class="text-muted-foreground gap-1.5">
				{current.name}
				<ChevronDownIcon class="size-3.5!" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<!-- Right-aligned: it sits at the right edge of the composer, beside Send,
	     so the panel opens back over the input rather than off the card. -->
	<Popover.Content class="w-72 gap-0 p-1" align="end" side="top">
		<p class="text-muted-foreground px-2.5 py-2 font-mono text-[10px] tracking-widest uppercase">
			{t('cloudModel.label')}
		</p>
		{#each rows as row (row.key)}
			<Button
				variant="ghost"
				class="h-auto w-full justify-start gap-2.5 px-2.5 py-2 text-left font-normal"
				onclick={() => {
					onselect(row.key);
					open = false;
				}}
			>
				<span class="min-w-0 flex-1">
					<span class="flex items-baseline gap-1.5 text-sm">
						{row.name}
						{#if row.key === value}
							<CheckIcon class="text-muted-foreground size-3.5 shrink-0 self-center" />
						{/if}
						<span class="text-muted-foreground/60 ml-auto shrink-0 font-mono text-[10px]">
							{row.model}
						</span>
					</span>
					<span class="text-muted-foreground block text-xs">{row.line}</span>
					{#if row.left !== null}
						<span class="text-muted-foreground/80 mt-0.5 block font-mono text-[10px]">
							{row.left > 0
								? t('cloudModel.left', { count: String(row.left) })
								: t('cloudModel.spent')}
						</span>
					{/if}
				</span>
			</Button>
		{/each}
	</Popover.Content>
</Popover.Root>

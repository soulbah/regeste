<script lang="ts">
	// First-run mode choice, shown once inside a fresh chat that already has a
	// document but before the user has ever picked how answers run. It states
	// each option's cost plainly — Private's one-time download most of all — and
	// starts that download inline so the user never has to hunt for it. Once a
	// mode is chosen it never shows again (settingsStore.modeChosen).
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { t } from '$lib/i18n/index.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { uiStore } from '$lib/state/ui.svelte';
	import { modeReadiness } from '$lib/state/mode-readiness.svelte';
	import { ASSISTED_ENABLED } from '$lib/flags';
	import type { ChatMode } from '$lib/types';

	let {
		onselect,
		privateOnly = false
	}: {
		onselect: (mode: ChatMode) => void;
		privateOnly?: boolean;
	} = $props();

	const IDS = (
		ASSISTED_ENABLED ? (['private', 'assisted', 'myai'] as const) : (['private', 'myai'] as const)
	) satisfies readonly ChatMode[];

	const LABELS = { private: 'Private', assisted: 'Assisted', myai: 'My AI' } as const;

	function describe(id: ChatMode): string {
		if (id === 'private')
			return t(
				llmStore.tier?.id === 'lite' ? 'modes.private.downloadLite' : 'modes.private.download',
				{
					size: llmStore.downloadLabel
				}
			);
		if (id === 'assisted') return t('modes.assisted.description');
		return t('modes.myai.description');
	}

	function choose(id: ChatMode) {
		void settingsStore.markModeChosen();
		onselect(id);
		const readiness = modeReadiness(id, { privateOnly });
		// Private: start the one-time download right here — the whole point is
		// that the user never has to go find it. Cloud/own-endpoint modes route
		// to their setup only when they still need it.
		if (id === 'private' && llmStore.status === 'needs-download') void llmStore.prepare();
		else if (id === 'assisted' && readiness.state === 'setup') goto(resolve('/chat/account'));
		else if (id === 'myai' && readiness.state === 'setup') uiStore.openSettings('ai', 'myai');
	}
</script>

<div class="bg-card/40 mx-auto max-w-md rounded-2xl border p-1.5">
	<p class="px-3 pt-2.5 pb-1.5 text-sm font-medium">{t('onboard.modeTitle')}</p>
	<div class="flex flex-col">
		{#each IDS as id (id)}
			{@const readiness = modeReadiness(id, { privateOnly })}
			<button
				type="button"
				onclick={() => choose(id)}
				disabled={readiness.state === 'blocked'}
				class="group hover:bg-accent/40 flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
			>
				<span
					class="mt-1.5 size-2 shrink-0 rounded-full {id === 'assisted'
						? 'bg-mode-assisted'
						: 'bg-accent-foreground/60'}"
				></span>
				<span class="min-w-0 flex-1">
					<span class="flex items-center gap-2">
						<span class="text-sm font-medium">{LABELS[id]}</span>
						{#if id === 'private'}
							<span class="text-accent-foreground font-mono text-[9px] tracking-wider uppercase">
								{t('onboard.recommended')}
							</span>
						{/if}
					</span>
					<span class="text-muted-foreground block text-xs text-balance">
						{readiness.blockedLine ?? describe(id)}
					</span>
				</span>
				<ChevronRightIcon
					class="text-muted-foreground mt-1 size-3.5 opacity-0 transition group-hover:opacity-100"
				/>
			</button>
		{/each}
	</div>
</div>

<script lang="ts">
	// Mode picker v3 (spec 022): the picker picks, Settings configures. Three
	// rows (name, one line, state on the right) and zero configuration UI.
	// Clicking a mode that needs setup opens the Settings modal on its card;
	// the pendingActivation watcher selects it once setup completes.
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { t } from '$lib/i18n/index.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { modeReadiness } from '$lib/state/mode-readiness.svelte';
	import { myaiStore } from '$lib/state/myai.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { uiStore } from '$lib/state/ui.svelte';
	import { ASSISTED_ENABLED } from '$lib/flags';
	import type { ChatMode } from '$lib/types';

	// Modes offered here: Assisted only when this build enables it (the
	// maintainer's hosted deployment). A self-hosted build shows Private + My AI.
	const MODE_IDS = (
		ASSISTED_ENABLED ? (['private', 'assisted', 'myai'] as const) : (['private', 'myai'] as const)
	) satisfies readonly ChatMode[];

	let {
		mode,
		onselect,
		myaiModel = null,
		privateOnly = false
	}: {
		/** null = never chosen on this device (onboarding placeholder). */
		mode: ChatMode | null;
		onselect: (mode: ChatMode) => void;
		/** Active chat's pinned My AI model, when there is a chat. */
		myaiModel?: string | null;
		/** P7 — cloud modes locked for this chat. */
		privateOnly?: boolean;
	} = $props();

	let open = $state(false);

	$effect(() => {
		llmStore.init();
		myaiStore.init();
	});

	const activeModel = $derived(myaiModel ?? myaiStore.defaultModel);

	// M3 — dynamic "Best for this device": justified by capability detection,
	// never a static "Recommended" (FEATURES §5 UI decision). The CPU lite tier
	// keeps Private possible but slow, so Assisted stays the honest pick there.
	const bestMode = $derived.by(() => {
		if (llmStore.status === 'detecting') return null;
		if (llmStore.status === 'unavailable' || llmStore.tier?.id === 'lite') {
			// No usable in-browser model: Assisted is the honest pick when this
			// build offers it, otherwise the user's own endpoint (My AI).
			return ASSISTED_ENABLED
				? { id: 'assisted' as const, reason: t('modes.bestReason.noGpu') }
				: { id: 'myai' as const, reason: t('modes.bestReason.noGpu') };
		}
		return { id: 'private' as const, reason: t('modes.bestReason.local') };
	});

	const DESCRIPTIONS = {
		private: 'modes.private.description',
		assisted: 'modes.assisted.description',
		myai: 'modes.myai.description'
	} as const;

	function select(m: ChatMode) {
		void settingsStore.markModeChosen();
		onselect(m);
	}

	// One row per mode: static description, readiness on the right.
	const modes = $derived(
		MODE_IDS.map((id) => {
			const readiness = modeReadiness(id, { privateOnly });
			return {
				id,
				label: {
					private: t('modes.private.name'),
					assisted: t('modes.assisted.name'),
					myai: t('modes.myai.name')
				}[id],
				line:
					readiness.blockedLine ??
					(id === 'myai' && readiness.state === 'ready'
						? `${myaiStore.host} · ${activeModel}`
						: t(DESCRIPTIONS[id])),
				readiness
			};
		})
	);

	const current = $derived(mode ? modes.find((m) => m.id === mode) : null);
	// Download progress stays visible from the pill (owner amendment).
	const pillProgress = $derived(
		mode === 'private' && current?.readiness.state === 'progress' && current.readiness.pct > 0
			? current.readiness.pct
			: null
	);

	function pick(m: (typeof modes)[number]) {
		switch (m.readiness.state) {
			case 'ready':
				select(m.id);
				open = false;
				break;
			case 'setup':
				// Route to the source of truth; activate once setup completes.
				uiStore.pendingActivation = m.id;
				open = false;
				if (m.id === 'assisted') {
					// Sign-in has its own page; the watcher picks the mode up on return.
					goto(resolve('/chat/account'));
					return;
				}
				uiStore.openSettings('ai', m.id);
				break;
			default:
				// progress/blocked rows are inert; the line says why.
				break;
		}
	}

	// Activation handshake: a mode requested from Settings ("Use this mode")
	// applies immediately; a pending one applies the moment it becomes ready.
	$effect(() => {
		const requested = uiStore.requestedMode;
		if (requested && modeReadiness(requested, { privateOnly }).state === 'ready') {
			uiStore.requestedMode = null;
			uiStore.pendingActivation = null;
			select(requested);
		}
	});
	$effect(() => {
		const pending = uiStore.pendingActivation;
		if (pending && pending !== mode && modeReadiness(pending, { privateOnly }).state === 'ready') {
			uiStore.pendingActivation = null;
			select(pending);
			toast.success(
				t('modes.activated', {
					mode: {
						private: t('modes.private.name'),
						assisted: t('modes.assisted.name'),
						myai: t('modes.myai.name')
					}[pending]
				})
			);
		}
	});
</script>

{#if !settingsStore.modeChosen}
	<!-- First run: a clear button that opens the Settings AI cards (where the
	     download, sign-in and endpoint config already live) instead of the
	     subtle dropdown, so the very first choice is obvious. -->
	<Button
		variant="outline"
		size="sm"
		class="border-accent-foreground/40 bg-accent/40 text-accent-foreground hover:bg-accent/60 gap-1.5"
		onclick={() => uiStore.openSettings('ai')}
	>
		<SlidersHorizontalIcon class="size-3.5!" />
		{t('onboard.chooseMode')}
	</Button>
{:else}
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="sm" class="gap-1.5">
					{current ? current.label : t('modes.choose')}
					{#if pillProgress !== null}
						<span class="text-muted-foreground text-xs tabular-nums">· {pillProgress}%</span>
					{/if}
					<ChevronDownIcon class="text-muted-foreground size-3.5!" />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-72 gap-0 p-1" align="start" side="top">
			<div class="flex flex-col">
				{#each modes as m (m.id)}
					<Button
						variant="ghost"
						class="h-auto w-full justify-start px-2.5 py-2 text-left"
						disabled={m.readiness.state === 'blocked'}
						onclick={() => pick(m)}
					>
						<span class="min-w-0 flex-1">
							<span class="flex items-center gap-1.5">
								<span class="text-sm font-medium">{m.label}</span>
								{#if bestMode?.id === m.id}
									<span class="text-ring text-[10px]" title={bestMode.reason}>
										{t('modes.best')}
									</span>
								{/if}
							</span>
							<span class="text-muted-foreground block truncate text-xs">
								{m.line}
							</span>
						</span>
						<span class="ml-2 shrink-0">
							{#if m.id === mode}
								<CheckIcon class="text-ring size-4" />
							{:else if m.readiness.state === 'ready'}
								<span class="text-muted-foreground text-xs">{t('modes.state.ready')}</span>
							{:else if m.readiness.state === 'setup'}
								<span class="text-muted-foreground text-xs">{t(m.readiness.setupKey)} →</span>
							{:else if m.readiness.state === 'progress'}
								<span class="text-muted-foreground text-xs tabular-nums">
									{m.readiness.pct > 0 ? `${m.readiness.pct}%` : '…'}
								</span>
							{/if}
						</span>
					</Button>
				{/each}
			</div>
			<div class="mt-1 border-t pt-1">
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground h-7 w-full justify-start px-2.5 text-xs font-normal"
					onclick={() => {
						open = false;
						uiStore.openSettings('ai');
					}}
				>
					{t('modes.aiSettings')}
				</Button>
				<a
					href={resolve('/how-it-works')}
					class="text-muted-foreground hover:text-foreground block px-2.5 py-1.5 text-xs underline-offset-2 hover:underline"
					onclick={() => (open = false)}
				>
					{t('modes.whatLeaves')}
				</a>
			</div>
		</Popover.Content>
	</Popover.Root>
{/if}

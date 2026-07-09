<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import LockIcon from '@lucide/svelte/icons/lock';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import LinkIcon from '@lucide/svelte/icons/link';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { sessionStore } from '$lib/state/session.svelte';
	import type { ChatMode } from '$lib/types';

	let { mode, onselect }: { mode: ChatMode; onselect: (mode: ChatMode) => void } = $props();

	let open = $state(false);

	$effect(() => {
		llmStore.init();
	});

	// Honest state lines (FEATURES 5bis): the selector IS the status surface.
	// Zero model jargon — sizes and plain language only.
	const privateStatus = $derived.by(() => {
		switch (llmStore.status) {
			case 'detecting':
				return { line: 'Checking this device…', selectable: false, prepare: false };
			case 'unavailable':
				return { line: 'Unavailable on this device', selectable: false, prepare: false };
			case 'needs-download':
				return llmStore.prepared
					? { line: 'Prepared · tap to load', selectable: true, prepare: true }
					: {
							line: `One-time download of ${llmStore.downloadLabel}, then works offline`,
							selectable: true,
							prepare: true
						};
			case 'downloading':
				return {
					line: `Preparing private AI… ${Math.round(llmStore.progress * 100)}%`,
					selectable: true,
					prepare: false
				};
			case 'loading':
				return { line: 'Loading private AI…', selectable: true, prepare: false };
			case 'ready':
			case 'generating':
				return { line: 'Ready · works offline', selectable: true, prepare: false };
			case 'error':
				return {
					line: llmStore.errorMessage ?? 'Something went wrong',
					selectable: false,
					prepare: false
				};
		}
	});

	const modes = $derived([
		{
			id: 'private' as ChatMode,
			label: 'Private',
			dotClass: 'bg-mode-private',
			description: 'Everything stays on this device.',
			status: privateStatus.line,
			disabled: !privateStatus.selectable
		},
		{
			id: 'assisted' as ChatMode,
			label: 'Assisted',
			dotClass: 'bg-mode-assisted',
			description: 'Only relevant excerpts are processed online.',
			status: sessionStore.user
				? 'Ready · excerpts only, never full documents'
				: 'Sign in required',
			disabled: !sessionStore.user
		},
		{
			id: 'myai' as ChatMode,
			label: 'My AI',
			dotClass: 'bg-mode-myai',
			description: 'Use your own configured AI provider.',
			status: 'Not configured',
			disabled: true
		}
	]);

	const current = $derived(modes.find((m) => m.id === mode) ?? modes[0]);
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm" class="gap-2">
				<span class="size-2 rounded-full {current.dotClass}"></span>
				{current.label}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-80 p-2" align="start" side="top">
		<p class="text-muted-foreground px-2 pb-2 font-mono text-xs tracking-wide uppercase">
			Answer generated with
		</p>
		<div class="flex flex-col gap-1">
			{#each modes as m (m.id)}
				<Button
					variant="ghost"
					class="h-auto justify-start gap-3 px-2 py-2 text-left"
					onclick={() => {
						if (m.disabled) {
							// Locked Assisted is the sign-up funnel: route to the account page.
							if (m.id === 'assisted' && !sessionStore.user) {
								open = false;
								goto(resolve('/account'));
							}
							return;
						}
						onselect(m.id);
						if (m.id === 'private' && privateStatus.prepare) {
							// Explicit consent click: start the one-time download / load.
							llmStore.prepare();
							return; // keep the popover open to show progress
						}
						open = false;
					}}
				>
					<span class="mt-0.5 flex size-7 items-center justify-center rounded-md border">
						{#if m.id === 'private'}<LockIcon
								class="size-3.5"
							/>{:else if m.id === 'assisted'}<SparklesIcon class="size-3.5" />{:else}<LinkIcon
								class="size-3.5"
							/>{/if}
					</span>
					<span class="min-w-0 flex-1">
						<span class="flex items-center gap-2">
							<span class="size-1.5 rounded-full {m.dotClass}"></span>
							<span class="text-sm font-medium">{m.label}</span>
							{#if m.id === mode}<CheckIcon class="size-3.5" />{/if}
						</span>
						<span class="text-muted-foreground block text-xs">{m.description}</span>
						{#if m.status}
							<Badge variant="outline" class="mt-1 gap-1 font-mono text-[10px] uppercase">
								{#if m.id === 'assisted'}<LockIcon class="size-2.5" />{/if}{m.status}
							</Badge>
						{/if}
					</span>
				</Button>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>

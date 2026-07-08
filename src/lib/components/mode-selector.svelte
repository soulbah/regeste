<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import LockIcon from '@lucide/svelte/icons/lock';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import LinkIcon from '@lucide/svelte/icons/link';
	import CheckIcon from '@lucide/svelte/icons/check';
	import type { ChatMode } from '$lib/types';

	let { mode, onselect }: { mode: ChatMode; onselect: (mode: ChatMode) => void } = $props();

	let open = $state(false);

	// Honest state lines (FEATURES 5bis): the selector is a status surface.
	// These become dynamic when specs 004/005 land.
	const modes: Array<{
		id: ChatMode;
		label: string;
		dotClass: string;
		description: string;
		status: string | null;
		disabled: boolean;
	}> = [
		{
			id: 'private',
			label: 'Private',
			dotClass: 'bg-mode-private',
			description: 'Everything stays on this device.',
			status: 'Coming soon — on-device AI is not wired yet',
			disabled: true
		},
		{
			id: 'assisted',
			label: 'Assisted',
			dotClass: 'bg-mode-assisted',
			description: 'Only relevant excerpts are processed online.',
			status: 'Sign in required',
			disabled: true
		},
		{
			id: 'myai',
			label: 'My AI',
			dotClass: 'bg-mode-myai',
			description: 'Use your own configured AI provider.',
			status: 'Not configured',
			disabled: true
		}
	];

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
						if (!m.disabled) {
							onselect(m.id);
							open = false;
						}
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

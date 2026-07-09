<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import LockIcon from '@lucide/svelte/icons/lock';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import LinkIcon from '@lucide/svelte/icons/link';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { sessionStore } from '$lib/state/session.svelte';
	import { myaiStore, MYAI_PRESETS, normalizeBaseUrl } from '$lib/state/myai.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import type { ChatMode } from '$lib/types';

	let {
		mode,
		onselect,
		myaiModel = null,
		onmyaimodel,
		privateOnly = false
	}: {
		mode: ChatMode;
		onselect: (mode: ChatMode) => void;
		/** Active chat's pinned My AI model, when there is a chat. */
		myaiModel?: string | null;
		onmyaimodel?: (model: string) => void;
		/** P7 — cloud modes locked for this chat. */
		privateOnly?: boolean;
	} = $props();

	let open = $state(false);
	let view = $state<'modes' | 'myai'>('modes');
	let urlDraft = $state('');
	let keyDraft = $state('');

	$effect(() => {
		llmStore.init();
		myaiStore.init();
	});

	$effect(() => {
		if (!open) view = 'modes';
	});

	function openMyaiConfig() {
		urlDraft = myaiStore.baseUrl ?? '';
		keyDraft = myaiStore.apiKey ?? '';
		view = 'myai';
	}

	const activeModel = $derived(myaiModel ?? myaiStore.defaultModel);

	const presetHint = $derived(
		MYAI_PRESETS.find((p) => normalizeBaseUrl(urlDraft) === p.baseUrl)?.corsHint ?? null
	);

	async function applyEndpointDraft() {
		await myaiStore.saveEndpoint(urlDraft, keyDraft);
	}

	async function chooseModel(model: string) {
		await myaiStore.saveDefaultModel(model);
		onmyaimodel?.(model);
		onselect('myai');
		open = false;
	}

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
			status: privateOnly
				? 'Locked · this chat is private-only'
				: settingsStore.forceOffline
					? 'Offline mode is on'
					: sessionStore.user
						? 'Ready · excerpts only, never full documents'
						: 'Sign in required',
			disabled: privateOnly || settingsStore.forceOffline || !sessionStore.user
		},
		{
			id: 'myai' as ChatMode,
			label: 'My AI',
			dotClass: 'bg-mode-myai',
			description: 'Use your own configured AI provider.',
			status: privateOnly
				? 'Locked · this chat is private-only'
				: settingsStore.forceOffline
					? 'Offline mode is on'
					: myaiStore.baseUrl && activeModel
						? `${myaiStore.host} · ${activeModel}`
						: 'Not configured →',
			disabled: privateOnly || settingsStore.forceOffline
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
		{#if view === 'modes'}
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
							if (m.id === 'myai' && !(myaiStore.baseUrl && activeModel)) {
								openMyaiConfig();
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
			{#if myaiStore.baseUrl && activeModel}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground mt-1 h-6 w-full justify-start px-2 font-mono text-[10px] tracking-wide uppercase"
					onclick={openMyaiConfig}
				>
					Change My AI endpoint or model…
				</Button>
			{/if}
			<a
				href={resolve('/how-it-works')}
				class="text-muted-foreground hover:text-foreground mt-1 block px-2 py-1 font-mono text-[10px] tracking-wide uppercase underline-offset-2 hover:underline"
				onclick={() => (open = false)}
			>
				What leaves the device in each mode →
			</a>
		{:else}
			<!-- My AI configuration (A1/A2, FEATURES 5bis): in the popover, never a dialog. -->
			<div class="space-y-3 p-1">
				<div class="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						class="size-6"
						onclick={() => (view = 'modes')}
						aria-label="Back to modes"
					>
						<ArrowLeftIcon class="size-3.5" />
					</Button>
					<p class="text-muted-foreground font-mono text-xs tracking-wide uppercase">
						My AI · your own endpoint
					</p>
				</div>
				<div class="flex gap-1">
					{#each MYAI_PRESETS as preset (preset.id)}
						<Button
							variant={normalizeBaseUrl(urlDraft) === preset.baseUrl ? 'secondary' : 'outline'}
							size="sm"
							class="h-7 flex-1 text-xs"
							onclick={() => (urlDraft = preset.baseUrl)}
						>
							{preset.label}
						</Button>
					{/each}
				</div>
				<div class="space-y-1.5">
					<Label for="myai-url" class="font-mono text-[10px] tracking-wide uppercase">
						OpenAI-compatible base URL
					</Label>
					<Input
						id="myai-url"
						bind:value={urlDraft}
						placeholder="http://localhost:11434/v1"
						class="h-8 font-mono text-xs"
					/>
				</div>
				<div class="space-y-1.5">
					<Label for="myai-key" class="font-mono text-[10px] tracking-wide uppercase">
						API key (optional)
					</Label>
					<Input
						id="myai-key"
						type="password"
						bind:value={keyDraft}
						placeholder="none for local servers"
						class="h-8 font-mono text-xs"
					/>
				</div>
				{#if presetHint}
					<p class="text-muted-foreground text-xs">{presetHint}</p>
				{/if}
				<Button
					variant="outline"
					size="sm"
					class="w-full"
					disabled={!urlDraft.trim() || myaiStore.testStatus === 'testing'}
					onclick={async () => {
						await applyEndpointDraft();
						await myaiStore.testConnection();
					}}
				>
					{myaiStore.testStatus === 'testing' ? 'Testing…' : 'Test connection'}
				</Button>
				{#if myaiStore.testStatus === 'error'}
					<p class="text-destructive text-xs">{myaiStore.testError}</p>
				{:else if myaiStore.testStatus === 'ok'}
					{#if myaiStore.models.length === 0}
						<p class="text-muted-foreground text-xs">
							Connected, but the endpoint lists no models.
						</p>
					{:else}
						<p class="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
							Pick a model
						</p>
						<div class="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
							{#each myaiStore.models as model (model)}
								<Button
									variant="ghost"
									size="sm"
									class="h-7 justify-start gap-2 font-mono text-xs"
									onclick={() => chooseModel(model)}
								>
									{#if model === activeModel}<CheckIcon class="size-3" />{/if}
									{model}
								</Button>
							{/each}
						</div>
					{/if}
				{/if}
				<p class="text-muted-foreground text-xs">
					Requests go straight from this browser to your endpoint — Folio's servers are never
					involved.
				</p>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>

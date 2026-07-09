<script lang="ts">
	// Settings (spec 009): storage status (T6), weekly privacy counter (P4),
	// force offline (T2), panic wipe (T1). Everything on this page is local.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import { resolve } from '$app/paths';
	import { getLocalDb } from '$lib/local-db/client';
	import type { PrivacySummaryRow } from '$lib/local-db/worker';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { modelsStore } from '$lib/state/models.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';

	let week = $state<PrivacySummaryRow[]>([]);
	let wipeOpen = $state(false);
	let wipeArmed = $state(false);

	$effect(() => {
		settingsStore.init();
		settingsStore.refreshStorage();
		llmStore.init();
		modelsStore.refresh();
		(async () => {
			const { db } = await getLocalDb();
			week = await db.weekPrivacySummary();
		})();
	});

	const weekEgress = $derived(week.filter((w) => w.destination !== 'device'));

	function fmtBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<svelte:head><title>Settings · Folio</title></svelte:head>

<div class="flex h-svh flex-col">
	<header class="flex items-center justify-between border-b px-6 py-3">
		<div>
			<h1 class="font-display text-lg tracking-tight">Settings</h1>
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				Storage · privacy · offline
			</p>
		</div>
		<span
			class="text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-widest uppercase"
		>
			<span class="bg-mode-private size-1.5 rounded-full"></span> Stored locally
		</span>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-2xl space-y-6 px-6 py-8">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Storage on this device</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
					{#if settingsStore.storage}
						<p class="text-sm">
							{fmtBytes(settingsStore.storage.usage)} used
							{#if settingsStore.storage.quota}
								· {fmtBytes(settingsStore.storage.quota)} available
							{/if}
						</p>
						{#if settingsStore.storage.persisted}
							<Badge variant="outline" class="gap-1 text-[10px]">
								<span class="bg-mode-private size-1.5 rounded-full"></span>
								Persistent — the browser won't evict your documents
							</Badge>
						{:else}
							<div class="space-y-2">
								<Badge variant="secondary" class="text-[10px]">
									Not persistent — the browser may evict this data under storage pressure
								</Badge>
								<div>
									<Button
										variant="outline"
										size="sm"
										onclick={() => settingsStore.requestPersistence()}
									>
										Ask the browser to persist
									</Button>
								</div>
							</div>
						{/if}
					{:else}
						<p class="text-muted-foreground text-sm">Storage details unavailable.</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Shared this week</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-2">
					{#if weekEgress.length === 0}
						<p class="flex items-center gap-2 text-sm">
							<ShieldIcon class="text-mode-private size-4" /> Nothing left this device in the last 7 days.
						</p>
					{:else}
						{#each weekEgress as row (row.destination)}
							<p class="text-sm">
								<span class="font-mono">{row.destination}</span> — {row.requests}
								request{row.requests === 1 ? '' : 's'} · {fmtBytes(row.bytes)}
							</p>
						{/each}
					{/if}
					<p class="text-muted-foreground text-xs">
						Full history in the <a class="underline" href={resolve('/privacy')}>Privacy Report</a>
						· how each mode works:
						<a class="underline" href={resolve('/how-it-works')}>data flows</a>
					</p>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Force offline</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-2">
					<div class="flex items-center justify-between gap-4">
						<Label for="force-offline" class="text-sm font-normal">
							Block every outgoing request. Private mode and your documents keep working; cloud
							modes and sign-in are refused with a clear message.
						</Label>
						<Switch
							id="force-offline"
							checked={settingsStore.forceOffline}
							onCheckedChange={(v) => settingsStore.setForceOffline(v === true)}
						/>
					</div>
					{#if settingsStore.forceOffline}
						<Badge variant="outline" class="gap-1 text-[10px]">
							<span class="bg-mode-private size-1.5 rounded-full"></span>
							Offline — nothing leaves this device
						</Badge>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">AI models on this device</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
					{#if modelsStore.cached.length === 0}
						<p class="text-muted-foreground text-sm">
							{modelsStore.loading ? 'Measuring…' : 'No models downloaded yet.'}
						</p>
					{:else}
						{#each modelsStore.cached as model (model.cacheName)}
							<div class="flex items-center justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate text-sm">{model.label}</p>
									<p class="text-muted-foreground font-mono text-[10px] uppercase">
										{model.bytes ? fmtBytes(model.bytes) : `${model.entries} files`}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onclick={() => modelsStore.remove(model.cacheName)}
								>
									Delete
								</Button>
							</div>
						{/each}
					{/if}
					<div class="border-t pt-3">
						<div class="flex items-center justify-between gap-3">
							<p class="text-muted-foreground text-sm">
								Test my device — a short private generation measures how fast this machine runs the
								local AI.
							</p>
							<Button
								variant="outline"
								size="sm"
								class="shrink-0"
								disabled={llmStore.status !== 'ready' || modelsStore.benchmarking}
								onclick={() => modelsStore.runBenchmark()}
							>
								{modelsStore.benchmarking ? 'Testing…' : 'Test my device'}
							</Button>
						</div>
						{#if llmStore.status !== 'ready'}
							<p class="text-muted-foreground mt-1 text-xs">
								Prepare the private AI first (mode selector → Private).
							</p>
						{/if}
						{#if modelsStore.benchmark}
							<p class="mt-2 text-sm">
								{modelsStore.benchmark.tokensPerSecond} tokens/second —
								{modelsStore.benchmark.recommendPrivate
									? 'this device runs Private mode comfortably.'
									: 'this device is slow for Private mode; Assisted will feel much faster.'}
							</p>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root class="border-destructive/40">
				<Card.Header>
					<Card.Title class="text-base">Delete everything</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
					<p class="text-muted-foreground text-sm">
						Erases all documents, chats, indexes and downloaded AI models from this device. There is
						no server copy — this cannot be undone.
					</p>
					<Button variant="destructive" onclick={() => (wipeOpen = true)}>
						Delete everything on this device
					</Button>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>

<AlertDialog.Root
	open={wipeOpen}
	onOpenChange={(o) => {
		wipeOpen = o;
		if (!o) wipeArmed = false;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{wipeArmed ? 'Last confirmation' : 'Delete everything on this device?'}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{#if wipeArmed}
					This permanently destroys every document, chat, index and downloaded model stored by Folio
					in this browser. Nothing exists anywhere else. Really delete?
				{:else}
					Documents, chats, search indexes and AI models will be erased from this browser. Your
					account (if any) survives — it holds no content.
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			{#if wipeArmed}
				<AlertDialog.Action
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					disabled={settingsStore.wiping}
					onclick={(e) => {
						e.preventDefault();
						settingsStore.wipeEverything();
					}}
				>
					{settingsStore.wiping ? 'Erasing…' : 'Yes, erase it all'}
				</AlertDialog.Action>
			{:else}
				<AlertDialog.Action
					onclick={(e) => {
						e.preventDefault();
						wipeArmed = true;
					}}
				>
					Continue
				</AlertDialog.Action>
			{/if}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

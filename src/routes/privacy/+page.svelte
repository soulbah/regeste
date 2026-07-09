<script lang="ts">
	// Privacy Report (spec 008, FEATURES P1): the egress journal. Every event
	// where data left (or explicitly did not leave) this device, from the local
	// privacy_events table. The empty report IS the product's proof.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { getLocalDb } from '$lib/local-db/client';
	import type { PrivacyEventRow, PrivacySummaryRow } from '$lib/local-db/worker';

	let events = $state<PrivacyEventRow[]>([]);
	let summary = $state<PrivacySummaryRow[]>([]);
	let loaded = $state(false);

	$effect(() => {
		(async () => {
			const { db } = await getLocalDb();
			events = await db.listPrivacyEvents(1000);
			summary = await db.privacySummary();
			loaded = true;
		})();
	});

	const egress = $derived(events.filter((e) => e.destination !== 'device'));
	const egressSummary = $derived(summary.filter((s) => s.destination !== 'device'));
	const onDevice = $derived(summary.find((s) => s.destination === 'device'));

	function fmtBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		return `${(n / 1024).toFixed(1)} KB`;
	}

	function fmtDate(ts: number): string {
		return new Date(ts).toLocaleString();
	}

	function modeLabel(mode: string): string {
		if (mode === 'private') return 'Private';
		if (mode === 'assisted') return 'Assisted';
		if (mode === 'myai') return 'My AI';
		return mode;
	}

	function exportJson() {
		const payload = {
			exportedAt: new Date().toISOString(),
			events: events.map((e) => ({
				at: new Date(e.createdAt).toISOString(),
				mode: e.mode,
				destination: e.destination,
				excerpts: e.excerptCount,
				bytesSent: e.bytesSent
			}))
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'folio-privacy-report.json';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Privacy Report · Folio</title></svelte:head>

<div class="flex h-svh flex-col">
	<header class="flex items-center justify-between border-b px-6 py-3">
		<div>
			<h1 class="font-display text-lg tracking-tight">Privacy Report</h1>
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				Everything that left this device — or didn't
			</p>
		</div>
		<Button variant="outline" size="sm" class="gap-2" onclick={exportJson} disabled={!loaded}>
			<DownloadIcon class="size-3.5" /> Export JSON
		</Button>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-3xl space-y-6 px-6 py-8">
			{#if loaded && egress.length === 0}
				<Card.Root>
					<Card.Content class="flex flex-col items-center gap-3 py-10 text-center">
						<ShieldCheckIcon class="text-mode-private size-10" />
						<p class="font-display text-2xl tracking-tight">Nothing has left this device.</p>
						<p class="text-muted-foreground max-w-md text-sm">
							{onDevice
								? `${onDevice.requests} answer${onDevice.requests === 1 ? '' : 's'} generated entirely on this device — 0 bytes sent anywhere.`
								: 'Every document, index and conversation is stored locally. This report fills up only if you choose a cloud mode.'}
						</p>
					</Card.Content>
				</Card.Root>
			{:else if loaded}
				<div class="grid gap-3 sm:grid-cols-2">
					{#each egressSummary as s (s.destination)}
						<Card.Root>
							<Card.Content class="py-4">
								<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
									{s.destination}
								</p>
								<p class="font-display mt-1 text-2xl tracking-tight">{fmtBytes(s.bytes)}</p>
								<p class="text-muted-foreground text-xs">
									{s.requests} request{s.requests === 1 ? '' : 's'}
								</p>
							</Card.Content>
						</Card.Root>
					{/each}
					{#if onDevice}
						<Card.Root>
							<Card.Content class="py-4">
								<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
									On this device
								</p>
								<p class="font-display mt-1 text-2xl tracking-tight">0 B</p>
								<p class="text-muted-foreground text-xs">
									{onDevice.requests} private answer{onDevice.requests === 1 ? '' : 's'}
								</p>
							</Card.Content>
						</Card.Root>
					{/if}
				</div>

				<Card.Root>
					<Card.Content class="divide-y p-0">
						{#each egress as e, i (i)}
							<div class="flex items-center gap-3 px-4 py-2.5">
								<span
									class="size-1.5 shrink-0 rounded-full {e.mode === 'assisted'
										? 'bg-mode-assisted'
										: 'bg-mode-myai'}"
								></span>
								<div class="min-w-0 flex-1">
									<p class="text-sm">
										{e.excerptCount} excerpt{e.excerptCount === 1 ? '' : 's'} · {fmtBytes(
											e.bytesSent
										)} → {e.destination}
									</p>
									<p class="text-muted-foreground font-mono text-[10px] uppercase">
										{fmtDate(e.createdAt)}
									</p>
								</div>
								<Badge variant="outline" class="font-mono text-[10px] uppercase">
									{modeLabel(e.mode)}
								</Badge>
							</div>
						{/each}
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	</div>
</div>

<script lang="ts">
	// The egress journal's body, taking its rows as props.
	//
	// Split out of the route so the populated state can be looked at. The page
	// reads three tables from the local database, which means the only way to see
	// what a report with events in it looks like was to send passages to a cloud
	// model first — so nobody ever reviewed the state that matters. Rendering it
	// from a fixture on /dev/landing-stage costs one prop bag and no mock code in
	// the app.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { t } from '$lib/i18n/index.svelte';
	import type { PrivacyEventRow, PrivacySummaryRow } from '$lib/local-db/worker';

	let {
		events,
		summary,
		week,
		loaded,
		error,
		onretry
	}: {
		events: PrivacyEventRow[];
		summary: PrivacySummaryRow[];
		week: PrivacySummaryRow[];
		loaded: boolean;
		error: boolean;
		onretry: () => void;
	} = $props();

	// Spec 021 — "Shared this week" lives here, with the proof.
	const weekEgress = $derived(week.filter((w) => w.destination !== 'device'));
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
		if (mode === 'private') return t('modes.private.name');
		if (mode === 'assisted') return t('modes.assisted.name');
		if (mode === 'myai') return t('modes.myai.name');
		return mode;
	}
</script>

<div class="mx-auto max-w-3xl space-y-6 px-6 py-8">
	{#if loaded && weekEgress.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">{t('settings.week.title')}</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-1">
				{#each weekEgress as row (row.destination)}
					<p class="text-sm">
						<span class="font-mono">{row.destination}</span>
						· {t('common.requests', {
							count: row.requests,
							s: row.requests === 1 ? '' : 's'
						})} · {fmtBytes(row.bytes)}
					</p>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}
	{#if loaded && error}
		<Card.Root>
			<Card.Content class="flex flex-col items-center gap-3 py-10 text-center">
				<TriangleAlertIcon class="text-muted-foreground size-10" />
				<p class="font-display text-2xl tracking-tight">{t('privacy.errorTitle')}</p>
				<p class="text-muted-foreground max-w-md text-sm">{t('privacy.errorBody')}</p>
				<Button variant="outline" size="sm" class="mt-1" onclick={onretry}>
					{t('notice.retry')}
				</Button>
			</Card.Content>
		</Card.Root>
	{:else if loaded && egress.length === 0}
		<!-- The empty report IS the proof, so it gets the same weight as a full one
		     rather than a grey "no data" line. -->
		<Card.Root>
			<Card.Content class="flex flex-col items-center gap-3 py-10 text-center">
				<ShieldCheckIcon class="text-ring size-10" />
				<p class="font-display text-2xl tracking-tight">{t('privacy.nothing')}</p>
				<p class="text-muted-foreground max-w-md text-sm">
					{onDevice
						? t('privacy.deviceSummary', {
								count: onDevice.requests,
								s: onDevice.requests === 1 ? '' : 's'
							})
						: t('privacy.emptyBody')}
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
							{t('common.requests', { count: s.requests, s: s.requests === 1 ? '' : 's' })}
						</p>
					</Card.Content>
				</Card.Root>
			{/each}
			{#if onDevice}
				<Card.Root>
					<Card.Content class="py-4">
						<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
							{t('privacy.onDevice')}
						</p>
						<p class="font-display mt-1 text-2xl tracking-tight">0 B</p>
						<p class="text-muted-foreground text-xs">
							{t('privacy.privateAnswers', {
								count: onDevice.requests,
								s: onDevice.requests === 1 ? '' : 's'
							})}
						</p>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>

		<Card.Root>
			<Card.Content class="divide-y p-0">
				{#each egress as e, i (i)}
					<div class="flex items-center gap-3 px-4 py-2.5">
						<span class="bg-mode-assisted size-1.5 shrink-0 rounded-full"></span>
						<div class="min-w-0 flex-1">
							<p class="text-sm">
								{t('privacy.event', {
									count: e.excerptCount,
									s: e.excerptCount === 1 ? '' : 's',
									bytes: fmtBytes(e.bytesSent),
									dest: e.destination
								})}
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

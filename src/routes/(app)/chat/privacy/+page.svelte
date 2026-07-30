<script lang="ts">
	// Privacy Report (spec 008, FEATURES P1): the egress journal. Every event
	// where data left (or explicitly did not leave) this device, from the local
	// privacy_events table. The empty report IS the product's proof.
	import { Button } from '$lib/components/ui/button';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import PrivacyReport from '$lib/components/privacy-report.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { getLocalDb } from '$lib/local-db/client';
	import type { PrivacyEventRow, PrivacySummaryRow } from '$lib/local-db/worker';

	let events = $state<PrivacyEventRow[]>([]);
	let summary = $state<PrivacySummaryRow[]>([]);
	let week = $state<PrivacySummaryRow[]>([]);
	let loaded = $state(false);
	let error = $state(false);

	async function load() {
		error = false;
		loaded = false;
		try {
			const { db } = await getLocalDb();
			events = await db.listPrivacyEvents(1000);
			summary = await db.privacySummary();
			week = await db.weekPrivacySummary();
		} catch {
			// A failed read must not read as proof: show a distinct error, never
			// the "nothing has left this device" empty state (which claims a fact
			// we could not verify). The finally guarantees the page never hangs.
			error = true;
		} finally {
			loaded = true;
		}
	}

	$effect(() => {
		load();
	});

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
		a.download = 'regeste-privacy-report.json';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>{t('privacy.title')} · Regeste</title></svelte:head>

<div class="flex h-full flex-col">
	<header class="flex h-14 shrink-0 items-center justify-between gap-3 border-b pr-6 pl-4">
		<div class="flex min-w-0 items-center gap-1">
			<Sidebar.Trigger class="shrink-0 md:hidden" />
			<div class="min-w-0 px-1">
				<h1 class="font-display text-lg tracking-tight">{t('privacy.title')}</h1>
				<p class="text-muted-foreground text-xs">{t('privacy.subtitle')}</p>
			</div>
		</div>
		<Button
			variant="outline"
			size="sm"
			class="gap-2"
			onclick={exportJson}
			disabled={!loaded || error}
		>
			<DownloadIcon class="size-3.5" />
			{t('privacy.export')}
		</Button>
	</header>

	<div class="flex-1 overflow-y-auto">
		<PrivacyReport {events} {summary} {week} {loaded} {error} onretry={load} />
	</div>
</div>

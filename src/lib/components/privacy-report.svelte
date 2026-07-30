<script lang="ts">
	// The egress journal, set as a statement of account.
	//
	// It was a dashboard: three stat cards in a two-column grid (so the third sat
	// orphaned on its own row), a "Shared this week" card printing the same
	// figures as the cards 200px below it, and a journal of flat rows each
	// carrying an amber dot. Boxes inside boxes inside boxes, which the data-flow
	// drawing's own comment warns against, and the one number a reader actually
	// wants — how much has ever left — written nowhere, split across cards for
	// them to add up.
	//
	// So: the grammar the rest of the product is already built from. Hairlines
	// instead of borders, mono labels on the left margin, the serif face for
	// figures, and the page's whole answer stated once at the top in one line.
	//
	// Two decisions worth keeping:
	//
	// This device sits in the SAME table as the destinations that received
	// something. That is the entire argument of the page — "nothing left" only
	// means something next to "this much left" — and as a lonely third card it
	// was making no comparison at all.
	//
	// No colour in the journal. Amber marks data leaving the device, but in a
	// journal where every row is an egress event, colouring every row signals
	// nothing and becomes the static decoration the colour rule forbids. Amber
	// appears once, on the total, where it stands against the figure that stayed.
	import { Button } from '$lib/components/ui/button';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { t, i18n } from '$lib/i18n/index.svelte';
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

	const egress = $derived(events.filter((e) => e.destination !== 'device'));
	const egressSummary = $derived(summary.filter((s) => s.destination !== 'device'));
	const onDevice = $derived(summary.find((s) => s.destination === 'device'));
	const weekEgress = $derived(week.filter((w) => w.destination !== 'device'));

	const totals = $derived({
		bytes: egressSummary.reduce((sum, s) => sum + s.bytes, 0),
		requests: egressSummary.reduce((sum, s) => sum + s.requests, 0),
		weekBytes: weekEgress.reduce((sum, s) => sum + s.bytes, 0)
	});

	/** Dates follow the app's language, not the browser's. `undefined` as the
	 * locale reads navigator.language, so a French reader on an English system got
	 * "depuis le July 24" — a French sentence with an English date inside it. */
	const dateLocale = $derived(i18n.locale === 'fr' ? 'fr-FR' : 'en-GB');

	/** The oldest event dates the statement. A window stated as a real date beats
	 * "all time": it is checkable, and it is the kind of figure this product
	 * prefers to an adjective. */
	const since = $derived(
		events.length
			? new Date(Math.min(...events.map((e) => e.createdAt))).toLocaleDateString(dateLocale, {
					day: 'numeric',
					month: 'long'
				})
			: null
	);

	function fmtBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		return `${(n / 1024).toFixed(1)} KB`;
	}

	function modeLabel(mode: string): string {
		if (mode === 'private') return t('modes.private.name');
		if (mode === 'assisted') return t('modes.assisted.name');
		if (mode === 'myai') return t('modes.myai.name');
		return mode;
	}

	/** A journal is a time series, so it reads by day. Flat rows with a timestamp
	 * on each one made the reader do the grouping.
	 *
	 * Built by walking the list rather than through a Map: the events arrive
	 * newest first, so a run of the same day is contiguous and comparing against
	 * the last group is enough. It also keeps the lint rule about reactive
	 * collections moot — nothing here needs to be reactive, it is one pass. */
	const byDay = $derived.by(() => {
		const groups: { day: string; rows: PrivacyEventRow[] }[] = [];
		for (const e of egress) {
			const day = new Date(e.createdAt).toLocaleDateString(dateLocale, {
				weekday: 'long',
				day: 'numeric',
				month: 'long'
			});
			const last = groups.at(-1);
			if (last?.day === day) last.rows.push(e);
			else groups.push({ day, rows: [e] });
		}
		return groups;
	});

	const time = (ts: number) =>
		new Date(ts).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
</script>

<div class="mx-auto max-w-3xl px-6 py-10">
	{#if !loaded}
		<!-- Nothing: no skeleton pretending to be a report. A claim about what left
		     this device must never be shown before it has been read. -->
	{:else if error}
		<div class="flex flex-col items-center gap-3 py-16 text-center">
			<TriangleAlertIcon class="text-muted-foreground size-9" />
			<p class="font-display text-2xl tracking-tight">{t('privacy.errorTitle')}</p>
			<p class="text-muted-foreground max-w-md text-sm leading-relaxed">
				{t('privacy.errorBody')}
			</p>
			<Button variant="outline" size="sm" class="mt-2" onclick={onretry}>{t('notice.retry')}</Button
			>
		</div>
	{:else if egress.length === 0}
		<!-- The empty report IS the proof, so it keeps the full weight of the page
		     and none of the chrome: a statement with one line on it. -->
		<div class="flex flex-col items-center gap-4 py-20 text-center">
			<ShieldCheckIcon class="text-ring size-10" />
			<p class="font-display text-[2rem] leading-tight tracking-tight text-balance">
				{t('privacy.nothing')}
			</p>
			<p class="text-muted-foreground max-w-md leading-relaxed text-balance">
				{onDevice
					? t('privacy.deviceSummary', {
							count: onDevice.requests,
							s: onDevice.requests === 1 ? '' : 's'
						})
					: t('privacy.emptyBody')}
			</p>
		</div>
	{:else}
		<!-- ——— The answer, once. ——— -->
		<div class="stmt-in grid gap-x-10 gap-y-6 sm:grid-cols-2">
			<div>
				<!-- Amber marks what left the device, on the label rather than the
				     figure: at 44px the colour stopped being a signal and became the
				     loudest thing on a page that is meant to read sober. -->
				<p
					class="font-mono text-[10px] tracking-widest text-amber-700 uppercase dark:text-amber-500"
				>
					{t('privacy.leftDevice')}
				</p>
				<p class="font-display mt-2 text-[2.75rem] leading-none tracking-tight tabular-nums">
					{fmtBytes(totals.bytes)}
				</p>
				<p class="text-muted-foreground mt-2.5 text-sm leading-relaxed">
					{t('privacy.inRequests', {
						count: totals.requests,
						s: totals.requests === 1 ? '' : 's'
					})}{since ? ` · ${t('privacy.since', { date: since })}` : ''}
				</p>
			</div>
			<div class="sm:justify-self-end sm:text-right">
				<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
					{t('privacy.stayedHere')}
				</p>
				<p class="font-display mt-2 text-[2.75rem] leading-none tracking-tight tabular-nums">
					{onDevice?.requests ?? 0}
				</p>
				<p class="text-muted-foreground mt-2.5 text-sm leading-relaxed">
					{t('privacy.answersHere')}
				</p>
			</div>
		</div>

		<!-- ——— Where it went. One table, this device in it. ——— -->
		<div class="stmt-in mt-14" style="--stmt-delay: 80ms">
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				{t('privacy.whereItWent')}
			</p>
			<table class="mt-4 w-full text-sm">
				<thead>
					<tr class="border-border text-muted-foreground border-b">
						<th class="py-2 text-left font-mono text-[10px] font-normal tracking-widest uppercase">
							{t('privacy.col.destination')}
						</th>
						<th class="py-2 text-right font-mono text-[10px] font-normal tracking-widest uppercase">
							{t('privacy.col.requests')}
						</th>
						<th class="py-2 text-right font-mono text-[10px] font-normal tracking-widest uppercase">
							{t('privacy.col.sent')}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each egressSummary as row (row.destination)}
						<tr class="border-border border-b">
							<td class="py-3 font-mono">{row.destination}</td>
							<td class="py-3 text-right tabular-nums">{row.requests}</td>
							<td class="py-3 text-right tabular-nums">{fmtBytes(row.bytes)}</td>
						</tr>
					{/each}
					{#if onDevice}
						<!-- Same axis as the rest, which is the whole point: a zero only
						     means something beside the figures it is not. -->
						<tr class="border-border border-b">
							<td class="text-muted-foreground py-3 font-mono">{t('privacy.thisDevice')}</td>
							<td class="text-muted-foreground py-3 text-right tabular-nums">
								{onDevice.requests}
							</td>
							<td class="py-3 text-right tabular-nums">0 B</td>
						</tr>
					{/if}
				</tbody>
			</table>
			{#if totals.weekBytes > 0 && totals.weekBytes !== totals.bytes}
				<!-- Only when the week differs from the total. Printing both when they
				     are the same number was the old card's mistake. -->
				<p class="text-muted-foreground mt-3 font-mono text-[11px]">
					{t('privacy.thisWeek', { bytes: fmtBytes(totals.weekBytes) })}
				</p>
			{/if}
		</div>

		<!-- ——— The journal, by day. ——— -->
		<div class="stmt-in mt-14" style="--stmt-delay: 160ms">
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				{t('privacy.journal')}
			</p>
			<div class="mt-4 space-y-8">
				{#each byDay as group (group.day)}
					<div>
						<p
							class="border-border text-muted-foreground border-b pb-2 font-mono text-[10px] tracking-widest uppercase"
						>
							{group.day}
						</p>
						{#each group.rows as e, i (i)}
							<div class="border-border flex items-baseline gap-4 border-b py-3">
								<span
									class="text-muted-foreground w-[4.5rem] shrink-0 font-mono text-[11px] whitespace-nowrap tabular-nums"
								>
									{time(e.createdAt)}
								</span>
								<span class="min-w-0 flex-1 text-sm">
									{t('privacy.event', {
										count: e.excerptCount,
										s: e.excerptCount === 1 ? '' : 's',
										bytes: fmtBytes(e.bytesSent),
										dest: e.destination
									})}
								</span>
								<span class="text-muted-foreground shrink-0 font-mono text-[10px] uppercase">
									{modeLabel(e.mode)}
								</span>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	/* One orchestrated arrival, the same rise the landing uses. A report is read
	   top to bottom, so it appears that way. */
	.stmt-in {
		animation: stmt-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
		animation-delay: var(--stmt-delay, 0ms);
	}

	@keyframes stmt-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.stmt-in {
			animation: none;
		}
	}
</style>

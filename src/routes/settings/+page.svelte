<script lang="ts">
	// Settings (spec 009): storage status (T6), weekly privacy counter (P4),
	// force offline (T2), panic wipe (T1). Everything on this page is local.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { resolve } from '$app/paths';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import { getLocalDb } from '$lib/local-db/client';
	import type { PrivacySummaryRow } from '$lib/local-db/worker';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { modelsStore } from '$lib/state/models.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';

	const modeChoices = [
		{ mode: 'system', label: 'settings.appearance.system' },
		{ mode: 'light', label: 'settings.appearance.light' },
		{ mode: 'dark', label: 'settings.appearance.dark' }
	] as const;

	let week = $state<PrivacySummaryRow[]>([]);
	let wipeOpen = $state(false);
	let wipeArmed = $state(false);

	$effect(() => {
		i18n.init();
		settingsStore.init();
		settingsStore.refreshStorage();
		settingsStore.refreshQuota();
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

<svelte:head><title>{t('settings.title')} · Folio</title></svelte:head>

<div class="flex h-full flex-col">
	<header class="flex items-center gap-1 border-b px-4 py-3">
		<Sidebar.Trigger class="shrink-0" />
		<div class="min-w-0 px-1">
			<h1 class="font-display text-lg tracking-tight">{t('settings.title')}</h1>
			<p class="text-muted-foreground text-xs">{t('settings.subtitle')}</p>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-2xl space-y-6 px-6 py-8">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">{t('settings.storage.title')}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
					{#if settingsStore.storage}
						<p class="text-sm">
							{t('settings.storage.used', { used: fmtBytes(settingsStore.storage.usage) })}
							{#if settingsStore.storage.quota}
								· {t('settings.storage.available', {
									quota: fmtBytes(settingsStore.storage.quota)
								})}
							{/if}
						</p>
						{#if settingsStore.storage.persisted}
							<Badge variant="outline" class="gap-1 text-[10px]">
								<span class="bg-mode-private size-1.5 rounded-full"></span>
								{t('settings.storage.persistent')}
							</Badge>
						{:else}
							<div class="space-y-2">
								<Badge variant="secondary" class="text-[10px]">
									{t('settings.storage.notPersistent')}
								</Badge>
								<div>
									<Button
										variant="outline"
										size="sm"
										onclick={() => settingsStore.requestPersistence()}
									>
										{t('settings.storage.ask')}
									</Button>
								</div>
							</div>
						{/if}
					{:else}
						<p class="text-muted-foreground text-sm">{t('settings.storage.unavailable')}</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">{t('settings.week.title')}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-2">
					{#if weekEgress.length === 0}
						<p class="flex items-center gap-2 text-sm">
							<ShieldIcon class="text-mode-private size-4" />
							{t('settings.week.nothing')}
						</p>
					{:else}
						{#each weekEgress as row (row.destination)}
							<p class="text-sm">
								<span class="font-mono">{row.destination}</span> — {t('common.requests', {
									count: row.requests,
									s: row.requests === 1 ? '' : 's'
								})} · {fmtBytes(row.bytes)}
							</p>
						{/each}
					{/if}
					<p class="text-muted-foreground text-xs">
						{t('settings.week.fullHistory')}
						<a class="underline" href={resolve('/privacy')}>{t('settings.week.privacyReport')}</a>
						· {t('settings.week.howEachMode')}
						<a class="underline" href={resolve('/how-it-works')}>{t('settings.week.dataFlows')}</a>
					</p>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">{t('settings.language.title')}</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="flex gap-2">
						<Button
							variant={i18n.locale === 'en' ? 'secondary' : 'outline'}
							size="sm"
							onclick={() => i18n.setLocale('en')}
						>
							English
						</Button>
						<Button
							variant={i18n.locale === 'fr' ? 'secondary' : 'outline'}
							size="sm"
							onclick={() => i18n.setLocale('fr')}
						>
							Français
						</Button>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">{t('settings.appearance.title')}</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="flex gap-2">
						{#each modeChoices as { mode, label } (mode)}
							<Button
								variant={userPrefersMode.current === mode ? 'secondary' : 'outline'}
								size="sm"
								onclick={() => setMode(mode)}
							>
								{t(label)}
							</Button>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">{t('settings.offline.title')}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-2">
					<div class="flex items-center justify-between gap-4">
						<Label for="force-offline" class="text-sm font-normal">
							{t('settings.offline.label')}
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
							{t('settings.offline.badge')}
						</Badge>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">{t('settings.workspace.title')}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
					<div class="flex items-center justify-between gap-3">
						<p class="text-muted-foreground text-sm">
							{t('settings.workspace.exportDesc')}
						</p>
						<Button
							variant="outline"
							size="sm"
							class="shrink-0"
							disabled={settingsStore.exporting}
							onclick={() => settingsStore.exportWorkspace()}
						>
							{settingsStore.exporting
								? t('settings.workspace.packing')
								: t('settings.workspace.export')}
						</Button>
					</div>
					<div class="border-t pt-3">
						{#if settingsStore.quota}
							<p class="text-sm">
								{t('settings.workspace.quota', {
									used: settingsStore.quota.used,
									limit: settingsStore.quota.limit
								})}
							</p>
						{:else}
							<p class="text-muted-foreground text-xs">
								{t('settings.workspace.quotaSignIn')}
							</p>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">{t('settings.models.title')}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
					{#if modelsStore.cached.length === 0}
						<p class="text-muted-foreground text-sm">
							{modelsStore.loading ? t('settings.models.measuring') : t('settings.models.none')}
						</p>
					{:else}
						{#each modelsStore.cached as model (model.cacheName)}
							<div class="flex items-center justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate text-sm">{model.label}</p>
									<p class="text-muted-foreground font-mono text-[10px] uppercase">
										{model.bytes
											? fmtBytes(model.bytes)
											: t('settings.models.files', { count: model.entries })}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onclick={() => modelsStore.remove(model.cacheName)}
								>
									{t('settings.models.delete')}
								</Button>
							</div>
						{/each}
					{/if}
					<div class="border-t pt-3">
						<div class="flex items-center justify-between gap-3">
							<p class="text-muted-foreground text-sm">
								{t('settings.models.benchDesc')}
							</p>
							<Button
								variant="outline"
								size="sm"
								class="shrink-0"
								disabled={llmStore.status !== 'ready' || modelsStore.benchmarking}
								onclick={() => modelsStore.runBenchmark()}
							>
								{modelsStore.benchmarking
									? t('settings.models.testing')
									: t('settings.models.test')}
							</Button>
						</div>
						{#if llmStore.status !== 'ready'}
							<p class="text-muted-foreground mt-1 text-xs">
								{t('settings.models.prepareFirst')}
							</p>
						{/if}
						{#if modelsStore.benchmark}
							<p class="mt-2 text-sm">
								{t('settings.models.tps', { tps: modelsStore.benchmark.tokensPerSecond })} —
								{modelsStore.benchmark.recommendPrivate
									? t('settings.models.comfortable')
									: t('settings.models.slow')}
							</p>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root class="border-destructive/40">
				<Card.Header>
					<Card.Title class="text-base">{t('settings.wipe.title')}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
					<p class="text-muted-foreground text-sm">
						{t('settings.wipe.desc')}
					</p>
					<Button variant="destructive" onclick={() => (wipeOpen = true)}>
						{t('settings.wipe.cta')}
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
				{wipeArmed ? t('settings.wipe.last') : t('settings.wipe.confirmTitle')}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{#if wipeArmed}
					{t('settings.wipe.armedBody')}
				{:else}
					{t('settings.wipe.body')}
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{t('common.cancel')}</AlertDialog.Cancel>
			{#if wipeArmed}
				<AlertDialog.Action
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					disabled={settingsStore.wiping}
					onclick={(e) => {
						e.preventDefault();
						settingsStore.wipeEverything();
					}}
				>
					{settingsStore.wiping ? t('settings.wipe.erasing') : t('settings.wipe.confirm')}
				</AlertDialog.Action>
			{:else}
				<AlertDialog.Action
					onclick={(e) => {
						e.preventDefault();
						wipeArmed = true;
					}}
				>
					{t('settings.wipe.continue')}
				</AlertDialog.Action>
			{/if}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

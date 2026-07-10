<script lang="ts">
	// Settings modal (spec 021): left tab rail, four tabs — the ChatGPT shape.
	// Replaces the /chat/settings page. Contextual trust flows stay in the right
	// panel; a settings dialog is the market convention and allowed by ui.md.
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Select from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import { Switch } from '$lib/components/ui/switch';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { authClient } from '$lib/auth-client';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { modelsStore } from '$lib/state/models.svelte';
	import { myaiStore } from '$lib/state/myai.svelte';
	import { sessionStore } from '$lib/state/session.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { uiStore } from '$lib/state/ui.svelte';

	type Tab = 'general' | 'data' | 'ai' | 'account';
	let tab = $state<Tab>('general');
	const tabs: { id: Tab; label: `settings.tabs.${Tab}` }[] = [
		{ id: 'general', label: 'settings.tabs.general' },
		{ id: 'data', label: 'settings.tabs.data' },
		{ id: 'ai', label: 'settings.tabs.ai' },
		{ id: 'account', label: 'settings.tabs.account' }
	];

	const themeChoices = [
		{ mode: 'system', label: 'settings.appearance.system' },
		{ mode: 'light', label: 'settings.appearance.light' },
		{ mode: 'dark', label: 'settings.appearance.dark' }
	] as const;

	const modeLabels = { private: 'Private', assisted: 'Assisted', myai: 'My AI' } as const;

	let wipeOpen = $state(false);
	let wipeArmed = $state(false);
	let deleteChatsOpen = $state(false);
	let deleteAccountOpen = $state(false);
	let busy = $state(false);

	// My AI endpoint drafts, seeded when the dialog opens.
	let urlDraft = $state('');
	let keyDraft = $state('');
	$effect(() => {
		if (uiStore.settingsOpen) {
			urlDraft = myaiStore.baseUrl ?? '';
			keyDraft = myaiStore.apiKey ?? '';
			settingsStore.refreshStorage();
			settingsStore.refreshQuota();
			llmStore.init();
			myaiStore.init();
			modelsStore.refresh();
		}
	});

	async function deleteAllChats() {
		busy = true;
		try {
			for (const chat of [...chatsStore.chats]) await chatsStore.remove(chat.id);
		} finally {
			busy = false;
			deleteChatsOpen = false;
		}
	}

	async function logoutAll() {
		busy = true;
		try {
			await authClient.revokeSessions();
			await sessionStore.signOut();
			await sessionStore.refresh();
		} finally {
			busy = false;
		}
	}

	async function deleteAccount() {
		busy = true;
		try {
			await authClient.deleteUser();
			await sessionStore.refresh();
		} finally {
			busy = false;
			deleteAccountOpen = false;
		}
	}

	function fmtBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<Dialog.Root bind:open={uiStore.settingsOpen}>
	<Dialog.Content class="gap-0 p-0 sm:max-w-3xl">
		<Dialog.Header class="border-b px-5 py-3.5">
			<Dialog.Title class="text-base">{t('settings.title')}</Dialog.Title>
		</Dialog.Header>
		<div class="grid h-[540px] max-h-[70svh] grid-cols-[10.5rem_1fr]">
			<nav class="flex flex-col gap-0.5 border-r p-2">
				{#each tabs as { id, label } (id)}
					<Button
						variant="ghost"
						size="sm"
						class="justify-start {tab === id ? 'bg-foreground/7' : 'text-muted-foreground'}"
						aria-current={tab === id ? 'page' : undefined}
						onclick={() => (tab = id)}
					>
						{t(label)}
					</Button>
				{/each}
			</nav>
			<ScrollArea class="min-h-0">
				<div class="space-y-6 p-5">
					{#if tab === 'general'}
						<section class="space-y-2">
							<h3 class="text-sm font-semibold">{t('settings.appearance.title')}</h3>
							<div class="flex gap-2">
								{#each themeChoices as { mode, label } (mode)}
									<Button
										variant={userPrefersMode.current === mode ? 'secondary' : 'outline'}
										size="sm"
										onclick={() => setMode(mode)}
									>
										{t(label)}
									</Button>
								{/each}
							</div>
						</section>
						<Separator />
						<section class="space-y-2">
							<h3 class="text-sm font-semibold">{t('settings.language.title')}</h3>
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
						</section>
						<Separator />
						<section class="space-y-2">
							<h3 class="text-sm font-semibold">{t('settings.font.title')}</h3>
							<div class="flex gap-2">
								<Button
									variant={settingsStore.readingFont === 'default' ? 'secondary' : 'outline'}
									size="sm"
									onclick={() => settingsStore.setReadingFont('default')}
								>
									{t('settings.font.default')}
								</Button>
								<Button
									variant={settingsStore.readingFont === 'dyslexic' ? 'secondary' : 'outline'}
									size="sm"
									onclick={() => settingsStore.setReadingFont('dyslexic')}
								>
									{t('settings.font.dyslexic')}
								</Button>
							</div>
						</section>
						<Separator />
						<section class="space-y-2">
							<h3 class="text-sm font-semibold">{t('settings.defaultMode.title')}</h3>
							<Select.Root
								type="single"
								value={settingsStore.defaultMode}
								onValueChange={(v) =>
									v && settingsStore.setDefaultMode(v as 'private' | 'assisted' | 'myai')}
							>
								<Select.Trigger class="w-44">
									{modeLabels[settingsStore.defaultMode]}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="private">Private</Select.Item>
									<Select.Item value="assisted">Assisted</Select.Item>
									<Select.Item value="myai">My AI</Select.Item>
								</Select.Content>
							</Select.Root>
						</section>
					{:else if tab === 'data'}
						<section class="space-y-2">
							<h3 class="text-sm font-semibold">{t('settings.storage.title')}</h3>
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
									<Badge class="text-[10px]">{t('settings.storage.persistent')}</Badge>
								{:else}
									<div class="flex items-center gap-3">
										<Badge variant="secondary" class="text-[10px]">
											{t('settings.storage.notPersistent')}
										</Badge>
										<Button
											variant="outline"
											size="sm"
											onclick={() => settingsStore.requestPersistence()}
										>
											{t('settings.storage.ask')}
										</Button>
									</div>
								{/if}
							{:else}
								<p class="text-muted-foreground text-sm">{t('settings.storage.unavailable')}</p>
							{/if}
						</section>
						<Separator />
						<section class="flex items-center justify-between gap-4">
							<div class="min-w-0">
								<h3 class="text-sm font-semibold">{t('settings.workspace.title')}</h3>
								<p class="text-muted-foreground text-xs">{t('settings.workspace.exportDesc')}</p>
							</div>
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
						</section>
						<Separator />
						<section class="flex items-center justify-between gap-4">
							<Label for="force-offline" class="text-sm font-normal">
								{t('settings.offline.label')}
							</Label>
							<Switch
								id="force-offline"
								checked={settingsStore.forceOffline}
								onCheckedChange={(v) => settingsStore.setForceOffline(v === true)}
							/>
						</section>
						<Separator />
						<section class="flex items-center justify-between gap-4">
							<div class="min-w-0">
								<h3 class="text-sm font-semibold">{t('settings.deleteChats.title')}</h3>
								<p class="text-muted-foreground text-xs">{t('settings.deleteChats.desc')}</p>
							</div>
							<Button
								variant="destructive"
								size="sm"
								class="shrink-0"
								onclick={() => (deleteChatsOpen = true)}
							>
								{t('settings.deleteChats.cta')}
							</Button>
						</section>
						<Separator />
						<section class="flex items-center justify-between gap-4">
							<div class="min-w-0">
								<h3 class="text-sm font-semibold">{t('settings.wipe.title')}</h3>
								<p class="text-muted-foreground text-xs">{t('settings.wipe.desc')}</p>
							</div>
							<Button
								variant="destructive"
								size="sm"
								class="shrink-0"
								onclick={() => (wipeOpen = true)}
							>
								{t('settings.wipe.cta')}
							</Button>
						</section>
					{:else if tab === 'ai'}
						<section class="space-y-3">
							<h3 class="text-sm font-semibold">{t('settings.models.title')}</h3>
							{#if modelsStore.cached.length === 0}
								<p class="text-muted-foreground text-sm">
									{modelsStore.loading ? t('settings.models.measuring') : t('settings.models.none')}
								</p>
							{:else}
								{#each modelsStore.cached as model (model.cacheName)}
									<div class="flex items-center justify-between gap-3">
										<div class="min-w-0">
											<p class="truncate text-sm">{model.label}</p>
											<p class="text-muted-foreground font-mono text-[10px]">
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
							<div class="flex items-center justify-between gap-3 border-t pt-3">
								<p class="text-muted-foreground text-xs">{t('settings.models.benchDesc')}</p>
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
							{#if modelsStore.benchmark}
								<p class="text-sm">
									{t('settings.models.tps', { tps: modelsStore.benchmark.tokensPerSecond })} —
									{modelsStore.benchmark.recommendPrivate
										? t('settings.models.comfortable')
										: t('settings.models.slow')}
								</p>
							{/if}
						</section>
						<Separator />
						<section class="space-y-3">
							<h3 class="text-sm font-semibold">{t('settings.myai.title')}</h3>
							<div class="space-y-2">
								<Label for="myai-url" class="text-xs font-normal">{t('myai.baseUrl')}</Label>
								<Input
									id="myai-url"
									bind:value={urlDraft}
									placeholder="http://localhost:11434/v1"
								/>
								<Label for="myai-key" class="text-xs font-normal">{t('myai.apiKey')}</Label>
								<Input
									id="myai-key"
									type="password"
									bind:value={keyDraft}
									placeholder={t('myai.keyPlaceholder')}
								/>
							</div>
							<div class="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={!urlDraft.trim() || myaiStore.testStatus === 'testing'}
									onclick={() => myaiStore.saveEndpoint(urlDraft, keyDraft)}
								>
									{myaiStore.testStatus === 'testing' ? t('myai.testing') : t('myai.test')}
								</Button>
								{#if myaiStore.testStatus === 'error' && myaiStore.testError}
									<p class="text-destructive text-xs">{myaiStore.testError}</p>
								{/if}
							</div>
							{#if myaiStore.models.length}
								<Select.Root
									type="single"
									value={myaiStore.defaultModel ?? undefined}
									onValueChange={(v) => v && myaiStore.saveDefaultModel(v)}
								>
									<Select.Trigger class="w-64">
										{myaiStore.defaultModel ?? t('myai.pickModel')}
									</Select.Trigger>
									<Select.Content>
										{#each myaiStore.models as m (m)}
											<Select.Item value={m}>{m}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							{/if}
							<p class="text-muted-foreground text-xs">{t('myai.direct')}</p>
						</section>
						<Separator />
						<section class="space-y-1">
							<h3 class="text-sm font-semibold">Assisted</h3>
							{#if settingsStore.quota}
								<p class="text-sm">
									{t('settings.workspace.quota', {
										used: settingsStore.quota.used,
										limit: settingsStore.quota.limit
									})}
								</p>
							{:else}
								<p class="text-muted-foreground text-xs">{t('settings.workspace.quotaSignIn')}</p>
							{/if}
						</section>
					{:else}
						<section class="space-y-2">
							<h3 class="text-sm font-semibold">{t('settings.tabs.account')}</h3>
							{#if sessionStore.user}
								<p class="text-sm">{t('account.signedInAs')} {sessionStore.user.email}</p>
								<div class="flex flex-wrap gap-2 pt-1">
									<Button
										variant="outline"
										size="sm"
										onclick={async () => {
											await sessionStore.signOut();
											await sessionStore.refresh();
										}}
									>
										{t('account.signOut')}
									</Button>
									<Button variant="outline" size="sm" disabled={busy} onclick={logoutAll}>
										{t('settings.account.logoutAll')}
									</Button>
								</div>
								<Separator class="my-4" />
								<div class="flex items-center justify-between gap-4">
									<div class="min-w-0">
										<h3 class="text-sm font-semibold">{t('settings.account.deleteTitle')}</h3>
										<p class="text-muted-foreground text-xs">
											{t('settings.account.deleteDesc')}
										</p>
									</div>
									<Button
										variant="destructive"
										size="sm"
										class="shrink-0"
										onclick={() => (deleteAccountOpen = true)}
									>
										{t('settings.account.deleteCta')}
									</Button>
								</div>
							{:else}
								<p class="text-muted-foreground text-sm">{t('settings.account.guest')}</p>
								<Button
									variant="outline"
									size="sm"
									onclick={() => {
										uiStore.settingsOpen = false;
										location.assign('/chat/account');
									}}
								>
									{t('menu.signIn')}
								</Button>
							{/if}
						</section>
					{/if}
				</div>
			</ScrollArea>
		</div>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={deleteChatsOpen} onOpenChange={(o) => (deleteChatsOpen = o)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{t('settings.deleteChats.confirmTitle')}</AlertDialog.Title>
			<AlertDialog.Description>{t('settings.deleteChats.desc')}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{t('common.cancel')}</AlertDialog.Cancel>
			<AlertDialog.Action
				class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				disabled={busy}
				onclick={(e) => {
					e.preventDefault();
					deleteAllChats();
				}}
			>
				{t('settings.deleteChats.cta')}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={deleteAccountOpen} onOpenChange={(o) => (deleteAccountOpen = o)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{t('settings.account.deleteConfirm')}</AlertDialog.Title>
			<AlertDialog.Description>{t('settings.account.deleteDesc')}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{t('common.cancel')}</AlertDialog.Cancel>
			<AlertDialog.Action
				class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				disabled={busy}
				onclick={(e) => {
					e.preventDefault();
					deleteAccount();
				}}
			>
				{t('settings.account.deleteCta')}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

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
				{wipeArmed ? t('settings.wipe.armedBody') : t('settings.wipe.body')}
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

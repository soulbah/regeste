<script lang="ts">
	// Settings modal (spec 021, owner design pass): a tinted rail with iconed
	// tabs and the green accent bar (the ⌘K signature), and Claude-style rows —
	// label + description left, control right. Essentials only.
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Select from '$lib/components/ui/select';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import { Switch } from '$lib/components/ui/switch';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import XIcon from '@lucide/svelte/icons/x';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
	const tabs = [
		{ id: 'general', label: 'settings.tabs.general', icon: SlidersHorizontalIcon },
		{ id: 'data', label: 'settings.tabs.data', icon: DatabaseIcon },
		{ id: 'ai', label: 'settings.tabs.ai', icon: CpuIcon },
		{ id: 'account', label: 'settings.tabs.account', icon: UserRoundIcon }
	] as const;
	const activeTab = $derived(tabs.find((x) => x.id === tab) ?? tabs[0]);

	const themeChoices = [
		{ value: 'system', label: 'settings.appearance.system', icon: MonitorIcon },
		{ value: 'light', label: 'settings.appearance.light', icon: SunIcon },
		{ value: 'dark', label: 'settings.appearance.dark', icon: MoonIcon }
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

{#snippet row(title: string, desc: string | null, control: import('svelte').Snippet)}
	<div class="flex items-center justify-between gap-6 py-3.5">
		<div class="min-w-0">
			<p class="text-sm font-medium">{title}</p>
			{#if desc}
				<p class="text-muted-foreground mt-0.5 text-xs leading-relaxed">{desc}</p>
			{/if}
		</div>
		<div class="shrink-0">
			{@render control()}
		</div>
	</div>
{/snippet}

{#snippet segmented(
	options: readonly { value: string; text: string; icon?: typeof SunIcon }[],
	active: string,
	onpick: (value: string) => void
)}
	<div class="bg-muted/70 flex gap-0.5 rounded-lg p-0.5">
		{#each options as opt (opt.value)}
			<Button
				variant="ghost"
				size="xs"
				class="h-7 gap-1.5 rounded-[7px] px-3 {active === opt.value
					? 'bg-card dark:bg-foreground/14 hover:bg-card dark:hover:bg-foreground/14 text-foreground shadow-xs'
					: 'text-muted-foreground'}"
				aria-pressed={active === opt.value}
				onclick={() => onpick(opt.value)}
			>
				{#if opt.icon}
					<opt.icon class="size-3.5" />
				{/if}
				{opt.text}
			</Button>
		{/each}
	</div>
{/snippet}

{#snippet kicker(text: string)}
	<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
		{text}
	</p>
{/snippet}

<Dialog.Root bind:open={uiStore.settingsOpen}>
	<Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-3xl" showCloseButton={false}>
		<Dialog.Header class="sr-only">
			<Dialog.Title>{t('settings.title')}</Dialog.Title>
		</Dialog.Header>
		<!-- The dialog mounts outside Sidebar.Provider, so it brings its own
		     tooltip context. -->
		<Tooltip.Provider delayDuration={300}>
			<div class="grid h-[540px] max-h-[70svh] grid-cols-[11.5rem_1fr]">
				<!-- Rail: tinted like the sidebar, iconed tabs, green accent bar on the
			     active one — the same signature as the ⌘K selection. -->
				<nav class="bg-sidebar/60 flex flex-col border-r p-2">
					<p class="font-display px-3 pt-2 pb-3 text-lg tracking-tight">{t('settings.title')}</p>
					<div class="flex flex-col gap-0.5">
						{#each tabs as { id, label, icon: Icon } (id)}
							<Button
								variant="ghost"
								size="sm"
								class="relative justify-start gap-2.5 {tab === id
									? 'bg-foreground/7 text-foreground before:bg-ring before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full'
									: 'text-muted-foreground'}"
								aria-current={tab === id ? 'page' : undefined}
								onclick={() => (tab = id)}
							>
								<Icon class="size-4" />
								{t(label)}
							</Button>
						{/each}
					</div>
					<p class="text-muted-foreground mt-auto px-3 pb-1 font-mono text-[10px]">Folio</p>
				</nav>
				<div class="flex min-h-0 flex-col">
					<!-- Fixed header: the close button lives here so it never rides over
				     scrolled content. -->
					<div class="flex h-12 shrink-0 items-center justify-between border-b pr-3 pl-6">
						<p class="text-sm font-medium">{t(activeTab.label)}</p>
						<Dialog.Close>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="icon-sm">
									<XIcon />
									<span class="sr-only">{t('common.close')}</span>
								</Button>
							{/snippet}
						</Dialog.Close>
					</div>
					<ScrollArea class="min-h-0 flex-1">
						<div class="px-6 py-2">
							{#if tab === 'general'}
								{#snippet themeControl()}
									{@render segmented(
										themeChoices.map((c) => ({ value: c.value, text: t(c.label), icon: c.icon })),
										userPrefersMode.current,
										(v) => setMode(v as 'light' | 'dark' | 'system')
									)}
								{/snippet}
								{@render row(t('settings.appearance.title'), null, themeControl)}
								<Separator />
								{#snippet langControl()}
									{@render segmented(
										[
											{ value: 'en', text: 'English' },
											{ value: 'fr', text: 'Français' }
										],
										i18n.locale,
										(v) => i18n.setLocale(v as 'en' | 'fr')
									)}
								{/snippet}
								{@render row(t('settings.language.title'), null, langControl)}
								<Separator />
								{#snippet modeControl()}
									<Select.Root
										type="single"
										value={settingsStore.defaultMode}
										onValueChange={(v) =>
											v && settingsStore.setDefaultMode(v as 'private' | 'assisted' | 'myai')}
									>
										<Select.Trigger class="w-36">
											{modeLabels[settingsStore.defaultMode]}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="private">Private</Select.Item>
											<Select.Item value="assisted">Assisted</Select.Item>
											<Select.Item value="myai">My AI</Select.Item>
										</Select.Content>
									</Select.Root>
								{/snippet}
								{@render row(
									t('settings.defaultMode.title'),
									t('modes.private.description'),
									modeControl
								)}
							{:else if tab === 'data'}
								{#snippet storageControl()}
									{#if settingsStore.storage && !settingsStore.storage.persisted}
										<Button
											variant="outline"
											size="sm"
											onclick={() => settingsStore.requestPersistence()}
										>
											{t('settings.storage.ask')}
										</Button>
									{:else if settingsStore.storage?.persisted}
										<Badge class="text-[10px]">{t('settings.storage.persistent')}</Badge>
									{/if}
								{/snippet}
								{@render row(
									t('settings.storage.title'),
									settingsStore.storage
										? `${t('settings.storage.used', { used: fmtBytes(settingsStore.storage.usage) })}${
												settingsStore.storage.quota
													? ` · ${t('settings.storage.available', { quota: fmtBytes(settingsStore.storage.quota) })}`
													: ''
											}`
										: t('settings.storage.unavailable'),
									storageControl
								)}
								<Separator />
								{#snippet exportControl()}
									<Button
										variant="outline"
										size="sm"
										disabled={settingsStore.exporting}
										onclick={() => settingsStore.exportWorkspace()}
									>
										{settingsStore.exporting
											? t('settings.workspace.packing')
											: t('settings.workspace.export')}
									</Button>
								{/snippet}
								{@render row(
									t('settings.workspace.title'),
									t('settings.workspace.exportDesc'),
									exportControl
								)}
								<Separator />
								{#snippet offlineControl()}
									<Switch
										checked={settingsStore.forceOffline}
										onCheckedChange={(v) => settingsStore.setForceOffline(v === true)}
										aria-label={t('settings.offline.title')}
									/>
								{/snippet}
								{@render row(
									t('settings.offline.title'),
									t('settings.offline.label'),
									offlineControl
								)}
								<Separator />
								{#snippet deleteChatsControl()}
									<Button variant="destructive" size="sm" onclick={() => (deleteChatsOpen = true)}>
										{t('settings.deleteChats.cta')}
									</Button>
								{/snippet}
								{@render row(
									t('settings.deleteChats.title'),
									t('settings.deleteChats.desc'),
									deleteChatsControl
								)}
								<Separator />
								{#snippet wipeControl()}
									<Button variant="destructive" size="sm" onclick={() => (wipeOpen = true)}>
										{t('settings.wipe.cta')}
									</Button>
								{/snippet}
								{@render row(t('settings.wipe.title'), t('settings.wipe.desc'), wipeControl)}
							{:else if tab === 'ai'}
								<div class="py-3.5">
									{@render kicker(t('settings.models.title'))}
									{#if modelsStore.cached.length === 0}
										<p class="text-muted-foreground mt-0.5 text-xs">
											{modelsStore.loading
												? t('settings.models.measuring')
												: t('settings.models.none')}
										</p>
									{:else}
										<div class="mt-2 space-y-2">
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
										</div>
									{/if}
								</div>
								<Separator />
								{#snippet benchControl()}
									<Tooltip.Root>
										<Tooltip.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
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
											{/snippet}
										</Tooltip.Trigger>
										{#if llmStore.status !== 'ready'}
											<Tooltip.Content side="left">
												{t('settings.models.prepareFirst')}
											</Tooltip.Content>
										{/if}
									</Tooltip.Root>
								{/snippet}
								{@render row(
									t('settings.models.benchTitle'),
									modelsStore.benchmark
										? `${t('settings.models.tps', { tps: modelsStore.benchmark.tokensPerSecond })} — ${
												modelsStore.benchmark.recommendPrivate
													? t('settings.models.comfortable')
													: t('settings.models.slow')
											}`
										: t('settings.models.benchDesc'),
									benchControl
								)}
								<div class="pt-4 pb-1">
									{@render kicker(t('settings.myai.title'))}
								</div>
								{#snippet urlControl()}
									<Input
										id="settings-myai-url"
										bind:value={urlDraft}
										placeholder="http://localhost:11434/v1"
										aria-label={t('myai.baseUrl')}
										class="w-64"
									/>
								{/snippet}
								{@render row(t('myai.baseUrl'), null, urlControl)}
								<Separator />
								{#snippet keyControl()}
									<Input
										id="settings-myai-key"
										type="password"
										bind:value={keyDraft}
										placeholder={t('myai.keyPlaceholder')}
										aria-label={t('myai.apiKey')}
										class="w-64"
									/>
								{/snippet}
								{@render row(t('myai.apiKey'), null, keyControl)}
								<Separator />
								{#snippet testControl()}
									<Tooltip.Root>
										<Tooltip.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
													variant="outline"
													size="sm"
													disabled={!urlDraft.trim() || myaiStore.testStatus === 'testing'}
													onclick={() => myaiStore.saveEndpoint(urlDraft, keyDraft)}
												>
													{myaiStore.testStatus === 'testing' ? t('myai.testing') : t('myai.test')}
												</Button>
											{/snippet}
										</Tooltip.Trigger>
										{#if !urlDraft.trim()}
											<Tooltip.Content side="left">{t('disabled.needUrl')}</Tooltip.Content>
										{/if}
									</Tooltip.Root>
								{/snippet}
								{@render row(t('settings.myai.connection'), t('myai.direct'), testControl)}
								{#if myaiStore.testStatus === 'error' && myaiStore.testError}
									<p class="text-destructive -mt-1.5 pb-2 text-xs">{myaiStore.testError}</p>
								{/if}
								{#if myaiStore.models.length}
									<Separator />
									{#snippet modelControl()}
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
									{/snippet}
									{@render row(t('settings.myai.model'), null, modelControl)}
								{/if}
								<Separator />
								{#snippet quotaControl()}{/snippet}
								{@render row(
									'Assisted',
									settingsStore.quota
										? t('settings.workspace.quota', {
												used: settingsStore.quota.used,
												limit: settingsStore.quota.limit
											})
										: t('settings.workspace.quotaSignIn'),
									quotaControl
								)}
							{:else if sessionStore.user}
								{#snippet signOutControl()}
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
								{/snippet}
								{@render row(t('account.signedInAs'), sessionStore.user.email, signOutControl)}
								<Separator />
								{#snippet logoutAllControl()}
									<Button variant="outline" size="sm" disabled={busy} onclick={logoutAll}>
										{t('settings.account.logoutAll')}
									</Button>
								{/snippet}
								{@render row(t('settings.account.logoutAll'), null, logoutAllControl)}
								<Separator />
								{#snippet deleteAccountControl()}
									<Button
										variant="destructive"
										size="sm"
										onclick={() => (deleteAccountOpen = true)}
									>
										{t('settings.account.deleteCta')}
									</Button>
								{/snippet}
								{@render row(
									t('settings.account.deleteTitle'),
									t('settings.account.deleteDesc'),
									deleteAccountControl
								)}
							{:else}
								{#snippet signInControl()}
									<Button
										variant="outline"
										size="sm"
										onclick={() => {
											uiStore.settingsOpen = false;
											goto(resolve('/chat/account'));
										}}
									>
										{t('menu.signIn')}
									</Button>
								{/snippet}
								{@render row(
									t('settings.tabs.account'),
									t('settings.account.guest'),
									signInControl
								)}
							{/if}
						</div>
					</ScrollArea>
				</div>
			</div>
		</Tooltip.Provider>
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

<script lang="ts">
	// Settings modal (spec 021, owner design pass): a tinted rail with iconed
	// tabs and the green accent bar (the ⌘K signature), and Claude-style rows —
	// label + description left, control right. Essentials only.
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Select from '$lib/components/ui/select';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Progress } from '$lib/components/ui/progress';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
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
	import { modeReadiness } from '$lib/state/mode-readiness.svelte';
	import { modelsStore } from '$lib/state/models.svelte';
	import { myaiStore, MYAI_PRESETS, normalizeBaseUrl } from '$lib/state/myai.svelte';
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
	// Seed on OPEN, and only on open. These calls read state of their own —
	// llmStore.init() reads status, myaiStore.init() its config — so tracking them
	// re-ran the whole block on every unrelated change: during a generation the
	// status flips repeatedly, and each flip refetched the quota and re-read
	// storage. Untracked, the dependency is the one that actually belongs here.
	$effect(() => {
		if (!uiStore.settingsOpen) return;
		untrack(() => {
			urlDraft = myaiStore.baseUrl ?? '';
			keyDraft = myaiStore.apiKey ?? '';
			settingsStore.refreshStorage();
			settingsStore.refreshQuota();
			llmStore.init();
			myaiStore.init();
			modelsStore.refresh();
		});
	});

	const presetHint = $derived(
		MYAI_PRESETS.find((p) => normalizeBaseUrl(urlDraft) === p.baseUrl)?.corsHint ?? null
	);

	// Spec 022 — deep-link: honor the requested tab, then scroll to the mode
	// card (and focus the URL field for My AI) once the dialog has rendered.
	$effect(() => {
		if (!uiStore.settingsOpen) return;
		tab = uiStore.settingsTab;
		const focus = uiStore.settingsFocus;
		if (!focus) return;
		uiStore.settingsFocus = null;
		setTimeout(() => {
			document
				.querySelector(`[data-mode-card="${focus}"]`)
				?.scrollIntoView({ block: 'start', behavior: 'instant' });
			if (focus === 'myai') document.getElementById('settings-myai-url')?.focus();
		}, 120);
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
	<!-- 880×640 capped at 85svh: the market size for a railed settings modal
	     (single-column ChatGPT is 680; railed Slack/Notion run 800–1000). -->
	<Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-[55rem]" showCloseButton={false}>
		<Dialog.Header class="sr-only">
			<Dialog.Title>{t('settings.title')}</Dialog.Title>
		</Dialog.Header>
		<!-- The dialog mounts outside Sidebar.Provider, so it brings its own
		     tooltip context. -->
		<Tooltip.Provider delayDuration={300}>
			<div class="grid h-[640px] max-h-[85svh] grid-cols-[11.5rem_1fr]">
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
								<!-- Usage only. Chrome reports quota as usage + 10 GiB whenever the
								     disk is large enough, so showing "available" invites a preflight
								     that passes with 200 MB of real free space and then fails. -->
								{@render row(
									t('settings.storage.title'),
									settingsStore.storage
										? t('settings.storage.used', { used: fmtBytes(settingsStore.storage.usage) })
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
								<!-- Spec 022 — one card per mode, the source of truth for setup. -->
								{@const privateR = modeReadiness('private')}
								{@const assistedR = modeReadiness('assisted')}
								{@const myaiR = modeReadiness('myai')}
								{#snippet stateBadge(r: ReturnType<typeof modeReadiness>)}
									<span class="flex shrink-0 items-center gap-1.5">
										<Badge variant="outline" class="font-mono text-[10px] uppercase">
											{r.state === 'ready'
												? t('settings.ai.status.ready')
												: r.state === 'setup'
													? t('settings.ai.status.setup')
													: r.state === 'progress'
														? t('settings.ai.status.progress', { pct: r.pct })
														: t('settings.ai.status.blocked')}
										</Badge>
									</span>
								{/snippet}
								{#snippet useMode(id: 'private' | 'assisted' | 'myai')}
									<div class="mt-3 flex justify-end">
										<Button
											size="sm"
											onclick={() => {
												uiStore.requestedMode = id;
												uiStore.settingsOpen = false;
											}}
										>
											{t('settings.ai.use')}
										</Button>
									</div>
								{/snippet}
								<div class="space-y-4 py-3.5">
									<section class="bg-background/40 rounded-lg border p-4" data-mode-card="private">
										<header class="flex items-center justify-between gap-3 pb-1.5">
											<p class="text-sm font-semibold">Private</p>
											{@render stateBadge(privateR)}
										</header>
										{#snippet privateModelControl()}
											{#if privateR.state === 'setup'}
												<Button size="sm" onclick={() => llmStore.prepare()}>
													{llmStore.prepared
														? t('settings.ai.load')
														: `${t('settings.ai.download')} · ${llmStore.downloadLabel}`}
												</Button>
											{:else if privateR.state === 'progress' && privateR.pct > 0}
												<div class="w-32">
													<Progress value={privateR.pct} />
												</div>
											{/if}
										{/snippet}
										{@render row(
											t('settings.ai.model.title'),
											privateR.blockedLine ??
												(privateR.state === 'ready'
													? t(
															llmStore.tier?.id === 'lite'
																? 'modes.private.readyLite'
																: 'modes.private.ready'
														)
													: privateR.state === 'progress'
														? llmStore.status === 'loading'
															? t('modes.private.loading')
															: llmStore.status === 'detecting'
																? t('modes.private.checking')
																: t('modes.private.preparing', { pct: privateR.pct })
														: t(
																llmStore.tier?.id === 'lite'
																	? 'modes.private.downloadLite'
																	: 'modes.private.download',
																{ size: llmStore.downloadLabel }
															)),
											privateModelControl
										)}
										{#if modelsStore.cached.length > 0}
											<Separator />
											<div class="space-y-2 py-3">
												{@render kicker(t('settings.models.title'))}
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
												? `${t('settings.models.tps', {
														tps: Math.round(modelsStore.benchmark.tokensPerSecond * 0.75)
													})} · ${
														modelsStore.benchmark.recommendPrivate
															? t('settings.models.comfortable')
															: t('settings.models.slow')
													}`
												: t('settings.models.benchDesc'),
											benchControl
										)}
										{#if privateR.state === 'ready'}
											{@render useMode('private')}
										{/if}
									</section>

									<section class="bg-background/40 rounded-lg border p-4" data-mode-card="assisted">
										<header class="flex items-center justify-between gap-3 pb-1.5">
											<p class="text-sm font-semibold">Assisted</p>
											{@render stateBadge(assistedR)}
										</header>
										{#snippet assistedControl()}
											{#if !sessionStore.user && !sessionStore.loading}
												<Button
													variant="outline"
													size="sm"
													onclick={() => {
														uiStore.pendingActivation = 'assisted';
														uiStore.settingsOpen = false;
														goto(resolve('/chat/account'));
													}}
												>
													{t('menu.signIn')}
												</Button>
											{/if}
										{/snippet}
										{@render row(
											t('settings.tabs.account'),
											assistedR.blockedLine ??
												(sessionStore.user
													? sessionStore.user.email
													: sessionStore.loading
														? ''
														: t('settings.ai.assisted.none')),
											assistedControl
										)}
										{#if settingsStore.quota}
											<p class="text-muted-foreground pt-2 text-xs">
												{t('settings.workspace.quota', {
													used: settingsStore.quota.used,
													limit: settingsStore.quota.limit
												})}
											</p>
										{:else if !sessionStore.user && !sessionStore.loading}
											<p class="text-muted-foreground pt-2 text-xs">
												{t('settings.workspace.quotaSignIn')}
											</p>
										{/if}
										{#if assistedR.state === 'ready'}
											{@render useMode('assisted')}
										{/if}
									</section>

									<section class="bg-background/40 rounded-lg border p-4" data-mode-card="myai">
										<header class="flex items-center justify-between gap-3 pb-1.5">
											<p class="text-sm font-semibold">My AI</p>
											{@render stateBadge(myaiR)}
										</header>
										<div class="flex gap-1 pb-2">
											{#each MYAI_PRESETS as preset (preset.id)}
												<Button
													variant={normalizeBaseUrl(urlDraft) === preset.baseUrl
														? 'secondary'
														: 'outline'}
													size="xs"
													onclick={() => (urlDraft = preset.baseUrl)}
												>
													{preset.label}
												</Button>
											{/each}
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
															onclick={async () => {
																await myaiStore.saveEndpoint(urlDraft, keyDraft);
																await myaiStore.testConnection();
															}}
														>
															{myaiStore.testStatus === 'testing'
																? t('myai.testing')
																: t('myai.test')}
														</Button>
													{/snippet}
												</Tooltip.Trigger>
												{#if !urlDraft.trim()}
													<Tooltip.Content side="left">{t('disabled.needUrl')}</Tooltip.Content>
												{/if}
											</Tooltip.Root>
										{/snippet}
										{@render row(t('settings.myai.connection'), t('myai.direct'), testControl)}
										{#if presetHint}
											<p class="text-muted-foreground -mt-1.5 pb-2 text-xs">{t(presetHint)}</p>
										{/if}
										{#if myaiStore.testStatus === 'error' && myaiStore.testError}
											<p class="text-destructive -mt-1.5 pb-2 text-xs">{myaiStore.testError}</p>
										{:else if myaiStore.testStatus === 'ok' && myaiStore.models.length === 0}
											<p class="text-muted-foreground -mt-1.5 pb-2 text-xs">{t('myai.noModels')}</p>
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
										{#if myaiR.state === 'ready'}
											{@render useMode('myai')}
										{/if}
									</section>
								</div>
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
							{:else if sessionStore.loading}
								<div class="space-y-2 py-2">
									<Skeleton class="h-4 w-40" />
									<Skeleton class="h-3 w-56" />
								</div>
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

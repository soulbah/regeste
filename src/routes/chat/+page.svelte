<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Button } from '$lib/components/ui/button';
	import Composer from '$lib/components/composer.svelte';
	import OnboardingModes from '$lib/components/onboarding-modes.svelte';
	import HomeSources from '$lib/components/home-sources.svelte';
	import { DEMO_SAMPLES } from '$lib/demo/samples';
	import { t } from '$lib/i18n/index.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { uiStore } from '$lib/state/ui.svelte';
	import { homeState } from '$lib/state/home-surface.svelte';
	import { modeReadiness } from '$lib/state/mode-readiness.svelte';
	import type { ChatMode } from '$lib/types';

	// Spec 022 — null until the user has ever chosen a mode on this device;
	// afterwards the default-mode setting seeds the selector until touched.
	let mode = $state<ChatMode | null>(null);
	let modeTouched = false;
	$effect(() => {
		if (!modeTouched) mode = settingsStore.modeChosen ? settingsStore.defaultMode : null;
	});
	let demoStarting = $state(false);

	const MODE_LINE = {
		private: 'modes.private.description',
		assisted: 'modes.assisted.description',
		myai: 'modes.myai.description'
	} as const;

	const home = $derived(homeState());
	const choosing = $derived(home.surface === 'choose-engine');
	const firstRun = $derived(home.surface === 'first-run');
	const pendingMode = $derived(home.pendingMode);
	/** Why setup is unfinished, in the words the picker already uses. */
	const setupLine = $derived.by(() => {
		if (!pendingMode) return '';
		const readiness = modeReadiness(pendingMode);
		if (home.downloadPct !== null) return t('onboard.downloading');
		return readiness.blockedLine ?? t('onboard.unfinished');
	});

	/** O1 — one click: a chat with the bundled fictional contracts. */
	async function startDemo() {
		if (demoStarting) return;
		demoStarting = true;
		try {
			const id = await chatsStore.create(mode ?? 'private');
			await chatsStore.rename(id, t('home.demoTitle'));
			await chatsStore.open(id);
			goto(resolve(`/chat/${id}`));
			for (const sample of DEMO_SAMPLES) {
				const docId = await documentsStore.ingest(
					new File([sample.content], sample.name, { type: 'text/markdown' })
				);
				await chatsStore.attach(id, docId);
			}
		} finally {
			demoStarting = false;
		}
	}

	// Lazy chat creation: the chat row is born on the first action.
	async function handleSend(text: string) {
		const id = await chatsStore.create(mode ?? 'private');
		await chatsStore.open(id);
		goto(resolve(`/chat/${id}`));
		await chatsStore.send(id, text);
	}

	async function handleUpload(files: File[]) {
		const id = await chatsStore.create(mode ?? 'private');
		await chatsStore.open(id);
		goto(resolve(`/chat/${id}`));
		// Stage all up front so they appear at once, index in the background.
		const known = new Set(documentsStore.library.map((d) => d.id));
		const ids = await documentsStore.ingestMany(files);
		for (let i = 0; i < ids.length; i++) {
			await chatsStore.attach(id, ids[i]);
			if (!known.has(ids[i])) {
				toast.success(t('toast.added', { name: files[i].name }), {
					description: t('toast.addedDesc')
				});
			}
		}
	}

	async function handleAttach(documentIds: string[]) {
		const id = await chatsStore.create(mode ?? 'private');
		await chatsStore.open(id);
		await chatsStore.attachMany(id, documentIds);
		// Do not expose the new chat until its sources are attached. A fast send
		// after navigation could otherwise create a second, source-less chat.
		await goto(resolve(`/chat/${id}`));
	}

	// Same drop affordance as the chat thread (C7): files dropped on the empty
	// home start a chat with them through the normal upload path.
	let dragging = $state(false);
	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (files.length) handleUpload(files);
	}

	// Click-to-browse from the hero drop zone: the same ingest path as a drop.
	let fileInput = $state<HTMLInputElement | null>(null);
</script>

<svelte:head><title>Regeste</title></svelte:head>

<div
	class="relative flex h-full flex-col {dragging ? 'bg-muted/50' : ''}"
	role="region"
	aria-label={t('sidebar.newChat')}
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={handleDrop}
>
	{#if dragging}
		<div
			class="border-accent-foreground/50 bg-background/85 pointer-events-none absolute inset-4 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed"
		>
			<p class="text-accent-foreground font-mono text-xs tracking-widest uppercase">
				{t('home.drop')}
			</p>
		</div>
	{/if}
	<header class="flex h-14 shrink-0 items-center gap-1 border-b px-4">
		<Sidebar.Trigger class="shrink-0 md:hidden" />
		<h1 class="font-display px-1 text-lg tracking-tight">{t('sidebar.newChat')}</h1>
	</header>

	<!-- Three surfaces, not one screen with branches. The engine gate blocks
	     everything because nothing can answer without it; the first run explains
	     and offers the sample; the launcher does neither, because someone opening
	     their fortieth chat is reaching for the question box. Setup runs alongside
	     all three: indexing uses a separate, much smaller model that is already
	     here, so a download never has to be waited out. -->
	<input
		bind:this={fileInput}
		type="file"
		multiple
		accept=".pdf,.docx,.md,.markdown,.txt"
		class="hidden"
		onchange={(e) => {
			const files = Array.from(e.currentTarget.files ?? []);
			e.currentTarget.value = '';
			if (files.length) handleUpload(files);
		}}
	/>
	<!-- The launcher is not centred on the viewport: it sits just above the
	     composer, because a returning user is reaching for the question box, not
	     reading a hero. The two guided surfaces do centre, since there the screen
	     itself is the instruction. -->
	<div
		class="flex flex-1 flex-col px-6 {choosing || firstRun
			? 'items-center justify-center'
			: 'items-center justify-end pb-4'}"
	>
		<!-- Every surface shares the composer's max-w-3xl so the drop zone, the
		     source list and the question box line up on one column instead of
		     three different widths stacked. The engine cards get more room again:
		     three of them at max-w-3xl would be cramped. -->
		<div
			class="w-full space-y-8 {choosing ? 'max-w-4xl' : 'max-w-3xl'} {choosing || firstRun
				? 'text-center'
				: ''}"
		>
			{#if choosing || firstRun}
				<div class="space-y-2.5 text-center">
					<h2 class="font-display text-4xl tracking-tight text-balance">
						{choosing ? t('onboard.headline') : t('home.headline')}
					</h2>
					<!-- What the chosen mode actually does. A flat "everything runs on
					     your device" used to print before the mode was picked, promising
					     something My AI and Assisted do not keep. The picker's own
					     descriptions are the single source for that claim. -->
					<p class="text-muted-foreground text-sm">
						{choosing ? t('onboard.headlineSub') : t(MODE_LINE[mode ?? 'private'])}
					</p>
				</div>
			{/if}

			{#if choosing}
				<OnboardingModes onchosen={(m) => ((modeTouched = true), (mode = m))} />
			{:else}
				<HomeSources onattach={handleAttach} onbrowse={() => fileInput?.click()} />

				<!-- The sample is for someone with nothing of their own. Offering a
				     fictional contract above someone's real documents is noise. -->
				{#if firstRun}
					<p class="text-muted-foreground text-sm">
						{t('home.sampleLead')}
						<button
							type="button"
							class="text-foreground decoration-accent-foreground/50 hover:decoration-accent-foreground font-medium underline underline-offset-4 transition disabled:opacity-60"
							disabled={demoStarting}
							onclick={startDemo}
						>
							{demoStarting ? t('home.demoPreparing') : t('home.sampleLink')}
						</button>
					</p>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Setting up and adding a document run side by side, so the wait is spent
	     rather than watched. Quiet, persistent, never a modal. -->
	{#if pendingMode}
		<div class="px-6 pb-2">
			<div
				class="border-border bg-card/40 text-muted-foreground mx-auto flex max-w-3xl items-center gap-3 rounded-lg border px-3 py-2 text-xs"
			>
				<span class="flex-1 text-left">{setupLine}</span>
				{#if home.downloadPct !== null}
					<span class="tabular-nums">{home.downloadPct}%</span>
				{:else}
					<Button variant="ghost" size="sm" onclick={() => uiStore.openSettings('ai', pendingMode)}>
						{t('onboard.resume')}
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Hidden while choosing: with no engine and no document there is nothing to
	     send, and leaving it up put a second call to action, in the accent colour,
	     on the one step whose entire purpose is the first one. -->
	{#if !choosing}
		<div class="px-6 pb-6">
			<Composer
				{mode}
				onsend={handleSend}
				onmodeselect={(m) => {
					modeTouched = true;
					mode = m;
				}}
				onupload={handleUpload}
				onattach={handleAttach}
				libraryEmpty={documentsStore.library.length === 0}
			/>
		</div>
	{/if}
</div>

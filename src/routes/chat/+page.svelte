<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import FileUpIcon from '@lucide/svelte/icons/file-up';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Button } from '$lib/components/ui/button';
	import Composer from '$lib/components/composer.svelte';
	import OnboardingModes from '$lib/components/onboarding-modes.svelte';
	import { DEMO_SAMPLES } from '$lib/demo/samples';
	import { t } from '$lib/i18n/index.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { uiStore } from '$lib/state/ui.svelte';
	import { onboardingState } from '$lib/state/onboarding.svelte';
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

	const onboarding = $derived(onboardingState());
	const choosing = $derived(onboarding.step === 'choose-mode');
	const pendingMode = $derived(onboarding.pendingMode);
	/** Why setup is unfinished, in the words the picker already uses. */
	const setupLine = $derived.by(() => {
		if (!pendingMode) return '';
		const readiness = modeReadiness(pendingMode);
		if (onboarding.downloadPct !== null) return t('onboard.downloading');
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

	<!-- Sequenced onboarding: one action at a time, in the order the app actually
	     depends on. An engine has to exist before a document is worth adding, so
	     the drop zone only appears once one is chosen. It appears during the
	     download rather than after it: indexing runs on a separate, much smaller
	     model that is already here, so the two never wait on each other. -->
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
	<div class="flex flex-1 flex-col items-center justify-center px-6">
		<div class="w-full {choosing ? 'max-w-2xl' : 'max-w-lg'} space-y-8 text-center">
			<div class="space-y-2.5">
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

			{#if choosing}
				<OnboardingModes onchosen={(m) => ((modeTouched = true), (mode = m))} />
			{:else}
				<button
					type="button"
					onclick={() => fileInput?.click()}
					class="group border-border bg-card/40 hover:border-accent-foreground/40 hover:bg-accent/25 focus-visible:ring-ring/50 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-8 py-14 transition-colors outline-none focus-visible:ring-2"
				>
					<span
						class="bg-background group-hover:text-accent-foreground flex size-14 items-center justify-center rounded-full border shadow-sm transition-colors"
					>
						<FileUpIcon
							class="text-muted-foreground group-hover:text-accent-foreground size-6 transition-colors"
						/>
					</span>
					<span class="text-base font-medium">{t('home.dropTitle')}</span>
					<span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
						{t('docsPage.types')}
					</span>
				</button>

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
		</div>
	</div>

	<!-- Setting up and adding a document run side by side, so the wait is spent
	     rather than watched. Quiet, persistent, never a modal. -->
	{#if onboarding.step === 'finish-setup'}
		<div class="px-6 pb-2">
			<div
				class="border-border bg-card/40 text-muted-foreground mx-auto flex max-w-lg items-center gap-3 rounded-lg border px-3 py-2 text-xs"
			>
				<span class="flex-1 text-left">{setupLine}</span>
				{#if onboarding.downloadPct !== null}
					<span class="tabular-nums">{onboarding.downloadPct}%</span>
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

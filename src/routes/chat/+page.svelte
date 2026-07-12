<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import FileIcon from '@lucide/svelte/icons/file';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import { Button } from '$lib/components/ui/button';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import Composer from '$lib/components/composer.svelte';
	import { DEMO_SAMPLES } from '$lib/demo/samples';
	import { t } from '$lib/i18n/index.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import type { ChatMode } from '$lib/types';

	// Spec 022 — null until the user has ever chosen a mode on this device;
	// afterwards the default-mode setting seeds the selector until touched.
	let mode = $state<ChatMode | null>(null);
	let modeTouched = false;
	$effect(() => {
		if (!modeTouched) mode = settingsStore.modeChosen ? settingsStore.defaultMode : null;
	});
	let demoStarting = $state(false);

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
		goto(resolve(`/chat/${id}`));
		await chatsStore.attachMany(id, documentIds);
	}
</script>

<svelte:head><title>Folio</title></svelte:head>

<div class="flex h-full flex-col">
	<header class="flex h-14 shrink-0 items-center gap-1 border-b px-4">
		<Sidebar.Trigger class="shrink-0 md:hidden" />
		<h1 class="font-display px-1 text-lg tracking-tight">{t('sidebar.newChat')}</h1>
	</header>

	<!-- One trust line, said once (copy rule); the demo CTA carries the proof. -->
	<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6">
		<FileIcon class="text-muted-foreground size-10" />
		<h2 class="font-display max-w-md text-center text-3xl tracking-tight">
			{t('home.headline')}
		</h2>
		<p class="text-muted-foreground max-w-sm text-center text-sm">
			{t('home.sub')}
		</p>
		<Button variant="outline" class="gap-2" disabled={demoStarting} onclick={startDemo}>
			<ScrollTextIcon class="text-muted-foreground" />
			{demoStarting ? t('home.demoPreparing') : t('home.demoCta')}
		</Button>
	</div>

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
</div>

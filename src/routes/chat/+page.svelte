<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import FileIcon from '@lucide/svelte/icons/file';
	import { Button } from '$lib/components/ui/button';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import Composer from '$lib/components/composer.svelte';
	import { DEMO_SAMPLES } from '$lib/demo/samples';
	import { t } from '$lib/i18n/index.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import type { ChatMode } from '$lib/types';

	let mode = $state<ChatMode>('private');
	let modeTouched = false;
	// Spec 021 — the default-mode setting seeds the selector until touched.
	$effect(() => {
		if (!modeTouched) mode = settingsStore.defaultMode;
	});
	let demoStarting = $state(false);

	/** O1 — one click: a chat with the bundled fictional contracts. */
	async function startDemo() {
		if (demoStarting) return;
		demoStarting = true;
		try {
			const id = await chatsStore.create(mode);
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
		const id = await chatsStore.create(mode);
		await chatsStore.open(id);
		goto(resolve(`/chat/${id}`));
		await chatsStore.send(id, text);
	}

	async function handleUpload(files: File[]) {
		const id = await chatsStore.create(mode);
		await chatsStore.open(id);
		goto(resolve(`/chat/${id}`));
		for (const file of files) {
			const known = new Set(documentsStore.library.map((d) => d.id));
			const docId = await documentsStore.ingest(file);
			await chatsStore.attach(id, docId);
			if (!known.has(docId)) {
				toast.success(t('toast.added', { name: file.name }), {
					description: t('toast.addedDesc')
				});
			}
		}
	}

	async function handleAttach(documentId: string) {
		const id = await chatsStore.create(mode);
		await chatsStore.open(id);
		goto(resolve(`/chat/${id}`));
		await chatsStore.attach(id, documentId);
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

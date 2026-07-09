<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import FileIcon from '@lucide/svelte/icons/file';
	import Composer from '$lib/components/composer.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import type { ChatMode } from '$lib/types';

	let mode = $state<ChatMode>('private');

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
				toast.success(`${file.name} added to My documents`, {
					description: 'Available to every chat, stored on this device.'
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

<div class="flex h-svh flex-col">
	<header class="flex items-center justify-between border-b px-6 py-3">
		<div>
			<h1 class="font-display text-lg tracking-tight">New chat</h1>
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				No documents yet
			</p>
		</div>
		<span
			class="text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-widest uppercase"
		>
			<span class="bg-mode-private size-1.5 rounded-full"></span> Stored locally
		</span>
	</header>

	<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6">
		<FileIcon class="text-muted-foreground size-10" />
		<h2 class="font-display max-w-md text-center text-3xl tracking-tight">
			Chat with your private documents.
		</h2>
		<p class="text-muted-foreground max-w-sm text-center text-sm">
			Add documents, ask questions, and see exactly what the AI can access.
		</p>
		<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
			Your files stay on this device · PDF and Word documents
		</p>
	</div>

	<div class="px-6 pb-6">
		<Composer
			{mode}
			onsend={handleSend}
			onmodeselect={(m) => (mode = m)}
			onupload={handleUpload}
			onattach={handleAttach}
			libraryEmpty={documentsStore.library.length === 0}
		/>
	</div>
</div>

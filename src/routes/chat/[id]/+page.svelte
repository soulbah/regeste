<script lang="ts">
	import { page } from '$app/state';
	import * as Resizable from '$lib/components/ui/resizable';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import SquareIcon from '@lucide/svelte/icons/square';
	import Composer from '$lib/components/composer.svelte';
	import RetrievalTurn from '$lib/components/retrieval-turn.svelte';
	import PrivateTurn from '$lib/components/private-turn.svelte';
	import DocumentsPanel from '$lib/components/documents-panel.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';

	const chatId = $derived(page.params.id!);

	$effect(() => {
		chatsStore.open(chatId);
	});

	async function handleUpload(files: FileList) {
		for (const file of Array.from(files)) {
			const docId = await documentsStore.ingest(file);
			await chatsStore.attach(chatId, docId);
		}
	}

	let thread = $state<HTMLElement | null>(null);
	$effect(() => {
		void chatsStore.messages.length;
		thread?.scrollTo({ top: thread.scrollHeight });
	});
</script>

<svelte:head><title>{chatsStore.activeChat?.title ?? 'Chat'} · Folio</title></svelte:head>

<Resizable.PaneGroup direction="horizontal" class="h-svh">
	<Resizable.Pane defaultSize={72} minSize={40}>
		<div class="flex h-svh flex-col">
			<header class="flex items-center justify-between border-b px-6 py-3">
				<div>
					<h1 class="font-display text-lg tracking-tight">
						{chatsStore.activeChat?.title ?? 'Chat'}
					</h1>
					<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
						{chatsStore.chatDocuments.length} document{chatsStore.chatDocuments.length === 1
							? ''
							: 's'}
					</p>
				</div>
				<span
					class="text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-widest uppercase"
				>
					<span class="bg-mode-private size-1.5 rounded-full"></span> Stored locally
				</span>
			</header>

			<div bind:this={thread} class="flex-1 overflow-y-auto">
				<div class="mx-auto max-w-2xl space-y-6 px-6 py-8">
					{#each chatsStore.messages as message (message.id)}
						{#if message.role === 'user'}
							<div class="flex justify-end">
								<div class="bg-accent max-w-[85%] rounded-xl px-4 py-2.5 text-sm">
									{message.content}
								</div>
							</div>
						{:else if message.mode === 'retrieval'}
							<RetrievalTurn content={message.content} />
						{:else if message.mode === 'private'}
							<PrivateTurn
								content={message.content}
								citations={chatsStore.citations[message.id] ?? []}
							/>
						{:else}
							<div class="text-sm">{message.content}</div>
						{/if}
					{/each}
					{#if chatsStore.streamingText !== null}
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								<span class="bg-mode-private size-1.5 animate-pulse rounded-full"></span>
								<span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
									{chatsStore.streamingText ? 'Writing…' : 'Reading your documents…'}
								</span>
								{#if llmStore.status === 'generating'}
									<Button
										variant="ghost"
										size="sm"
										class="h-6 gap-1 px-2 font-mono text-[10px] uppercase"
										onclick={() => chatsStore.stopGeneration()}
									>
										<SquareIcon class="size-2.5" /> Stop
									</Button>
								{/if}
							</div>
							{#if chatsStore.streamingText}
								<p class="text-sm leading-relaxed whitespace-pre-wrap">
									{chatsStore.streamingText}
								</p>
							{:else}
								<Skeleton class="h-4 w-2/3" />
							{/if}
						</div>
					{:else if chatsStore.sending}
						<div class="space-y-2">
							<Skeleton class="h-4 w-2/3" />
							<Skeleton class="h-4 w-1/2" />
						</div>
					{/if}
				</div>
			</div>

			<div class="px-6 pb-6">
				<Composer
					mode={chatsStore.activeChat?.mode ?? 'private'}
					disabled={chatsStore.sending}
					onsend={(text) => chatsStore.send(chatId, text)}
					onmodeselect={(m) => chatsStore.setMode(chatId, m)}
					onupload={handleUpload}
					onattach={(docId) => chatsStore.attach(chatId, docId)}
					libraryEmpty={documentsStore.library.length === 0}
				/>
			</div>
		</div>
	</Resizable.Pane>
	<Resizable.Handle />
	<Resizable.Pane defaultSize={28} minSize={18} class="hidden md:block">
		<DocumentsPanel {chatId} />
	</Resizable.Pane>
</Resizable.PaneGroup>

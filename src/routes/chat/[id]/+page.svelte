<script lang="ts">
	import { page } from '$app/state';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Resizable from '$lib/components/ui/resizable';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import SquareIcon from '@lucide/svelte/icons/square';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Composer from '$lib/components/composer.svelte';
	import RetrievalTurn from '$lib/components/retrieval-turn.svelte';
	import PrivateTurn from '$lib/components/private-turn.svelte';
	import PresendPanel from '$lib/components/presend-panel.svelte';
	import DocumentsPanel from '$lib/components/documents-panel.svelte';
	import ViewerPanel from '$lib/components/viewer-panel.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import { myaiStore } from '$lib/state/myai.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { getLocalDb } from '$lib/local-db/client';
	import { suggestionsFromHeadings } from '$lib/suggestions';

	async function handleSend(text: string) {
		if (chatsStore.activeChat?.mode === 'assisted') {
			// Staging swaps the right panel into review mode (FEATURES 5ter).
			const result = await chatsStore.stageAssisted(chatId, text);
			if (result === 'no-excerpts') {
				await chatsStore.sendAssisted(chatId, text, []);
			}
			return;
		}
		await chatsStore.send(chatId, text);
	}

	const chatId = $derived(page.params.id!);
	const reviewing = $derived(chatsStore.pendingAssisted?.chatId === chatId);

	$effect(() => {
		chatsStore.open(chatId);
		viewerStore.close();
	});

	async function handleUpload(files: File[]) {
		for (const file of files) {
			const docId = await documentsStore.ingest(file);
			await chatsStore.attach(chatId, docId);
		}
	}

	let thread = $state<HTMLElement | null>(null);
	$effect(() => {
		void chatsStore.messages.length;
		thread?.scrollTo({ top: thread.scrollHeight });
	});

	// C2 — edit the last question.
	let editOpen = $state(false);
	let editText = $state('');
	const lastUserId = $derived(
		[...chatsStore.messages].reverse().find((m) => m.role === 'user')?.id
	);
	const lastMessage = $derived(chatsStore.messages[chatsStore.messages.length - 1]);
	function openEdit() {
		editText = [...chatsStore.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
		editOpen = true;
	}
	async function confirmEdit() {
		editOpen = false;
		await chatsStore.editLast(chatId, editText);
	}

	// C7 — drop files anywhere on the thread.
	let dragging = $state(false);
	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (files.length) handleUpload(files);
	}

	// C8/C9 — heading-derived question suggestions (zero LLM).
	let headings = $state<string[]>([]);
	$effect(() => {
		const ready = chatsStore.chatDocuments.filter((d) => d.enabled && d.status === 'ready');
		if (!ready.length) {
			headings = [];
			return;
		}
		(async () => {
			const { db } = await getLocalDb();
			headings = await db.documentHeadings(ready.map((d) => d.id));
		})();
	});
	const citedSections = $derived(
		Object.values(chatsStore.citations)
			.flat()
			.map((c) => (c.locator ?? '').split(' > ').pop() ?? '')
			.filter(Boolean)
	);
	const emptySuggestions = $derived(
		chatsStore.messages.length === 0 ? suggestionsFromHeadings(headings) : []
	);
	const relatedSuggestions = $derived(
		chatsStore.messages.length > 0 && lastMessage?.role === 'assistant' && !chatsStore.sending
			? suggestionsFromHeadings(headings, citedSections)
			: []
	);
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
				{#if chatsStore.chatEgress && chatsStore.chatEgress.cloudRequests > 0}
					<span
						class="text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-widest uppercase"
					>
						<span class="bg-mode-assisted size-1.5 rounded-full"></span>
						{chatsStore.chatEgress.cloudRequests} cloud request{chatsStore.chatEgress
							.cloudRequests === 1
							? ''
							: 's'} · {(chatsStore.chatEgress.bytes / 1024).toFixed(1)} KB
					</span>
				{:else}
					<span
						class="text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-widest uppercase"
					>
						<span class="bg-mode-private size-1.5 rounded-full"></span> 0 bytes sent
					</span>
				{/if}
			</header>

			<div
				bind:this={thread}
				class="relative flex-1 overflow-y-auto {dragging ? 'bg-accent/30' : ''}"
				role="region"
				aria-label="Chat thread"
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={handleDrop}
			>
				{#if dragging}
					<div
						class="border-primary/40 bg-background/80 pointer-events-none absolute inset-4 z-10 flex items-center justify-center rounded-xl border-2 border-dashed"
					>
						<p class="text-muted-foreground font-mono text-xs tracking-widest uppercase">
							Drop to add to this chat
						</p>
					</div>
				{/if}
				<div class="mx-auto max-w-2xl space-y-6 px-6 py-8">
					{#if chatsStore.messages.length === 0 && emptySuggestions.length}
						<div class="space-y-2">
							<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								From your document's sections
							</p>
							<div class="flex flex-wrap gap-2">
								{#each emptySuggestions as suggestion (suggestion)}
									<Button
										variant="outline"
										size="sm"
										class="h-auto rounded-full px-3 py-1.5 text-xs font-normal"
										onclick={() => handleSend(suggestion)}
									>
										{suggestion}
									</Button>
								{/each}
							</div>
						</div>
					{/if}
					{#each chatsStore.messages as message (message.id)}
						{#if message.role === 'user'}
							<div class="group flex items-center justify-end gap-1">
								{#if message.id === lastUserId && !chatsStore.sending}
									<Button
										variant="ghost"
										size="icon"
										class="size-6 opacity-0 group-hover:opacity-100"
										aria-label="Edit this question"
										onclick={openEdit}
									>
										<PencilIcon class="size-3" />
									</Button>
								{/if}
								<div class="bg-accent max-w-[85%] rounded-xl px-4 py-2.5 text-sm">
									{message.content}
								</div>
							</div>
						{:else if message.mode === 'retrieval'}
							<RetrievalTurn content={message.content} />
						{:else if message.mode === 'private' || message.mode === 'assisted' || message.mode === 'myai'}
							{@const ev = chatsStore.privacyByMessage[message.id]}
							<PrivateTurn
								content={message.content}
								citations={chatsStore.citations[message.id] ?? []}
								mode={message.mode}
								meta={ev && message.mode !== 'private'
									? `${ev.excerptCount} excerpt${ev.excerptCount === 1 ? '' : 's'} · ${(ev.bytesSent / 1024).toFixed(1)} KB · ${message.mode === 'assisted' ? 'Cloud AI' : ev.destination}`
									: null}
								onregenerate={message.id === lastMessage?.id &&
								message.mode !== 'assisted' &&
								!chatsStore.sending
									? () => chatsStore.regenerate(chatId)
									: null}
							/>
						{:else}
							<div class="text-sm">{message.content}</div>
						{/if}
					{/each}
					{#if relatedSuggestions.length && chatsStore.streamingText === null}
						<div class="flex flex-wrap gap-2">
							{#each relatedSuggestions as suggestion (suggestion)}
								<Button
									variant="outline"
									size="sm"
									class="text-muted-foreground h-auto rounded-full px-3 py-1.5 text-xs font-normal"
									onclick={() => handleSend(suggestion)}
								>
									{suggestion}
								</Button>
							{/each}
						</div>
					{/if}
					{#if reviewing}
						<div class="flex items-center gap-2">
							<span class="bg-mode-assisted size-1.5 animate-pulse rounded-full"></span>
							<span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								Waiting for your review — check the panel on the right
							</span>
						</div>
					{/if}
					{#if chatsStore.streamingText !== null}
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								<span
									class="{chatsStore.activeChat?.mode === 'myai'
										? 'bg-mode-myai'
										: 'bg-mode-private'} size-1.5 animate-pulse rounded-full"
								></span>
								<span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
									{chatsStore.streamingText ? 'Writing…' : 'Reading your documents…'}
								</span>
								{#if llmStore.status === 'generating' || myaiStore.generating}
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
					onsend={handleSend}
					onmodeselect={(m) => chatsStore.setMode(chatId, m)}
					onupload={handleUpload}
					onattach={(docId) => chatsStore.attach(chatId, docId)}
					libraryEmpty={documentsStore.library.length === 0}
					myaiModel={chatsStore.activeChat?.myaiModel ?? null}
					onmyaimodel={(m) => chatsStore.setMyaiModel(chatId, m)}
					privateOnly={chatsStore.activeChat?.privateOnly ?? false}
				/>
			</div>
		</div>
	</Resizable.Pane>
	<Resizable.Handle />
	<Resizable.Pane defaultSize={28} minSize={18} class="hidden md:block">
		{#if reviewing}
			<PresendPanel />
		{:else if viewerStore.isOpen}
			<ViewerPanel />
		{:else}
			<DocumentsPanel {chatId} />
		{/if}
	</Resizable.Pane>
</Resizable.PaneGroup>

<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Edit your question</Dialog.Title>
			<Dialog.Description>The previous answer will be replaced.</Dialog.Description>
		</Dialog.Header>
		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				confirmEdit();
			}}
		>
			<Textarea bind:value={editText} class="min-h-24" aria-label="Edited question" />
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (editOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={!editText.trim()}>Resend</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

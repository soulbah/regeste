<script lang="ts">
	import { page } from '$app/state';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Resizable from '$lib/components/ui/resizable';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import SquareIcon from '@lucide/svelte/icons/square';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Composer from '$lib/components/composer.svelte';
	import RetrievalTurn from '$lib/components/retrieval-turn.svelte';
	import PrivateTurn from '$lib/components/private-turn.svelte';
	import PresendPanel from '$lib/components/presend-panel.svelte';
	import DocumentsPanel from '$lib/components/documents-panel.svelte';
	import ViewerPanel from '$lib/components/viewer-panel.svelte';
	import WhatAiSawPanel from '$lib/components/what-ai-saw-panel.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import { myaiStore } from '$lib/state/myai.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { toast } from 'svelte-sonner';

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
		chatsStore.closeWhatAiSaw();
	});

	async function handleUpload(files: File[]) {
		for (const file of files) {
			const known = new Set(documentsStore.library.map((d) => d.id));
			const docId = await documentsStore.ingest(file);
			await chatsStore.attach(chatId, docId);
			// FEATURES: chat uploads land in the global library too — say it once.
			if (!known.has(docId)) {
				toast.success(t('toast.added', { name: file.name }), {
					description: t('toast.addedDesc')
				});
			}
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
</script>

<svelte:head
	><title>{chatsStore.activeChat?.title ?? t('chat.fallback')} · Folio</title></svelte:head
>

<Resizable.PaneGroup direction="horizontal" class="h-svh">
	<Resizable.Pane defaultSize={72} minSize={40}>
		<div class="flex h-svh flex-col">
			<header class="flex items-center justify-between border-b px-6 py-3">
				<div>
					<h1 class="font-display text-lg tracking-tight">
						{chatsStore.activeChat?.title ?? t('chat.fallback')}
					</h1>
					<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
						{t('chat.docCount', {
							count: chatsStore.chatDocuments.length,
							s: chatsStore.chatDocuments.length === 1 ? '' : 's'
						})}
					</p>
				</div>
				{#if chatsStore.chatEgress && chatsStore.chatEgress.cloudRequests > 0}
					<span
						class="text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-widest uppercase"
					>
						<span class="bg-mode-assisted size-1.5 rounded-full"></span>
						{t('chat.cloudRequests', {
							count: chatsStore.chatEgress.cloudRequests,
							s: chatsStore.chatEgress.cloudRequests === 1 ? '' : 's',
							kb: (chatsStore.chatEgress.bytes / 1024).toFixed(1)
						})}
					</span>
				{:else}
					<span
						class="text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-widest uppercase"
					>
						<span class="bg-mode-private size-1.5 rounded-full"></span>
						{t('chat.zeroBytes')}
					</span>
				{/if}
			</header>

			<div
				bind:this={thread}
				class="relative flex-1 overflow-y-auto {dragging ? 'bg-accent/30' : ''}"
				role="region"
				aria-label={t('chat.threadAria')}
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
							{t('chat.drop')}
						</p>
					</div>
				{/if}
				<div class="mx-auto max-w-2xl space-y-6 px-6 py-8">
					{#each chatsStore.messages as message (message.id)}
						{#if message.role === 'user'}
							<div class="group flex items-center justify-end gap-1">
								{#if message.id === lastUserId && !chatsStore.sending}
									<Button
										variant="ghost"
										size="icon"
										class="size-6 opacity-0 group-hover:opacity-100"
										aria-label={t('chat.editAria')}
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
						{:else if message.mode === 'notice'}
							<!-- System notice, visually distinct from real answers. -->
							<div class="border-muted-foreground/30 flex items-start gap-2 border-l-2 py-1 pl-3">
								<InfoIcon class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
								<div>
									<p class="text-muted-foreground text-sm">{message.content}</p>
									{#if message.id === lastMessage?.id && !chatsStore.sending}
										<Button
											variant="ghost"
											size="sm"
											class="text-muted-foreground -ml-2 h-6 px-2 font-mono text-[10px] uppercase"
											onclick={() => chatsStore.regenerate(chatId)}
										>
											{t('notice.retry')}
										</Button>
									{/if}
								</div>
							</div>
						{:else if message.mode === 'private' || message.mode === 'assisted' || message.mode === 'myai'}
							{@const ev = chatsStore.privacyByMessage[message.id]}
							<PrivateTurn
								content={message.content}
								citations={chatsStore.citations[message.id] ?? []}
								mode={message.mode}
								meta={ev && message.mode !== 'private'
									? t('chat.meta', {
											count: ev.excerptCount,
											s: ev.excerptCount === 1 ? '' : 's',
											kb: (ev.bytesSent / 1024).toFixed(1),
											dest: message.mode === 'assisted' ? t('common.cloudAi') : ev.destination
										})
									: null}
								onregenerate={message.id === lastMessage?.id &&
								message.mode !== 'assisted' &&
								!chatsStore.sending
									? () => chatsStore.regenerate(chatId)
									: null}
								messageId={message.id}
								excerpts={chatsStore.excerptsByMessage[message.id] ?? []}
							/>
						{:else}
							<div class="text-sm">{message.content}</div>
						{/if}
					{/each}
					{#if reviewing}
						<div class="flex items-center gap-2">
							<span class="bg-mode-assisted size-1.5 animate-pulse rounded-full"></span>
							<span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
								{t('chat.reviewing')}
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
									{chatsStore.streamingText ? t('chat.writing') : t('chat.reading')}
								</span>
								{#if llmStore.status === 'generating' || myaiStore.generating}
									<Button
										variant="ghost"
										size="sm"
										class="h-6 gap-1 px-2 font-mono text-[10px] uppercase"
										onclick={() => chatsStore.stopGeneration()}
									>
										<SquareIcon class="size-2.5" />
										{t('chat.stop')}
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
		{:else if chatsStore.waisMessageId}
			<WhatAiSawPanel />
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
			<Dialog.Title>{t('chat.editTitle')}</Dialog.Title>
			<Dialog.Description>{t('chat.editDescription')}</Dialog.Description>
		</Dialog.Header>
		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				confirmEdit();
			}}
		>
			<Textarea bind:value={editText} class="min-h-24" aria-label={t('chat.editedAria')} />
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (editOpen = false)}>
					{t('common.cancel')}
				</Button>
				<Button type="submit" disabled={!editText.trim()}>{t('chat.resend')}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

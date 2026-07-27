<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import PanelShell from '$lib/components/panel-shell.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import InfoIcon from '@lucide/svelte/icons/info';
	import VersionNav from '$lib/components/version-nav.svelte';
	import PanelRightIcon from '@lucide/svelte/icons/panel-right';
	import MessageSquareQuoteIcon from '@lucide/svelte/icons/message-square-quote';
	import Composer from '$lib/components/composer.svelte';
	import RetrievalTurn from '$lib/components/retrieval-turn.svelte';
	import PrivateTurn from '$lib/components/private-turn.svelte';
	import WorkLedger from '$lib/components/work-ledger.svelte';
	import Markdown from '$lib/components/markdown/markdown.svelte';
	import PresendPanel from '$lib/components/presend-panel.svelte';
	import DocumentsPanel from '$lib/components/documents-panel.svelte';
	import ViewerPanel from '$lib/components/viewer-panel.svelte';
	import WhatAiSawPanel from '$lib/components/what-ai-saw-panel.svelte';
	import DocumentPicker from '$lib/components/document-picker.svelte';
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
		// Stage the whole selection first (all rows appear at once, indexing in the
		// background), then attach each to the chat without waiting for indexing.
		const known = new Set(documentsStore.library.map((d) => d.id));
		const ids = await documentsStore.ingestMany(files);
		for (let i = 0; i < ids.length; i++) {
			await chatsStore.attach(chatId, ids[i]);
			// FEATURES: chat uploads land in the global library too — say it once.
			if (!known.has(ids[i])) {
				toast.success(t('toast.added', { name: files[i].name }), {
					description: t('toast.addedDesc')
				});
			}
		}
	}

	// Empty-chat "Add a document" button opens the file picker (same ingest path).
	let addInput = $state<HTMLInputElement | null>(null);
	/** Library picker opened from the no-documents empty state. */
	let emptyPickerOpen = $state(false);

	let thread = $state<HTMLElement | null>(null);
	// Stick to the bottom while the turn unfolds (ledger, draft notes, streamed
	// answer, related questions), but let go the moment the user scrolls UP to
	// read; re-stick when they come back near the bottom. Only an upward move
	// unsticks: our own scrollTo fires scroll events too, and content growing
	// under it must not be mistaken for the user leaving the bottom.
	let stickToBottom = $state(true);
	let lastScrollTop = 0;
	function handleThreadScroll() {
		if (!thread) return;
		const goingUp = thread.scrollTop < lastScrollTop - 1;
		lastScrollTop = thread.scrollTop;
		const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
		if (nearBottom) stickToBottom = true;
		else if (goingUp) stickToBottom = false;
	}
	$effect(() => {
		void chatsStore.messages;
		void chatsStore.workSteps;
		void chatsStore.streamingText;
		void chatsStore.streamingThinking;
		void chatsStore.related;
		if (stickToBottom) thread?.scrollTo({ top: thread.scrollHeight });
	});

	// C2 — edit the last question, in place in the bubble (spec 019, no dialog).
	let editingId = $state<string | null>(null);
	let editText = $state('');
	const lastUserId = $derived(
		[...chatsStore.messages].reverse().find((m) => m.role === 'user')?.id
	);
	const lastMessage = $derived(chatsStore.messages[chatsStore.messages.length - 1]);
	function startEdit(messageId: string) {
		editText = chatsStore.messages.find((m) => m.id === messageId)?.content ?? '';
		editingId = messageId;
	}
	async function confirmEdit() {
		if (!editText.trim()) return;
		editingId = null;
		await chatsStore.editLast(chatId, editText);
	}

	// Right contextual panel (PanelShell owns the mechanics; here we only say when
	// it's open and clear whatever summoned it on close). Open by default.
	let panelOpen = $state(true);

	// Closing the panel clears whatever summoned it — otherwise panelWanted stays
	// true and the effect below re-opens it (the bug where ✕ did nothing on the
	// document viewer).
	function clearPanelState() {
		viewerStore.close();
		chatsStore.closeWhatAiSaw();
		if (reviewing) chatsStore.cancelAssisted();
	}

	function hidePanel() {
		clearPanelState();
		panelOpen = false;
	}

	const panelWanted = $derived(
		reviewing || chatsStore.waisMessageId !== null || viewerStore.isOpen
	);
	$effect(() => {
		if (panelWanted) panelOpen = true;
	});

	// Spec 020 — quote-reply: select answer text → floating button → composer.
	let quoteButton = $state<{ x: number; y: number; text: string } | null>(null);
	let pendingQuote = $state<string | null>(null);

	function handleSelection() {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || !thread) {
			quoteButton = null;
			return;
		}
		const text = sel.toString().trim();
		const anchor =
			sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
		if (!text || text.length < 3 || !anchor?.closest('[data-answer]')) {
			quoteButton = null;
			return;
		}
		const rect = sel.getRangeAt(0).getBoundingClientRect();
		const host = thread.getBoundingClientRect();
		quoteButton = {
			x: Math.max(8, rect.left - host.left + rect.width / 2 - 36),
			y: rect.bottom - host.top + thread.scrollTop + 6,
			text
		};
	}

	function applyQuote() {
		if (!quoteButton) return;
		pendingQuote = quoteButton.text;
		quoteButton = null;
		window.getSelection()?.removeAllRanges();
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
	><title>{chatsStore.activeChat?.title ?? t('chat.fallback')} · Regeste</title></svelte:head
>

<svelte:document onselectionchange={handleSelection} />

<svelte:window
	onkeydown={(e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === '.') {
			e.preventDefault();
			panelOpen = !panelOpen;
			return;
		}
		// Esc stops generation (spec 019 UX checklist), partial output kept.
		if (e.key === 'Escape' && (llmStore.status === 'generating' || myaiStore.generating)) {
			chatsStore.stopGeneration();
		}
	}}
/>

<PanelShell bind:open={panelOpen} onOpenChange={(o) => !o && clearPanelState()}>
	{#snippet main()}
		<div class="flex h-full flex-col">
			<header class="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
				<div class="flex min-w-0 items-center gap-1">
					<Sidebar.Trigger class="shrink-0 md:hidden" />
					<div class="min-w-0 px-1">
						<h1 class="font-display truncate text-base leading-tight tracking-tight">
							{chatsStore.activeChat?.title ?? t('chat.fallback')}
						</h1>
						<p class="text-muted-foreground truncate text-[11px] leading-tight">
							{t('chat.docCount', {
								count: chatsStore.chatDocuments.length,
								s: chatsStore.chatDocuments.length === 1 ? '' : 's'
							})}
						</p>
					</div>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<a
						href={resolve('/chat/privacy')}
						class="focus-visible:ring-ring rounded-full focus-visible:ring-2"
					>
						{#if chatsStore.chatEgress && chatsStore.chatEgress.cloudRequests > 0}
							<span
								class="bg-mode-assisted/15 text-mode-assisted flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px]"
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
								class="text-muted-foreground bg-muted flex items-center rounded-full px-2.5 py-1 font-mono text-[11px]"
							>
								{t('chat.zeroBytes')}
							</span>
						{/if}
					</a>
					<!-- Opens only: once the panel shows, its own ✕ is the sole close control
					     (standard pattern), so the opener disappears instead of flipping icon. -->
					{#if !panelOpen}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="ghost"
										size="icon-sm"
										aria-label={t('chat.panelToggleAria')}
										onclick={() => (panelOpen = !panelOpen)}
									>
										<PanelRightIcon />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="bottom">{t('chat.panelTip.show')}</Tooltip.Content>
						</Tooltip.Root>
					{/if}
				</div>
			</header>

			<div
				bind:this={thread}
				class="relative flex-1 overflow-y-auto {dragging ? 'bg-muted/50' : ''}"
				role="region"
				aria-label={t('chat.threadAria')}
				onscroll={handleThreadScroll}
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
				<div class="mx-auto max-w-3xl space-y-6 px-6 py-8">
					{#if chatsStore.messages.length === 0 && chatsStore.chatDocumentsLoaded && chatsStore.chatDocuments.length === 0}
						<!-- A chat answers from its own documents: without one there is
						     nothing to ask about. Say so and point at the add control.
						     Both ways in, because they do not cost the same: something
						     already in the library is indexed and attaches instantly,
						     while a new file has to be parsed and indexed first. Offering
						     only the upload asked for a file the user may already have
						     given us. -->
						<div class="flex flex-col items-center justify-center gap-3 py-20 text-center">
							<FileTextIcon class="text-muted-foreground size-7" />
							<p class="font-display text-xl tracking-tight">{t('chat.emptyTitle')}</p>
							<p class="text-muted-foreground max-w-xs text-sm text-balance">
								{t('chat.emptyBody')}
							</p>
							<div class="mt-1 flex flex-wrap items-center justify-center gap-2">
								{#if documentsStore.library.some((d) => d.status === 'ready')}
									<Button variant="outline" size="sm" onclick={() => (emptyPickerOpen = true)}>
										{t('addDocs.choose')}
									</Button>
								{/if}
								<Button
									variant="outline"
									size="sm"
									class="gap-1.5"
									onclick={() => addInput?.click()}
								>
									<PlusIcon class="size-4" />
									{t('home.addNew')}
								</Button>
							</div>
							<input
								bind:this={addInput}
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
							<DocumentPicker
								bind:open={emptyPickerOpen}
								onpick={(docIds) => chatsStore.attachMany(chatId, docIds)}
							/>
						</div>
					{/if}
					{#each chatsStore.messages as message (message.id)}
						{#if message.role === 'user'}
							{#if editingId === message.id}
								<!-- In-place edit (spec 019): the bubble becomes the editor, no dialog. -->
								<div class="ml-auto w-full max-w-[85%] space-y-2">
									<Textarea
										bind:value={editText}
										class="min-h-16"
										aria-label={t('chat.editedAria')}
										onkeydown={(e) => {
											if (e.key === 'Enter' && !e.shiftKey) {
												e.preventDefault();
												confirmEdit();
											}
											if (e.key === 'Escape') editingId = null;
										}}
									/>
									<div class="flex justify-end gap-2">
										<Button variant="ghost" size="sm" onclick={() => (editingId = null)}>
											{t('common.cancel')}
										</Button>
										<Tooltip.Root>
											<Tooltip.Trigger>
												{#snippet child({ props })}
													<Button
														{...props}
														size="sm"
														disabled={!editText.trim()}
														onclick={confirmEdit}
													>
														{t('chat.resend')}
													</Button>
												{/snippet}
											</Tooltip.Trigger>
											{#if !editText.trim()}
												<Tooltip.Content side="top">{t('disabled.emptyMessage')}</Tooltip.Content>
											{/if}
										</Tooltip.Root>
									</div>
								</div>
							{:else}
								<div class="group flex items-center justify-end gap-1">
									{#if message.id === lastUserId && !chatsStore.sending}
										<Button
											variant="ghost"
											size="icon"
											class="size-6 opacity-0 group-hover:opacity-100"
											aria-label={t('chat.editAria')}
											onclick={() => startEdit(message.id)}
										>
											<PencilIcon class="size-3" />
										</Button>
									{/if}
									<div class="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
										{message.content}
									</div>
								</div>
							{/if}
						{:else if message.mode === 'retrieval'}
							<RetrievalTurn
								content={message.content}
								mode={chatsStore.activeChat?.mode ?? null}
								privateOnly={chatsStore.activeChat?.privateOnly ?? false}
							/>
						{:else if message.mode === 'notice'}
							<!-- System notice, visually distinct from real answers. A grounded
							     refusal lands here too, and it can be one version of a turn, so
							     the version nav belongs here as well: without it, switching onto
							     a refusal stranded the user with no way back to the answers. -->
							<div class="border-muted-foreground/30 flex items-start gap-2 border-l-2 py-1 pl-3">
								<InfoIcon class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
								<div>
									<p class="text-muted-foreground text-sm">{message.content}</p>
									<div class="flex items-center gap-1">
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
										<VersionNav
											versions={message.versionGroup
												? (chatsStore.versionsByGroup[message.versionGroup] ?? null)
												: null}
											messageId={message.id}
											onswitch={message.versionGroup
												? (id) => chatsStore.switchVersion(chatId, message.versionGroup!, id)
												: null}
										/>
									</div>
								</div>
							</div>
						{:else if message.mode === 'private' || message.mode === 'assisted' || message.mode === 'myai'}
							{@const ev = chatsStore.privacyByMessage[message.id]}
							<div data-answer>
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
									versions={message.versionGroup
										? (chatsStore.versionsByGroup[message.versionGroup] ?? null)
										: null}
									onswitchversion={message.versionGroup
										? (id) => chatsStore.switchVersion(chatId, message.versionGroup!, id)
										: null}
									method={chatsStore.methodByMessage[message.id] ?? null}
								/>
							</div>
						{:else}
							<div class="text-sm">{message.content}</div>
						{/if}
					{/each}
					{#if reviewing}
						<div class="flex items-center gap-2">
							<span class="bg-mode-assisted size-1.5 animate-pulse rounded-full"></span>
							<span class="text-muted-foreground font-mono text-[10px]">
								{t('chat.reviewing')}
							</span>
						</div>
					{/if}
					{#if chatsStore.streamingText !== null}
						<div class="space-y-2">
							<!-- Live draft notes only until readable answer text streams:
							     the answer then takes over as the progress signal. -->
							<WorkLedger
								steps={chatsStore.workSteps}
								thinking={chatsStore.streamingText ? null : chatsStore.streamingThinking}
							/>
							{#if chatsStore.streamingText}
								<!-- Same renderer as the finalized turn: streaming raw then snapping
								     to formatted markdown on completion would flip every list answer.
								     No citations mid-stream, so [n] stays literal exactly as before. -->
								<div class="text-sm">
									<Markdown source={chatsStore.streamingText} variant="answer" />
								</div>
							{:else if !chatsStore.streamingThinking}
								<Skeleton class="h-4 w-2/3" />
							{/if}
						</div>
					{:else if chatsStore.sending}
						<div class="space-y-2">
							<WorkLedger steps={chatsStore.workSteps} />
						</div>
					{/if}
					<!-- Spec 020 — related questions: last answer only, max 3, silent absence. -->
					{#if !chatsStore.sending && chatsStore.related?.chatId === chatId && chatsStore.related.messageId === lastMessage?.id}
						<div class="border-t pt-2">
							<p class="text-muted-foreground pb-1 font-mono text-[10px] tracking-wide uppercase">
								{t('related.title')}
							</p>
							<div class="flex flex-col">
								{#each chatsStore.related.questions as q (q)}
									<Button
										variant="ghost"
										size="sm"
										class="text-foreground/90 h-auto w-full justify-start px-2 py-1.5 text-left text-sm font-normal whitespace-normal"
										onclick={() => handleSend(q)}
									>
										{q}
									</Button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
				<!-- Spec 020 — quote-reply: floats over the selection inside an answer. -->
				{#if quoteButton}
					<Button
						size="xs"
						variant="outline"
						class="bg-popover absolute z-20 gap-1.5 shadow-md"
						style="left: {quoteButton.x}px; top: {quoteButton.y}px"
						onmousedown={(e: MouseEvent) => e.preventDefault()}
						onclick={applyQuote}
					>
						<MessageSquareQuoteIcon class="size-3.5!" />
						{t('turn.quote')}
					</Button>
				{/if}
			</div>

			<div class="px-6 pb-6">
				<Composer
					mode={chatsStore.activeChat?.mode ?? 'private'}
					disabled={chatsStore.sending}
					followUp={chatsStore.messages.length > 0}
					generating={(llmStore.status === 'generating' || myaiStore.generating) &&
						chatsStore.streamingText !== null}
					onstop={() => chatsStore.stopGeneration()}
					quote={pendingQuote}
					onquoteused={() => (pendingQuote = null)}
					onsend={handleSend}
					onmodeselect={(m) => chatsStore.setMode(chatId, m)}
					onupload={handleUpload}
					onattach={(docIds) => chatsStore.attachMany(chatId, docIds)}
					attachedIds={chatsStore.chatDocuments.map((d) => d.id)}
					libraryEmpty={documentsStore.library.length === 0}
					myaiModel={chatsStore.activeChat?.myaiModel ?? null}
					privateOnly={chatsStore.activeChat?.privateOnly ?? false}
					hasReadyDocs={chatsStore.chatDocuments.some((d) => d.enabled && d.status === 'ready')}
				/>
			</div>
		</div>
	{/snippet}
	{#snippet panel()}
		{#if reviewing}
			<PresendPanel onhide={hidePanel} />
		{:else if chatsStore.waisMessageId}
			<WhatAiSawPanel onhide={hidePanel} />
		{:else if viewerStore.isOpen}
			<ViewerPanel onhide={hidePanel} />
		{:else}
			<DocumentsPanel {chatId} onhide={hidePanel} />
		{/if}
	{/snippet}
</PanelShell>

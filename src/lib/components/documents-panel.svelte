<script lang="ts">
	// Right-panel default (spec 019): the documents attached to this chat, each a
	// toggleable source (NotebookLM pattern). Reworked 2026-07 — one row per
	// document with a live status dot, an options menu, and an add button pinned
	// to the bottom so growing the set never means leaving the panel.
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Switch } from '$lib/components/ui/switch';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PanelHeader from '$lib/components/panel-header.svelte';
	import AddDocuments from '$lib/components/add-documents.svelte';
	import { documentStatusKey } from '$lib/document-status';
	import { t } from '$lib/i18n/index.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import type { ChatDocument } from '$lib/types';

	let { chatId, onhide = null }: { chatId: string; onhide?: (() => void) | null } = $props();

	function ext(name: string): string {
		const dot = name.lastIndexOf('.');
		return dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
	}

	async function handleUpload(files: File[]) {
		// Stage all at once (rows appear immediately), attach, index in background.
		const ids = await documentsStore.ingestMany(files);
		for (const id of ids) await chatsStore.attach(chatId, id);
	}

	const openDoc = (doc: ChatDocument) => viewerStore.openDocument(doc);
</script>

<div class="flex h-full flex-col">
	<PanelHeader title={t('sources.title')} subtitle={t('sources.subtitle')} {onhide} />

	<!-- P7: hard lock — cloud modes are unselectable while this is on. -->
	<div class="flex items-center justify-between gap-3 border-b px-4 py-2.5">
		<Label for="private-only" class="text-muted-foreground text-xs font-normal">
			{t('docs.privateOnly')}
		</Label>
		<Switch
			id="private-only"
			checked={chatsStore.activeChat?.privateOnly ?? false}
			onCheckedChange={(v) => chatsStore.setPrivateOnly(chatId, v === true)}
		/>
	</div>

	<ScrollArea class="min-h-0 flex-1">
		{#if !chatsStore.chatDocumentsLoaded}
			{#each { length: 3 }, i (i)}
				<div class="flex items-start gap-3 border-b px-4 py-3">
					<Skeleton class="mt-0.5 size-4 shrink-0 rounded" />
					<div class="min-w-0 flex-1 space-y-2">
						<Skeleton class="h-3.5 w-40" />
						<Skeleton class="h-2.5 w-16" />
					</div>
				</div>
			{/each}
		{:else}
			{#each chatsStore.chatDocuments as doc (doc.id)}
				{@const ingest = documentsStore.ingests[doc.id]}
				{@const status = ingest?.status ?? doc.status}
				{@const ready = doc.status === 'ready'}
				{@const errored = doc.status === 'error'}
				{@const dimmed = ready && !doc.enabled}
				<div class="flex items-start gap-3 border-b px-4 py-3">
					<!-- The source toggle: excluded documents are dropped from answers. -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Checkbox
									{...props}
									class="mt-0.5"
									checked={doc.enabled}
									disabled={!ready}
									onCheckedChange={(v) => chatsStore.toggleDocument(chatId, doc.id, v === true)}
									aria-label={t('docs.useAria', { name: doc.name })}
								/>
							{/snippet}
						</Tooltip.Trigger>
						{#if !ready}
							<Tooltip.Content side="right">{t('disabled.indexing')}</Tooltip.Content>
						{/if}
					</Tooltip.Root>

					<div class="min-w-0 flex-1 {dimmed ? 'opacity-55' : ''}">
						{#if ready}
							<button
								type="button"
								class="hover:text-foreground focus-visible:ring-ring block w-full truncate text-left text-sm font-medium outline-none focus-visible:ring-2"
								onclick={() => openDoc(doc)}
								aria-label={t('docs.openAria', { name: doc.name })}
							>
								{doc.name}
							</button>
						{:else}
							<p class="truncate text-sm font-medium">{doc.name}</p>
						{/if}

						<p class="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-wide uppercase">
							{ext(doc.name)}{doc.pages ? ` · ${t('common.pages', { n: doc.pages })}` : ''}
						</p>

						<!-- Named ingest phases stay visible. Scanned pages reuse the normal
					     Reading phase, so OCR remains an implementation detail. -->
						<div class="mt-1.5 flex items-center gap-1.5 text-[11px]">
							{#if errored}
								<span class="bg-destructive size-1.5 rounded-full"></span>
								<span class="text-destructive">
									{t(documentStatusKey(status, ingest?.error ?? doc.error))}
								</span>
							{:else if ready}
								<span class="bg-ring size-1.5 rounded-full"></span>
								<span class="text-muted-foreground">{t('status.ready')}</span>
							{:else}
								<span class="bg-ring size-1.5 animate-pulse rounded-full"></span>
								<span class="text-muted-foreground">
									{t(documentStatusKey(status))}{status === 'embedding' && ingest
										? ` ${Math.round(ingest.phaseProgress * 100)}%`
										: '…'}
								</span>
							{/if}
						</div>
						{#if status === 'embedding' && ingest}
							<Progress value={ingest.phaseProgress * 100} class="mt-1.5 h-1" />
						{/if}
					</div>

					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-sm"
									class="text-muted-foreground/70 hover:text-foreground -mt-0.5 shrink-0"
									aria-label={t('docs.optionsAria', { name: doc.name })}
								>
									<EllipsisIcon />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content side="bottom" align="end">
							{#if ready}
								<DropdownMenu.Item onclick={() => openDoc(doc)}>
									<EyeIcon class="text-muted-foreground" />
									{t('sheet.open')}
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Item
								variant="destructive"
								onclick={() => chatsStore.detach(chatId, doc.id)}
							>
								<Trash2Icon />
								{t('docs.remove')}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			{:else}
				<div class="flex flex-col items-center gap-2 px-6 py-16 text-center">
					<FileTextIcon class="text-muted-foreground/70 size-8" />
					<p class="text-muted-foreground text-sm">{t('docs.empty')}</p>
					<p class="text-muted-foreground/80 text-xs">{t('docs.emptyHint')}</p>
				</div>
			{/each}
		{/if}
	</ScrollArea>

	<!-- Add without leaving the panel: upload a file or pull one from the library. -->
	<div class="border-t p-3">
		<AddDocuments
			libraryEmpty={documentsStore.library.length === 0}
			onupload={handleUpload}
			onattach={(docIds) => chatsStore.attachMany(chatId, docIds)}
			attachedIds={chatsStore.chatDocuments.map((d) => d.id)}
			side="top"
		>
			{#snippet trigger({ props })}
				<Button {...props} variant="outline" class="w-full justify-center gap-2 border-dashed">
					<PlusIcon class="size-4" />
					{t('docs.add')}
				</Button>
			{/snippet}
		</AddDocuments>
	</div>
</div>

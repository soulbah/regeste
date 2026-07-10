<script lang="ts">
	// Library page rework (owner round, 2026-07-11): one toolbar (name filter,
	// sort, segmented type filter, Add on the right), richer rows, the intro
	// moved into the empty state. List over grid: it scales and carries the
	// product's facts-first tone (Claude Projects / Drive recipe).
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Progress } from '$lib/components/ui/progress';
	import * as Select from '$lib/components/ui/select';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FilesIcon from '@lucide/svelte/icons/files';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import InfoIcon from '@lucide/svelte/icons/info';
	import DocumentSheet from '$lib/components/document-sheet.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import type { LibraryDocument } from '$lib/types';

	let fileInput = $state<HTMLInputElement | null>(null);
	let deleteTarget = $state<LibraryDocument | null>(null);
	let sheetTarget = $state<LibraryDocument | null>(null);

	// F2 — filter + sort, plain client-side.
	let query = $state('');
	let sortBy = $state<'recent' | 'name' | 'size'>('recent');
	let typeFilter = $state<'all' | 'pdf' | 'docx' | 'md' | 'txt'>('all');

	function docType(doc: LibraryDocument): 'pdf' | 'docx' | 'md' | 'txt' {
		const n = doc.name.toLowerCase();
		if (n.endsWith('.pdf')) return 'pdf';
		if (n.endsWith('.docx')) return 'docx';
		if (n.endsWith('.md') || n.endsWith('.markdown')) return 'md';
		return 'txt';
	}

	const shown = $derived.by(() => {
		let docs = documentsStore.library;
		if (typeFilter !== 'all') docs = docs.filter((d) => docType(d) === typeFilter);
		const q = query.trim().toLowerCase();
		if (q) docs = docs.filter((d) => d.name.toLowerCase().includes(q));
		return [...docs].sort((a, b) => {
			if (sortBy === 'name') return a.name.localeCompare(b.name);
			if (sortBy === 'size') return b.size - a.size;
			return b.createdAt - a.createdAt;
		});
	});

	const sortLabels = $derived({
		recent: t('docsPage.sortRecent'),
		name: t('docsPage.sortName'),
		size: t('docsPage.sortSize')
	});

	async function handleFiles(files: File[]) {
		// Library upload = global only (no chat attach).
		for (const file of files) {
			await documentsStore.ingest(file);
		}
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		await documentsStore.remove(deleteTarget.id);
		deleteTarget = null;
	}
</script>

<svelte:head><title>{t('docs.title')} · Folio</title></svelte:head>

<input
	bind:this={fileInput}
	type="file"
	multiple
	accept=".pdf,.docx,.md,.markdown,.txt"
	class="hidden"
	onchange={(e) => {
		// Copy before resetting: input.files is live and value = '' empties it.
		const files = Array.from(e.currentTarget.files ?? []);
		e.currentTarget.value = '';
		handleFiles(files);
	}}
/>

<div class="flex h-full flex-col">
	<header class="flex h-14 shrink-0 items-center gap-1 border-b px-4">
		<Sidebar.Trigger class="shrink-0 md:hidden" />
		<div class="min-w-0 px-1">
			<h1 class="font-display text-lg tracking-tight">{t('docs.title')}</h1>
			<p class="text-muted-foreground text-xs">
				{t('docsPage.count', { count: documentsStore.library.length })}
			</p>
		</div>
	</header>

	{#if documentsStore.library.length === 0}
		<!-- The privacy pitch lives here, said once, where it can still convince. -->
		<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16">
			<FilesIcon class="text-muted-foreground size-10" />
			<h2 class="font-display text-2xl tracking-tight">{t('docsPage.emptyTitle')}</h2>
			<p class="text-muted-foreground max-w-md text-center text-sm">
				{t('docsPage.intro')}
			</p>
			<Button class="gap-2" onclick={() => fileInput?.click()}>
				<PlusIcon class="size-4" />
				{t('docsPage.add')}
			</Button>
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				{t('docsPage.types')}
			</p>
		</div>
	{:else}
		<div class="mx-auto w-full max-w-4xl flex-1 space-y-4 overflow-y-auto p-6">
			<div class="flex flex-wrap items-center gap-2">
				<div class="relative w-56">
					<SearchIcon
						class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
					/>
					<Input
						bind:value={query}
						placeholder={t('docsPage.search')}
						class="h-8 pl-8 text-sm"
						aria-label={t('docsPage.search')}
					/>
				</div>
				<Select.Root type="single" bind:value={sortBy}>
					<Select.Trigger class="h-8 w-36 text-xs">{sortLabels[sortBy]}</Select.Trigger>
					<Select.Content>
						<Select.Item value="recent">{t('docsPage.sortRecent')}</Select.Item>
						<Select.Item value="name">{t('docsPage.sortName')}</Select.Item>
						<Select.Item value="size">{t('docsPage.sortSize')}</Select.Item>
					</Select.Content>
				</Select.Root>
				<div class="bg-muted/70 flex gap-0.5 rounded-lg p-0.5">
					{#each ['all', 'pdf', 'docx', 'md', 'txt'] as filter (filter)}
						<Button
							variant="ghost"
							size="xs"
							class="h-7 rounded-[7px] px-2.5 font-mono text-[10px] uppercase {typeFilter === filter
								? 'bg-card dark:bg-foreground/14 hover:bg-card dark:hover:bg-foreground/14 text-foreground shadow-xs'
								: 'text-muted-foreground'}"
							aria-pressed={typeFilter === filter}
							onclick={() => (typeFilter = filter as typeof typeFilter)}
						>
							{filter === 'all' ? t('docsPage.filterAll') : filter}
						</Button>
					{/each}
				</div>
				<div class="flex-1"></div>
				<Button onclick={() => fileInput?.click()} class="shrink-0 gap-2">
					<PlusIcon class="size-4" />
					{t('docsPage.add')}
				</Button>
			</div>

			<Card.Root>
				<Card.Content class="divide-y p-0">
					{#each shown as doc (doc.id)}
						{@const ingest = documentsStore.ingests[doc.id]}
						<div class="group hover:bg-foreground/3 flex items-center gap-4 px-4 py-3">
							<FileTextIcon class="text-muted-foreground size-5 shrink-0" />
							<div class="min-w-0 flex-1">
								<Button
									variant="ghost"
									class="hover:text-foreground block h-auto w-full justify-start truncate p-0 text-left text-sm font-medium hover:bg-transparent"
									onclick={() => (sheetTarget = doc)}
									aria-label={t('docsPage.openAria', { name: doc.name })}
								>
									{doc.name}
								</Button>
								<p class="text-muted-foreground font-mono text-[10px] uppercase">
									{docType(doc)} · {(doc.size / 1024).toFixed(0)} KB{doc.pages
										? ` · ${t('common.pages', { n: doc.pages })}`
										: ''} · {t('docsPage.added', {
										date: new Date(doc.createdAt).toLocaleDateString()
									})}
									{#if doc.status === 'error'}
										· {doc.error === 'scanned_pdf' ? t('docsPage.noText') : t('docsPage.error')}
									{:else if doc.status !== 'ready'}
										· {doc.status}…
									{/if}
								</p>
								{#if ingest && doc.status === 'embedding'}
									<Progress value={ingest.phaseProgress * 100} class="mt-1.5 h-1" />
								{/if}
							</div>
							{#if documentsStore.egress[doc.id]}
								<Badge variant="working" class="shrink-0 text-[10px]">
									{t('docsPage.sentOn', {
										date: new Date(documentsStore.egress[doc.id]).toLocaleDateString()
									})}
								</Badge>
							{:else}
								<Badge variant="secondary" class="shrink-0 text-[10px]">
									{t('docsPage.neverSent')}
								</Badge>
							{/if}
							<Badge variant="outline" class="shrink-0">
								{t('docsPage.inChats', {
									count: doc.chatCount,
									s: doc.chatCount === 1 ? '' : 's'
								})}
							</Badge>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button {...props} variant="ghost" size="icon" class="size-7">
											<EllipsisVerticalIcon class="size-4" />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end" class="w-56">
									<DropdownMenu.Item onclick={() => (sheetTarget = doc)}>
										<InfoIcon class="text-muted-foreground" />
										{t('docsPage.details')}
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item class="text-destructive" onclick={() => (deleteTarget = doc)}>
										<Trash2Icon class="text-destructive" />
										{t('docsPage.deleteFromDevice')}
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
					{:else}
						<p class="text-muted-foreground p-10 text-center text-sm">
							{t('docsPage.noMatch')}
						</p>
					{/each}
				</Card.Content>
			</Card.Root>
		</div>
	{/if}
</div>

<AlertDialog.Root open={deleteTarget !== null} onOpenChange={(o) => !o && (deleteTarget = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{t('docsPage.deleteTitle', { name: deleteTarget?.name ?? '' })}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{#if deleteTarget && deleteTarget.chatCount > 0}
					{t('docsPage.usedIn', {
						count: deleteTarget.chatCount,
						s: deleteTarget.chatCount === 1 ? '' : 's'
					})}
				{/if}
				{t('docsPage.deleteBody')}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{t('common.cancel')}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirmDelete}>{t('docsPage.deleteConfirm')}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<DocumentSheet document={sheetTarget} onclose={() => (sheetTarget = null)} />

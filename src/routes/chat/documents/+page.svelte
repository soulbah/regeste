<script lang="ts">
	// Library page. One toolbar (name filter, sort, segmented type filter, Add on
	// the right), richer rows, the intro moved into the empty state. List over
	// grid: it scales and carries the product's facts-first tone. Details open in
	// a docked right contextual panel (not an overlay drawer); a right Sheet takes
	// over below the lg breakpoint. The list pages client-side so a large library
	// stays scannable.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import * as Pagination from '$lib/components/ui/pagination';
	import { Progress } from '$lib/components/ui/progress';
	import * as Select from '$lib/components/ui/select';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FilesIcon from '@lucide/svelte/icons/files';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import InfoIcon from '@lucide/svelte/icons/info';
	import DocumentDetailPanel from '$lib/components/document-detail-panel.svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import type { LibraryDocument } from '$lib/types';

	let fileInput = $state<HTMLInputElement | null>(null);
	let deleteTarget = $state<LibraryDocument | null>(null);
	let selected = $state<LibraryDocument | null>(null);

	// F2 — filter + sort, plain client-side.
	let query = $state('');
	let sortBy = $state<'recent' | 'name' | 'size'>('recent');
	let typeFilter = $state<'all' | 'pdf' | 'docx' | 'md' | 'txt'>('all');

	// Client-side pagination: numbered pages under the list. Small page size so
	// the control appears for a real library rather than only past 25 documents.
	const PAGE_SIZE = 10;
	let pageNum = $state(1);

	// Details dock as a right panel on lg+, a right Sheet below that.
	const lgViewport = new MediaQuery('(min-width: 1024px)');

	// Dev-only display mocks: /chat/documents?mock renders fake rows so the
	// page can be reviewed without ingesting anything. Display only — the
	// row actions hit the real (empty) store and do nothing.
	const MOCK_DOCS: LibraryDocument[] = [
		mock('contrat-de-bail-2026.pdf', 412_688, 14, 'ready', 3, 8),
		mock('cgv-fournisseur-cloud.pdf', 189_204, 6, 'ready', 1, 6),
		mock('accord-de-confidentialite.docx', 48_112, 4, 'ready', 2, 4),
		mock('notes-reunion-produit-q3.md', 3_920, null, 'ready', 0, 2),
		mock('facture-cabinet-conseil.pdf', 92_530, 1, 'embedding', 0, 1),
		mock('politique-teletravail.txt', 2_480, null, 'ready', 1, 0)
	];
	function mock(
		name: string,
		size: number,
		pages: number | null,
		status: LibraryDocument['status'],
		chatCount: number,
		daysAgo: number
	): LibraryDocument {
		return {
			id: `mock-${name}`,
			hash: name,
			name,
			mime: '',
			size,
			pages,
			status,
			error: null,
			embeddingModel: null,
			language: 'fr',
			createdAt: Date.now() - daysAgo * 86_400_000,
			updatedAt: Date.now(),
			chatCount
		};
	}
	const useMocks = $derived(dev && page.url.searchParams.has('mock'));
	const library = $derived(useMocks ? MOCK_DOCS : documentsStore.library);

	function docType(doc: LibraryDocument): 'pdf' | 'docx' | 'md' | 'txt' {
		const n = doc.name.toLowerCase();
		if (n.endsWith('.pdf')) return 'pdf';
		if (n.endsWith('.docx')) return 'docx';
		if (n.endsWith('.md') || n.endsWith('.markdown')) return 'md';
		return 'txt';
	}

	const shown = $derived.by(() => {
		let docs = library;
		if (typeFilter !== 'all') docs = docs.filter((d) => docType(d) === typeFilter);
		const q = query.trim().toLowerCase();
		if (q) docs = docs.filter((d) => d.name.toLowerCase().includes(q));
		return [...docs].sort((a, b) => {
			if (sortBy === 'name') return a.name.localeCompare(b.name);
			if (sortBy === 'size') return b.size - a.size;
			return b.createdAt - a.createdAt;
		});
	});

	// Reset to the first page whenever the filtered set is redefined, so a filter
	// can never strand the user on a now-empty page.
	$effect(() => {
		void query;
		void sortBy;
		void typeFilter;
		pageNum = 1;
	});
	// Clamp after the set shrinks (e.g. a delete emptied the last page).
	$effect(() => {
		const total = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
		if (pageNum > total) pageNum = total;
	});

	const paged = $derived(shown.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE));

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
		const id = deleteTarget.id;
		await documentsStore.remove(id);
		if (selected?.id === id) selected = null;
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

<div class="flex h-full">
	<section class="flex h-full min-w-0 flex-1 flex-col">
		<header class="flex h-14 shrink-0 items-center gap-1 border-b px-4">
			<Sidebar.Trigger class="shrink-0 md:hidden" />
			<div class="min-w-0 px-1">
				<h1 class="font-display text-lg tracking-tight">{t('docs.title')}</h1>
				<p class="text-muted-foreground text-xs">
					{t('docsPage.count', { count: library.length })}
				</p>
			</div>
		</header>

		{#if library.length === 0}
			<!-- The privacy pitch lives here, said once, where it can still convince. -->
			<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16">
				<FilesIcon class="text-muted-foreground size-10" />
				<h2 class="font-display text-2xl tracking-tight">{t('docsPage.emptyTitle')}</h2>
				<div class="max-w-md space-y-2 text-center">
					<p class="text-muted-foreground text-sm">{t('docsPage.intro')}</p>
					<p class="text-muted-foreground text-sm">{t('docsPage.introAction')}</p>
				</div>
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
								class="h-7 rounded-md px-2.5 font-mono text-[10px] uppercase {typeFilter === filter
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

				<Card.Root class="rounded-xl">
					<Card.Content class="divide-y p-0">
						{#each paged as doc (doc.id)}
							{@const ingest = documentsStore.ingests[doc.id]}
							<div
								class="group hover:bg-foreground/3 flex items-center gap-4 px-4 py-3 {selected?.id ===
								doc.id
									? 'bg-foreground/4'
									: ''}"
							>
								<FileTextIcon class="text-muted-foreground size-5 shrink-0" />
								<div class="min-w-0 flex-1">
									<Button
										variant="ghost"
										class="hover:text-foreground block h-auto w-full justify-start truncate p-0 text-left text-sm font-medium hover:bg-transparent"
										onclick={() => (selected = doc)}
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
										<DropdownMenu.Item onclick={() => (selected = doc)}>
											<InfoIcon class="text-muted-foreground" />
											{t('docsPage.details')}
										</DropdownMenu.Item>
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											class="text-destructive"
											onclick={() => (deleteTarget = doc)}
										>
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

				{#if shown.length > PAGE_SIZE}
					<Pagination.Root
						count={shown.length}
						perPage={PAGE_SIZE}
						bind:page={pageNum}
						siblingCount={1}
					>
						{#snippet children({ pages, currentPage })}
							<Pagination.Content>
								<Pagination.Item>
									<Pagination.PrevButton aria-label={t('pagination.prev')} />
								</Pagination.Item>
								{#each pages as p (p.key)}
									{#if p.type === 'ellipsis'}
										<Pagination.Item>
											<Pagination.Ellipsis />
										</Pagination.Item>
									{:else}
										<Pagination.Item>
											<Pagination.Link
												page={p}
												isActive={currentPage === p.value}
												aria-label={t('pagination.goToPage', { n: p.value })}
											>
												{p.value}
											</Pagination.Link>
										</Pagination.Item>
									{/if}
								{/each}
								<Pagination.Item>
									<Pagination.NextButton aria-label={t('pagination.next')} />
								</Pagination.Item>
							</Pagination.Content>
						{/snippet}
					</Pagination.Root>
				{/if}
			</div>
		{/if}
	</section>

	{#if selected}
		<aside class="hidden w-96 shrink-0 flex-col border-l lg:flex">
			<DocumentDetailPanel
				document={selected}
				onhide={() => (selected = null)}
				onrequestdelete={(d) => (deleteTarget = d)}
			/>
		</aside>
	{/if}
</div>

<!-- Below 1024px the detail rides a right Sheet over the list. -->
{#if !lgViewport.current}
	<Sheet.Root open={selected !== null} onOpenChange={(o) => !o && (selected = null)}>
		<Sheet.Content
			side="right"
			class="w-full gap-0 p-0 sm:max-w-md [&>[data-slot=sheet-close]]:hidden"
		>
			<DocumentDetailPanel
				document={selected}
				onhide={() => (selected = null)}
				onrequestdelete={(d) => (deleteTarget = d)}
			/>
		</Sheet.Content>
	</Sheet.Root>
{/if}

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

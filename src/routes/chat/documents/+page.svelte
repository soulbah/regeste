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
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Select from '$lib/components/ui/select';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import PanelShell from '$lib/components/panel-shell.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FilesIcon from '@lucide/svelte/icons/files';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import InfoIcon from '@lucide/svelte/icons/info';
	import ReplaceIcon from '@lucide/svelte/icons/replace';
	import ChevronsLeftIcon from '@lucide/svelte/icons/chevrons-left';
	import ChevronsRightIcon from '@lucide/svelte/icons/chevrons-right';
	import DocumentDetailPanel from '$lib/components/document-detail-panel.svelte';
	import ViewerPanel from '$lib/components/viewer-panel.svelte';
	import { toast } from 'svelte-sonner';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { documentStatusKey } from '$lib/document-status';
	import { t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import type { LibraryDocument } from '$lib/types';

	let fileInput = $state<HTMLInputElement | null>(null);
	let replaceInput = $state<HTMLInputElement | null>(null);
	let replaceTarget = $state<LibraryDocument | null>(null);
	let deleteTarget = $state<LibraryDocument | null>(null);
	let selected = $state<LibraryDocument | null>(null);

	// F2 — filter + sort, plain client-side.
	let query = $state('');
	let sortBy = $state<'recent' | 'name' | 'size'>('recent');
	let typeFilter = $state<'all' | 'pdf' | 'docx' | 'md' | 'txt'>('all');

	// Client-side pagination with a chooseable page size. The full bar (range,
	// per-page, first/last jumps) shows once the library outgrows the smallest
	// page size, so bumping the size never makes the control vanish.
	const PAGE_SIZES = [10, 25, 50] as const;
	let pageSize = $state<(typeof PAGE_SIZES)[number]>(10);
	let pageNum = $state(1);

	// The panel hosts either the selected document's detail or, once the user
	// opens it, the document viewer (same reuse as the chat). Open exactly when
	// one of those is showing. Writable derived: PanelShell may flip it on
	// drag-close, and onOpenChange then clears the state so it settles closed.
	let panelOpen = $derived(selected !== null || viewerStore.isOpen);

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
	// Only trust "empty" once the first library load lands — otherwise the empty
	// state flashes before the rows arrive on a page refresh.
	const loaded = $derived(useMocks || documentsStore.libraryLoaded);

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

	// Reset to the first page whenever the filtered set or the page size changes,
	// so neither can strand the user on a now-empty page.
	$effect(() => {
		void query;
		void sortBy;
		void typeFilter;
		void pageSize;
		pageNum = 1;
	});
	// Clamp after the set shrinks (e.g. a delete emptied the last page).
	$effect(() => {
		const total = Math.max(1, Math.ceil(shown.length / pageSize));
		if (pageNum > total) pageNum = total;
	});

	const paged = $derived(shown.slice((pageNum - 1) * pageSize, pageNum * pageSize));
	const lastPage = $derived(Math.max(1, Math.ceil(shown.length / pageSize)));
	// The library outgrew the smallest page size: show the full pagination bar.
	const paginated = $derived(shown.length > PAGE_SIZES[0]);

	const sortLabels = $derived({
		recent: t('docsPage.sortRecent'),
		name: t('docsPage.sortName'),
		size: t('docsPage.sortSize')
	});

	async function handleFiles(files: File[]) {
		// Library upload = global only (no chat attach). ingestMany inserts every
		// row up front so the whole selection appears at once, then indexes in the
		// background instead of one file at a time.
		await documentsStore.ingestMany(files);
	}

	// Same drop affordance as the chat thread (C7): files dropped anywhere on
	// the page land in the library through the normal upload path.
	let dragging = $state(false);
	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (files.length) handleFiles(files);
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		const id = deleteTarget.id;
		await documentsStore.remove(id);
		if (selected?.id === id) selected = null;
		deleteTarget = null;
	}

	// Replace from the row menu: the target is set by the menu item, then the
	// hidden input is opened and its file swapped in (same path as the panel).
	async function handleReplace(files: File[]) {
		const doc = replaceTarget;
		replaceTarget = null;
		if (!doc || !files.length) return;
		const file = files[0];
		const error = await documentsStore.replace(doc.id, file);
		if (error) {
			toast.error(t('sheet.replaceFailed', { name: file.name }), {
				description:
					error === 'parse_failed' || error === 'scanned_pdf'
						? t('sheet.replaceFailedNoText')
						: t('sheet.replaceFailedKeep')
			});
		} else {
			toast.success(t('sheet.replaced'), { description: t('sheet.replacedDesc') });
		}
	}
</script>

<svelte:head><title>{t('docs.title')} · Regeste</title></svelte:head>

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
<input
	bind:this={replaceInput}
	type="file"
	accept=".pdf,.docx,.md,.markdown,.txt"
	class="hidden"
	onchange={(e) => {
		const files = Array.from(e.currentTarget.files ?? []);
		e.currentTarget.value = '';
		handleReplace(files);
	}}
/>

<PanelShell
	bind:open={panelOpen}
	onOpenChange={(o) => {
		if (!o) {
			selected = null;
			viewerStore.close();
		}
	}}
	autoSaveId="regeste-docs-panes"
>
	{#snippet main()}
		<section
			class="relative flex h-full min-w-0 flex-1 flex-col {dragging ? 'bg-muted/50' : ''}"
			role="region"
			aria-label={t('docs.title')}
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
						{t('docsPage.drop')}
					</p>
				</div>
			{/if}
			<header class="flex h-14 shrink-0 items-center gap-1 border-b px-4">
				<Sidebar.Trigger class="shrink-0 md:hidden" />
				<div class="min-w-0 px-1">
					<h1 class="font-display text-lg tracking-tight">{t('docs.title')}</h1>
					<p class="text-muted-foreground text-xs">
						{t('docsPage.count', { count: library.length })}
					</p>
				</div>
			</header>

			{#if loaded && library.length === 0}
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
									class="h-7 rounded-md px-2.5 font-mono text-[10px] uppercase {typeFilter ===
									filter
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
							{#if !loaded}
								{#each { length: 5 }, i (i)}
									<div class="flex items-center gap-4 px-4 py-3">
										<Skeleton class="size-5 shrink-0 rounded" />
										<div class="min-w-0 flex-1 space-y-2">
											<Skeleton class="h-3.5 w-48" />
											<Skeleton class="h-2.5 w-64" />
										</div>
										<Skeleton class="h-5 w-20 shrink-0 rounded-full" />
									</div>
								{/each}
							{:else}
								{#each paged as doc (doc.id)}
									{@const ingest = documentsStore.ingests[doc.id]}
									{@const st = ingest?.status ?? doc.status}
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
												onclick={() => {
													selected = doc;
													viewerStore.close();
												}}
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
												{#if st === 'error'}
													· {t('docsPage.error')}
												{:else if st !== 'ready'}
													· {t(documentStatusKey(st, ingest?.error ?? doc.error))}
												{/if}
											</p>
											{#if ingest && st === 'embedding'}
												<Progress value={ingest.phaseProgress * 100} class="mt-1.5 h-1" />
											{/if}
										</div>
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
												<DropdownMenu.Item
													onclick={() => {
														selected = doc;
														viewerStore.close();
													}}
												>
													<InfoIcon class="text-muted-foreground" />
													{t('docsPage.details')}
												</DropdownMenu.Item>
												<DropdownMenu.Item
													onclick={() => {
														replaceTarget = doc;
														replaceInput?.click();
													}}
												>
													<ReplaceIcon class="text-muted-foreground" />
													{t('sheet.replaceFile')}
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
							{/if}
						</Card.Content>
					</Card.Root>

					{#if paginated}
						<div class="flex flex-wrap items-center justify-between gap-3 pt-1">
							<p class="text-muted-foreground text-xs">
								{t('pagination.range', {
									from: (pageNum - 1) * pageSize + 1,
									to: Math.min(pageNum * pageSize, shown.length),
									total: shown.length
								})}
							</p>
							<div class="flex items-center gap-2">
								<span class="text-muted-foreground hidden text-xs whitespace-nowrap sm:inline">
									{t('pagination.perPage')}
								</span>
								<Select.Root
									type="single"
									value={String(pageSize)}
									onValueChange={(v) => (pageSize = Number(v) as (typeof PAGE_SIZES)[number])}
								>
									<Select.Trigger class="h-8 w-16 text-xs" aria-label={t('pagination.perPage')}>
										{pageSize}
									</Select.Trigger>
									<Select.Content>
										{#each PAGE_SIZES as size (size)}
											<Select.Item value={String(size)}>{size}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
								<Pagination.Root
									count={shown.length}
									perPage={pageSize}
									bind:page={pageNum}
									siblingCount={1}
								>
									{#snippet children({ pages, currentPage })}
										<Pagination.Content>
											<Pagination.Item>
												<Button
													variant="ghost"
													size="icon-sm"
													disabled={currentPage === 1}
													onclick={() => (pageNum = 1)}
													aria-label={t('pagination.first')}
												>
													<ChevronsLeftIcon />
												</Button>
											</Pagination.Item>
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
											<Pagination.Item>
												<Button
													variant="ghost"
													size="icon-sm"
													disabled={currentPage === lastPage}
													onclick={() => (pageNum = lastPage)}
													aria-label={t('pagination.last')}
												>
													<ChevronsRightIcon />
												</Button>
											</Pagination.Item>
										</Pagination.Content>
									{/snippet}
								</Pagination.Root>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{/snippet}
	{#snippet panel()}
		{#if viewerStore.isOpen}
			<!-- Opening a document swaps the detail for the viewer in the same panel
			     (its back arrow returns to the detail); mirrors the chat. -->
			<ViewerPanel
				onhide={() => {
					viewerStore.close();
					selected = null;
				}}
			/>
		{:else if selected}
			<DocumentDetailPanel
				document={selected}
				onhide={() => (selected = null)}
				onrequestdelete={(d) => (deleteTarget = d)}
			/>
		{/if}
	{/snippet}
</PanelShell>

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

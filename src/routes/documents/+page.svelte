<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Progress } from '$lib/components/ui/progress';
	import * as Select from '$lib/components/ui/select';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import DocumentSheet from '$lib/components/document-sheet.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import type { LibraryDocument } from '$lib/types';

	let fileInput = $state<HTMLInputElement | null>(null);
	let deleteTarget = $state<LibraryDocument | null>(null);
	let sheetTarget = $state<LibraryDocument | null>(null);

	// F2 — sort + type filter, plain client-side.
	let sortBy = $state<'recent' | 'name' | 'size'>('recent');
	let typeFilter = $state<'all' | 'pdf' | 'docx' | 'md' | 'txt'>('all');

	function docType(doc: LibraryDocument): string {
		const n = doc.name.toLowerCase();
		if (n.endsWith('.pdf')) return 'pdf';
		if (n.endsWith('.docx')) return 'docx';
		if (n.endsWith('.md') || n.endsWith('.markdown')) return 'md';
		return 'txt';
	}

	const shown = $derived.by(() => {
		let docs = documentsStore.library;
		if (typeFilter !== 'all') docs = docs.filter((d) => docType(d) === typeFilter);
		return [...docs].sort((a, b) => {
			if (sortBy === 'name') return a.name.localeCompare(b.name);
			if (sortBy === 'size') return b.size - a.size;
			return b.createdAt - a.createdAt;
		});
	});

	const sortLabels = { recent: 'Most recent', name: 'Name', size: 'Size' } as const;

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

<svelte:head><title>Documents · Folio</title></svelte:head>

<div class="flex h-svh flex-col">
	<header class="flex items-center justify-between border-b px-6 py-3">
		<div>
			<h1 class="font-display text-lg tracking-tight">Documents</h1>
			<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
				{documentsStore.library.length} in your workspace
			</p>
		</div>
		<span
			class="text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-widest uppercase"
		>
			<span class="bg-mode-private size-1.5 rounded-full"></span> Stored locally
		</span>
	</header>

	<div class="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto p-6">
		<div class="flex items-center justify-between gap-4">
			<p class="text-muted-foreground text-sm">
				Every document you've added to Folio lives here and stays on this device. Add one to a chat
				to start asking questions about it.
			</p>
			<Button onclick={() => fileInput?.click()} class="shrink-0 gap-2">
				<PlusIcon class="size-4" /> Add documents
			</Button>
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
		</div>

		<div class="flex items-center gap-2">
			<Select.Root type="single" bind:value={sortBy}>
				<Select.Trigger class="h-8 w-40 text-xs">{sortLabels[sortBy]}</Select.Trigger>
				<Select.Content>
					<Select.Item value="recent">Most recent</Select.Item>
					<Select.Item value="name">Name</Select.Item>
					<Select.Item value="size">Size</Select.Item>
				</Select.Content>
			</Select.Root>
			<div class="flex gap-1">
				{#each ['all', 'pdf', 'docx', 'md', 'txt'] as t (t)}
					<Button
						variant={typeFilter === t ? 'secondary' : 'ghost'}
						size="sm"
						class="h-8 px-2 font-mono text-[10px] uppercase"
						onclick={() => (typeFilter = t as typeof typeFilter)}
					>
						{t}
					</Button>
				{/each}
			</div>
		</div>

		<Card.Root>
			<Card.Content class="divide-y p-0">
				{#each shown as doc (doc.id)}
					{@const ingest = documentsStore.ingests[doc.id]}
					<div class="flex items-center gap-4 px-4 py-3">
						<FileTextIcon class="text-muted-foreground size-5 shrink-0" />
						<div class="min-w-0 flex-1">
							<Button
								variant="ghost"
								class="hover:text-foreground block h-auto w-full justify-start truncate p-0 text-left text-sm font-medium hover:bg-transparent"
								onclick={() => (sheetTarget = doc)}
								aria-label="Open details for {doc.name}"
							>
								{doc.name}
							</Button>
							<p class="text-muted-foreground font-mono text-[10px] uppercase">
								{(doc.size / 1024).toFixed(0)} KB{doc.pages ? ` · ${doc.pages} pages` : ''}
								{#if doc.language}
									· {doc.language}
								{/if}
								{#if doc.status === 'ready'}
									· ready
								{:else if doc.status === 'error'}
									· {doc.error === 'scanned_pdf' ? 'no extractable text' : 'error'}
								{:else}
									· {doc.status}…
								{/if}
							</p>
							{#if ingest && doc.status === 'embedding'}
								<Progress value={ingest.phaseProgress * 100} class="mt-1.5 h-1" />
							{/if}
						</div>
						{#if documentsStore.egress[doc.id]}
							<Badge variant="outline" class="gap-1 font-mono text-[10px] uppercase">
								<span class="bg-mode-assisted size-1.5 rounded-full"></span>
								Excerpts sent {new Date(documentsStore.egress[doc.id]).toLocaleDateString()}
							</Badge>
						{:else}
							<Badge variant="outline" class="gap-1 font-mono text-[10px] uppercase">
								<span class="bg-mode-private size-1.5 rounded-full"></span>
								Never sent
							</Badge>
						{/if}
						<Badge variant="outline">
							In {doc.chatCount} chat{doc.chatCount === 1 ? '' : 's'}
						</Badge>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="ghost" size="icon" class="size-7">
										<EllipsisVerticalIcon class="size-4" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								<DropdownMenu.Item class="text-destructive" onclick={() => (deleteTarget = doc)}>
									Delete from this device
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				{:else}
					<p class="text-muted-foreground p-6 text-center text-sm">
						No documents yet — add PDF, Word, Markdown or text files.
					</p>
				{/each}
			</Card.Content>
		</Card.Root>
	</div>
</div>

<AlertDialog.Root open={deleteTarget !== null} onOpenChange={(o) => !o && (deleteTarget = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete "{deleteTarget?.name}" from this device?</AlertDialog.Title>
			<AlertDialog.Description>
				{#if deleteTarget && deleteTarget.chatCount > 0}
					This document is used in {deleteTarget.chatCount} chat{deleteTarget.chatCount === 1
						? ''
						: 's'}.
				{/if}
				The file, its index and its embeddings will be permanently removed. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirmDelete}>Delete permanently</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<DocumentSheet document={sheetTarget} onclose={() => (sheetTarget = null)} />

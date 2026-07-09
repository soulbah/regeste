<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Progress } from '$lib/components/ui/progress';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import XIcon from '@lucide/svelte/icons/x';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';

	let { chatId }: { chatId: string } = $props();

	function statusLabel(status: string, error: string | null): string {
		if (error === 'scanned_pdf') return 'No extractable text — OCR not supported yet';
		if (error) return error;
		if (status === 'ready') return 'Ready';
		if (status === 'embedding') return 'Indexing';
		if (status === 'parsing') return 'Reading';
		if (status === 'chunking') return 'Splitting';
		return status;
	}
</script>

<div class="flex h-full flex-col">
	<div class="border-b p-4">
		<h2 class="font-display text-lg tracking-tight">Documents</h2>
		<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
			Attached to this chat · stored locally
		</p>
	</div>
	<ScrollArea class="flex-1">
		<div class="space-y-1 p-2">
			{#each chatsStore.chatDocuments as doc (doc.id)}
				{@const ingest = documentsStore.ingests[doc.id]}
				<div class="hover:bg-accent/50 group flex items-start gap-2 rounded-md p-2">
					<Checkbox
						checked={doc.enabled}
						disabled={doc.status !== 'ready'}
						onCheckedChange={(v) => chatsStore.toggleDocument(chatId, doc.id, v === true)}
						aria-label="Use {doc.name} for questions"
					/>
					<FileTextIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
					<div class="min-w-0 flex-1">
						{#if doc.status === 'ready'}
							<Button
								variant="ghost"
								class="hover:text-foreground block h-auto w-full justify-start truncate p-0 text-left text-sm font-medium hover:bg-transparent"
								onclick={() => viewerStore.openDocument(doc)}
								aria-label="Open {doc.name} in the viewer"
							>
								{doc.name}
							</Button>
						{:else}
							<p class="truncate text-sm font-medium">{doc.name}</p>
						{/if}
						<p class="text-muted-foreground font-mono text-[10px] uppercase">
							{(doc.size / 1024).toFixed(0)} KB{doc.pages ? ` · ${doc.pages} pages` : ''}
						</p>
						{#if doc.status === 'ready'}
							<Badge variant="outline" class="mt-1 gap-1 text-[10px]">
								<span class="bg-mode-private size-1.5 rounded-full"></span> Ready
							</Badge>
						{:else if doc.status === 'error'}
							<Badge variant="destructive" class="mt-1 text-[10px]">
								{statusLabel(doc.status, doc.error)}
							</Badge>
						{:else}
							<Badge variant="secondary" class="mt-1 text-[10px]">
								{statusLabel(doc.status, doc.error)}…
							</Badge>
							{#if ingest && doc.status === 'embedding'}
								<Progress value={ingest.phaseProgress * 100} class="mt-1.5 h-1" />
							{/if}
						{/if}
					</div>
					<Button
						variant="ghost"
						size="icon"
						class="size-6 opacity-0 group-hover:opacity-100"
						onclick={() => chatsStore.detach(chatId, doc.id)}
						aria-label="Remove {doc.name} from this chat"
					>
						<XIcon class="size-3.5" />
					</Button>
				</div>
			{:else}
				<p class="text-muted-foreground p-4 text-sm">No documents in this chat yet.</p>
			{/each}
		</div>
	</ScrollArea>
</div>

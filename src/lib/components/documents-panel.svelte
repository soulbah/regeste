<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Switch } from '$lib/components/ui/switch';
	import XIcon from '@lucide/svelte/icons/x';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PanelHeader from '$lib/components/panel-header.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';

	let { chatId, onhide = null }: { chatId: string; onhide?: (() => void) | null } = $props();

	function statusLabel(status: string, error: string | null): string {
		if (error === 'scanned_pdf') return t('status.scanned');
		if (error) return error;
		if (status === 'ready') return t('status.ready');
		if (status === 'embedding') return t('status.indexing');
		if (status === 'parsing') return t('status.reading');
		if (status === 'chunking') return t('status.splitting');
		return status;
	}
</script>

<div class="flex h-full flex-col">
	<PanelHeader title={t('sources.title')} subtitle={t('sources.subtitle')} {onhide} />
	<!-- P7: hard lock — cloud modes are unselectable while this is on. -->
	<div class="flex items-center justify-between gap-3 border-b px-4 py-2.5">
		<Label for="private-only" class="text-xs font-normal">
			{t('docs.privateOnly')}
		</Label>
		<Switch
			id="private-only"
			checked={chatsStore.activeChat?.privateOnly ?? false}
			onCheckedChange={(v) => chatsStore.setPrivateOnly(chatId, v === true)}
		/>
	</div>
	<ScrollArea class="flex-1">
		<div class="space-y-1 p-2">
			{#each chatsStore.chatDocuments as doc (doc.id)}
				{@const ingest = documentsStore.ingests[doc.id]}
				<div class="hover:bg-foreground/6 group flex items-start gap-2 rounded-md p-2">
					<Checkbox
						checked={doc.enabled}
						disabled={doc.status !== 'ready'}
						onCheckedChange={(v) => chatsStore.toggleDocument(chatId, doc.id, v === true)}
						aria-label={t('docs.useAria', { name: doc.name })}
					/>
					<FileTextIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
					<div class="min-w-0 flex-1">
						{#if doc.status === 'ready'}
							<Button
								variant="ghost"
								class="hover:text-foreground block h-auto w-full justify-start truncate p-0 text-left text-sm font-medium hover:bg-transparent"
								onclick={() => viewerStore.openDocument(doc)}
								aria-label={t('docs.openAria', { name: doc.name })}
							>
								{doc.name}
							</Button>
						{:else}
							<p class="truncate text-sm font-medium">{doc.name}</p>
						{/if}
						<p class="text-muted-foreground font-mono text-[10px] uppercase">
							{(doc.size / 1024).toFixed(0)} KB{doc.pages
								? ` · ${t('common.pages', { n: doc.pages })}`
								: ''}
						</p>
						{#if doc.status === 'ready'}
							<Badge class="mt-1 text-[10px]">{t('status.ready')}</Badge>
						{:else if doc.status === 'error'}
							<Badge variant="destructive" class="mt-1 text-[10px]">
								{statusLabel(doc.status, doc.error)}
							</Badge>
						{:else}
							<Badge class="mt-1 gap-1 text-[10px]">
								<span class="bg-ring size-1.5 animate-pulse rounded-full"></span>
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
						aria-label={t('docs.removeAria', { name: doc.name })}
					>
						<XIcon class="size-3.5" />
					</Button>
				</div>
			{:else}
				<p class="text-muted-foreground p-4 text-sm">{t('docs.empty')}</p>
			{/each}
		</div>
	</ScrollArea>
</div>

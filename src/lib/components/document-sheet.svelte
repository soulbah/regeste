<script lang="ts">
	// D1 (spec 011): the document sheet — facts, usage, egress history, actions.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sheet from '$lib/components/ui/sheet';
	import { toast } from 'svelte-sonner';
	import { t } from '$lib/i18n/index.svelte';
	import { getLocalDb } from '$lib/local-db/client';
	import type { DocumentDetail } from '$lib/local-db/worker';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import type { LibraryDocument } from '$lib/types';

	let {
		document: doc,
		onclose
	}: {
		document: LibraryDocument | null;
		onclose: () => void;
	} = $props();

	let detail = $state<DocumentDetail | null>(null);
	let replaceInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		detail = null;
		if (!doc) return;
		const id = doc.id;
		(async () => {
			const { db } = await getLocalDb();
			detail = await db.documentDetail(id);
		})();
	});

	const live = $derived(doc ? (documentsStore.library.find((d) => d.id === doc.id) ?? doc) : null);
	const ingest = $derived(doc ? documentsStore.ingests[doc.id] : undefined);

	function fmtBytes(n: number): string {
		return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
	}

	async function handleReplace(files: File[]) {
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
			toast.success(t('sheet.replaced'), {
				description: t('sheet.replacedDesc')
			});
		}
	}
</script>

<Sheet.Root open={doc !== null} onOpenChange={(o) => !o && onclose()}>
	<Sheet.Content side="right" class="w-full overflow-y-auto sm:max-w-md">
		{#if live}
			<Sheet.Header>
				<Sheet.Title class="truncate pr-6">{live.name}</Sheet.Title>
				<Sheet.Description>
					{t('sheet.stored')}{live.language ? ` · ${live.language.toUpperCase()}` : ''}
				</Sheet.Description>
			</Sheet.Header>
			<div class="space-y-5 px-4 pb-6">
				<div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
					<span class="text-muted-foreground">{t('sheet.size')}</span><span
						>{fmtBytes(live.size)}</span
					>
					{#if live.pages}
						<span class="text-muted-foreground">{t('sheet.pages')}</span><span>{live.pages}</span>
					{/if}
					<span class="text-muted-foreground">{t('sheet.indexed')}</span>
					<span>{new Date(live.updatedAt).toLocaleString()}</span>
					<span class="text-muted-foreground">{t('sheet.model')}</span>
					<span class="truncate font-mono text-xs leading-6">{live.embeddingModel ?? '—'}</span>
					<span class="text-muted-foreground">{t('sheet.fingerprint')}</span>
					<span class="font-mono text-xs leading-6">{live.hash.slice(0, 16)}…</span>
					{#if detail?.versionCount}
						<span class="text-muted-foreground">{t('sheet.replacedLabel')}</span>
						<span>
							{t('sheet.times', {
								count: detail.versionCount,
								s: detail.versionCount === 1 ? '' : 's'
							})}
						</span>
					{/if}
				</div>

				{#if ingest && live.status !== 'ready' && live.status !== 'error'}
					<Badge variant="secondary" class="text-[10px] uppercase">{live.status}…</Badge>
				{/if}

				<Separator />

				<div class="space-y-1.5">
					<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
						{t('sheet.privacy')}
					</p>
					{#if detail === null}
						<p class="text-muted-foreground text-xs">{t('sheet.loading')}</p>
					{:else if detail.egress.length === 0}
						<Badge variant="outline" class="gap-1 text-[10px]">
							<span class="bg-ring size-1.5 rounded-full"></span>
							{t('sheet.neverSent')}
						</Badge>
					{:else}
						{#each detail.egress as e, i (i)}
							<p class="text-xs">
								{t('sheet.egressLine', {
									date: new Date(e.createdAt).toLocaleString(),
									dest: e.destination
								})}
							</p>
						{/each}
					{/if}
				</div>

				<div class="space-y-1.5">
					<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
						{t('sheet.usedIn')}
					</p>
					{#if detail?.chats.length}
						{#each detail.chats as chat (chat.id)}
							<p class="truncate text-xs">{chat.title}</p>
						{/each}
					{:else}
						<p class="text-muted-foreground text-xs">{t('sheet.noChats')}</p>
					{/if}
				</div>

				<Separator />

				<div class="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={live.status !== 'ready'}
						onclick={() => {
							viewerStore.openDocument(live);
							onclose();
						}}
					>
						{t('sheet.open')}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={live.status !== 'ready'}
						onclick={() => documentsStore.reindex(live.id)}
					>
						{t('sheet.reindex')}
					</Button>
					<Button variant="outline" size="sm" onclick={() => replaceInput?.click()}>
						{t('sheet.replaceFile')}
					</Button>
				</div>
				<input
					bind:this={replaceInput}
					type="file"
					accept=".pdf,.docx,.md,.markdown,.txt"
					class="hidden"
					onchange={(e) => {
						// Copy before resetting: input.files is live.
						const files = Array.from(e.currentTarget.files ?? []);
						e.currentTarget.value = '';
						handleReplace(files);
					}}
				/>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

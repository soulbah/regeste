<script lang="ts">
	// The document detail, shown in the documents page's right contextual panel
	// (replacing the old right Sheet drawer). Structure follows a facts-first
	// detail-pane recipe: recognition facts in the header, the privacy/egress
	// statement first (the one bordered block, so the eye lands there), then the
	// mechanical facts, reciprocal "used in" provenance, and pinned actions with
	// an isolated delete. Same data as the old sheet (documentDetail + the live
	// library row); the layout is what changed.
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import PanelHeader from '$lib/components/panel-header.svelte';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import MessagesSquareIcon from '@lucide/svelte/icons/messages-square';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ReplaceIcon from '@lucide/svelte/icons/replace';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { t } from '$lib/i18n/index.svelte';
	import { getLocalDb } from '$lib/local-db/client';
	import type { DocumentDetail } from '$lib/local-db/worker';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import type { LibraryDocument } from '$lib/types';

	let {
		document: doc,
		onhide,
		onrequestdelete
	}: {
		document: LibraryDocument | null;
		onhide: () => void;
		onrequestdelete: (doc: LibraryDocument) => void;
	} = $props();

	let detail = $state<DocumentDetail | null>(null);
	let replaceInput = $state<HTMLInputElement | null>(null);
	let showAllEgress = $state(false);

	$effect(() => {
		detail = null;
		showAllEgress = false;
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

	function docType(name: string): string {
		const dot = name.lastIndexOf('.');
		return dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
	}

	// The header subtitle carries the recognition facts (type · pages · size), so
	// the body can open straight on the privacy statement.
	const subtitle = $derived.by(() => {
		if (!live) return '';
		const parts = [docType(live.name)];
		if (live.pages) parts.push(t('common.pages', { n: live.pages }));
		parts.push(fmtBytes(live.size));
		return parts.join(' · ');
	});

	const visibleEgress = $derived(
		detail && (showAllEgress ? detail.egress : detail.egress.slice(0, 3))
	);

	async function copyFingerprint() {
		if (!live) return;
		await navigator.clipboard.writeText(live.hash);
		toast.success(t('sheet.copied'));
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
			toast.success(t('sheet.replaced'), { description: t('sheet.replacedDesc') });
		}
	}
</script>

{#if live}
	<div class="flex h-full flex-col">
		<PanelHeader title={live.name} {subtitle} {onhide} />

		<div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
			<!-- The differentiator, elevated to the first block: the one bordered box
			     on the surface, so the eye lands on the privacy state. -->
			<div class="space-y-1.5 rounded-lg border p-3">
				<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
					{t('sheet.privacy')}
				</p>
				{#if detail === null}
					<p class="text-muted-foreground text-xs">{t('sheet.loading')}</p>
				{:else if detail.egress.length === 0}
					<div class="flex items-center gap-2 text-sm">
						<ShieldCheckIcon class="text-muted-foreground size-4 shrink-0" />
						{t('sheet.neverSent')}
					</div>
				{:else}
					<p class="text-sm">
						{t('sheet.sentCount', {
							count: detail.egress.length,
							s: detail.egress.length === 1 ? '' : 's'
						})}
					</p>
					{#each visibleEgress ?? [] as e, i (i)}
						<div class="flex items-center gap-2 text-xs">
							<span class="bg-mode-assisted size-1.5 shrink-0 rounded-full"></span>
							<span>
								{t('sheet.egressLine', {
									date: new Date(e.createdAt).toLocaleDateString(),
									dest: e.destination
								})}
							</span>
						</div>
					{/each}
					{#if detail.egress.length > 3}
						<Button
							variant="ghost"
							size="xs"
							class="text-muted-foreground -ml-2"
							onclick={() => (showAllEgress = !showAllEgress)}
						>
							{showAllEgress
								? t('sheet.seeLess')
								: t('sheet.seeAll', { count: detail.egress.length })}
						</Button>
					{/if}
				{/if}
			</div>

			<!-- The checkable facts, ordered by how often they're asked. -->
			<div class="space-y-2">
				<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
					{t('sheet.details')}
				</p>
				<div class="grid grid-cols-2 items-center gap-x-4 gap-y-2 text-sm">
					<span class="text-muted-foreground">{t('sheet.size')}</span>
					<span>{fmtBytes(live.size)}</span>
					{#if live.pages}
						<span class="text-muted-foreground">{t('sheet.pages')}</span>
						<span>{live.pages}</span>
					{/if}
					{#if live.language}
						<span class="text-muted-foreground">{t('sheet.language')}</span>
						<span>{live.language.toUpperCase()}</span>
					{/if}
					<span class="text-muted-foreground">{t('sheet.indexed')}</span>
					<span>{new Date(live.updatedAt).toLocaleString()}</span>
					<span class="text-muted-foreground">{t('sheet.model')}</span>
					<span class="truncate font-mono text-xs">{live.embeddingModel ?? '—'}</span>
					<span class="text-muted-foreground">{t('sheet.fingerprint')}</span>
					<Button
						variant="ghost"
						size="xs"
						class="group/fp -my-1 h-auto justify-start gap-1.5 px-0 hover:bg-transparent"
						onclick={copyFingerprint}
						aria-label={t('sheet.copyAria')}
					>
						<span class="bg-muted/60 rounded-md px-1.5 py-0.5 font-mono text-xs">
							{live.hash.slice(0, 16)}…
						</span>
						<CopyIcon
							class="text-muted-foreground size-3 opacity-0 transition-opacity group-hover/fp:opacity-100"
						/>
					</Button>
					{#if detail?.versionCount}
						<span class="text-muted-foreground">{t('sheet.replacedLabel')}</span>
						<span>{t('sheet.times', { count: detail.versionCount, s: '' })}</span>
					{/if}
				</div>
				{#if ingest && live.status !== 'ready' && live.status !== 'error'}
					<Badge variant="secondary" class="text-[10px] uppercase">{live.status}…</Badge>
				{/if}
			</div>

			<!-- Reciprocal provenance: which chats draw on this document. -->
			<div class="space-y-1.5">
				<p class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
					{#if detail?.chats.length}
						{t('sheet.usedInCount', {
							count: detail.chats.length,
							s: detail.chats.length === 1 ? '' : 's'
						})}
					{:else}
						{t('sheet.usedIn')}
					{/if}
				</p>
				{#if detail?.chats.length}
					{#each detail.chats as chat (chat.id)}
						<Button
							variant="ghost"
							size="sm"
							class="h-auto w-full justify-start gap-2 px-2 py-1.5 text-xs font-normal"
							onclick={() => goto(resolve(`/chat/${chat.id}`))}
							aria-label={t('sheet.openChatAria', { title: chat.title })}
						>
							<MessagesSquareIcon class="text-muted-foreground size-3.5 shrink-0" />
							<span class="truncate">{chat.title}</span>
						</Button>
					{/each}
				{:else if live.status !== 'ready'}
					<p class="text-muted-foreground text-xs">{t('sheet.stillIndexing')}</p>
				{:else}
					<p class="text-muted-foreground text-xs">{t('sheet.noChats')}</p>
				{/if}
			</div>
		</div>

		<!-- Safe actions pinned at the foot; the destructive one isolated below a
		     divider so it is never a mis-tap. -->
		<div class="space-y-2 border-t p-3">
			<Tooltip.Root>
				<Tooltip.Trigger class="block w-full">
					{#snippet child({ props })}
						<Button
							{...props}
							class="w-full gap-2"
							disabled={live.status !== 'ready'}
							onclick={() => {
								viewerStore.openDocument(live);
							}}
						>
							<EyeIcon class="size-4" />
							{t('sheet.open')}
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				{#if live.status !== 'ready'}
					<Tooltip.Content side="top">{t('disabled.indexing')}</Tooltip.Content>
				{/if}
			</Tooltip.Root>
			{#if documentsStore.needsReindex(live.id)}
				<p class="text-muted-foreground text-xs">{t('sheet.reindexRecommended')}</p>
			{/if}
			<div class="grid grid-cols-2 gap-2">
				<Tooltip.Root>
					<Tooltip.Trigger class="block w-full">
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								class="w-full gap-2"
								disabled={live.status !== 'ready'}
								onclick={() => documentsStore.reindex(live.id)}
							>
								<RefreshCwIcon class="size-4" />
								{documentsStore.needsReindex(live.id)
									? t('sheet.improveSearch')
									: t('sheet.reindex')}
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					{#if live.status !== 'ready'}
						<Tooltip.Content side="top">{t('disabled.indexing')}</Tooltip.Content>
					{/if}
				</Tooltip.Root>
				<Button variant="outline" class="w-full gap-2" onclick={() => replaceInput?.click()}>
					<ReplaceIcon class="size-4" />
					{t('sheet.replaceFile')}
				</Button>
			</div>
			<Separator class="my-1" />
			<Button
				variant="outline"
				class="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive w-full gap-2"
				onclick={() => onrequestdelete(live)}
			>
				<Trash2Icon class="size-4" />
				{t('docsPage.deleteFromDevice')}
			</Button>
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
	</div>
{/if}

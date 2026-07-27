<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Progress } from '$lib/components/ui/progress';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import SquareIcon from '@lucide/svelte/icons/square';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import ModeSelector from './mode-selector.svelte';
	import AddDocuments from './add-documents.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { documentStatusKey } from '$lib/document-status';
	import { ingestReadiness } from '$lib/ingest-readiness';
	import { settingsStore } from '$lib/state/settings.svelte';
	import CloudModelPicker from './cloud-model-picker.svelte';
	import type { ChatMode } from '$lib/types';

	let {
		mode,
		disabled = false,
		onsend,
		onmodeselect,
		onupload,
		onattach,
		libraryEmpty,
		myaiModel = null,
		privateOnly = false,
		hasReadyDocs = false,
		generating = false,
		onstop = null,
		followUp = false,
		quote = null,
		onquoteused = null,
		attachedIds = []
	}: {
		/** null = never chosen on this device (spec 022 onboarding). */
		mode: ChatMode | null;
		disabled?: boolean;
		onsend: (text: string) => void;
		onmodeselect: (mode: ChatMode) => void;
		onupload: (files: File[]) => void;
		onattach: (documentIds: string[]) => void;
		libraryEmpty: boolean;
		myaiModel?: string | null;
		privateOnly?: boolean;
		/** R3 — preset actions only make sense with something to act on. */
		hasReadyDocs?: boolean;
		/** While true the send button becomes Stop (same spot, spec 019). */
		generating?: boolean;
		onstop?: (() => void) | null;
		/** After the first exchange the placeholder invites a follow-up. */
		followUp?: boolean;
		/** Spec 020 — quote-reply: a selection arrives as a markdown quote. */
		quote?: string | null;
		onquoteused?: (() => void) | null;
		attachedIds?: string[];
	} = $props();

	let text = $state('');
	let textareaRef = $state<HTMLTextAreaElement | null>(null);
	let showedPreparing = $state(false);
	let readyNotice = $state(false);
	let readyNoticeTimer: ReturnType<typeof setTimeout> | null = null;

	const attachedIngest = $derived(
		attachedIds
			.map((id) => {
				const document = documentsStore.documents.find((item) => item.id === id);
				if (!document) return null;
				const ingest = documentsStore.ingests[id];
				return {
					name: document.name,
					status: ingest?.status ?? document.status,
					phaseProgress: ingest?.phaseProgress ?? (document.status === 'ready' ? 1 : 0)
				};
			})
			.filter((item) => item !== null)
	);
	const readiness = $derived(ingestReadiness(attachedIngest));
	const sendBlocked = $derived(disabled || readiness.blocking);

	$effect(() => {
		if (readiness.preparingCount > 0) {
			showedPreparing = true;
			readyNotice = false;
			if (readyNoticeTimer) clearTimeout(readyNoticeTimer);
			return;
		}
		if (!showedPreparing || readiness.readyCount === 0) return;
		showedPreparing = false;
		readyNotice = true;
		readyNoticeTimer = setTimeout(() => (readyNotice = false), 3000);
	});

	$effect(() => {
		if (!quote) return;
		const quoted = quote
			.split('\n')
			.map((l) => `> ${l}`)
			.join('\n');
		text = text ? `${quoted}\n\n${text}` : `${quoted}\n\n`;
		textareaRef?.focus();
		onquoteused?.();
	});

	function submit() {
		const trimmed = text.trim();
		if (!trimmed || sendBlocked || mode === null) return;
		text = '';
		onsend(trimmed);
	}

	// `#` inline picker (FEATURES: picker trombone + # inline).
	const hashMatch = $derived(/(^|\s)#([\p{L}\p{N} _.-]*)$/u.exec(text));
	const hashSuggestions = $derived.by(() => {
		if (!hashMatch) return [];
		const q = hashMatch[2].toLowerCase();
		return documentsStore.library
			.filter((d) => d.status === 'ready' && d.name.toLowerCase().includes(q))
			.slice(0, 5);
	});

	function pickHash(docId: string) {
		onattach([docId]);
		text = text.replace(/(^|\s)#([\p{L}\p{N} _.-]*)$/u, '$1').trimEnd();
	}
</script>

<div class="bg-card relative mx-auto w-full max-w-3xl rounded-[18px] border p-3 shadow-sm">
	{#if readiness.preparingCount > 0}
		<div class="border-border -mx-3 -mt-3 mb-3 border-b px-3 py-2.5" aria-live="polite">
			<div class="flex items-start gap-2.5">
				<LoaderCircleIcon
					class="text-muted-foreground mt-0.5 size-4 shrink-0 motion-safe:animate-spin"
				/>
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs font-medium">
						{readiness.preparingCount === 1
							? t('composer.preparingOne', {
									name:
										attachedIngest.find(
											(item) => item.status !== 'ready' && item.status !== 'error'
										)?.name ?? ''
								})
							: t('composer.preparingMany', { count: readiness.preparingCount })}
					</p>
					<p class="text-muted-foreground mt-0.5 text-[11px]">
						{readiness.readyCount > 0
							? t('composer.preparingAvailable', { count: readiness.readyCount })
							: t('composer.preparingStep', {
									phase: readiness.status ? t(documentStatusKey(readiness.status)) : '',
									step: readiness.step
								})}
					</p>
					<Progress value={readiness.progress} class="mt-2 h-1" />
				</div>
			</div>
		</div>
	{:else if readyNotice}
		<div
			class="border-border -mx-3 -mt-3 mb-3 flex items-center gap-2 border-b px-3 py-2.5"
			aria-live="polite"
		>
			<CircleCheckIcon class="text-ring size-4" />
			<p class="text-xs font-medium">{t('composer.documentsReady')}</p>
		</div>
	{/if}
	{#if hashSuggestions.length}
		<div
			class="bg-popover absolute -top-2 right-3 left-3 z-10 -translate-y-full rounded-md border p-1 shadow-md"
		>
			<p class="text-muted-foreground px-2 py-1 text-xs font-medium">
				{t('composer.attachFrom')}
			</p>
			{#each hashSuggestions as doc (doc.id)}
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-start gap-2 text-xs"
					onclick={() => pickHash(doc.id)}
				>
					<FileTextIcon class="size-3.5" />
					<span class="truncate">{doc.name}</span>
				</Button>
			{/each}
		</div>
	{/if}
	<!-- Always editable: you can draft the next question while a document
	     indexes or an answer streams. Sending is what's gated (the button and
	     the Enter handler), not typing. -->
	<Textarea
		bind:value={text}
		bind:ref={textareaRef}
		placeholder={t(
			readiness.blocking
				? 'composer.waitPlaceholder'
				: followUp
					? 'composer.followUp'
					: 'composer.placeholder'
		)}
		class="max-h-40 min-h-8 resize-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0"
		onkeydown={(e) => {
			// When sending is gated, Enter falls through to a normal newline so a
			// draft can still be composed; it only submits when a send is allowed.
			if (e.key === 'Enter' && !e.shiftKey && !sendBlocked) {
				e.preventDefault();
				submit();
			}
		}}
		onpaste={(e) => {
			// C7 — pasting a file attaches it like the paperclip.
			const files = Array.from(e.clipboardData?.files ?? []);
			if (files.length) {
				e.preventDefault();
				onupload(files);
			}
		}}
	/>
	<div class="mt-1 flex items-center gap-1">
		<AddDocuments
			{libraryEmpty}
			{onupload}
			{onattach}
			{hasReadyDocs}
			{disabled}
			{attachedIds}
			onaction={(q) => !sendBlocked && mode !== null && onsend(q)}
		/>
		<ModeSelector {mode} onselect={onmodeselect} {myaiModel} {privateOnly} />
		<!-- Only in Cloud mode: the other two run on hardware the user already
		     pays for, so there is no budget to spend and nothing to choose. -->
		{#if mode === 'assisted'}
			<CloudModelPicker
				value={settingsStore.cloudModel}
				onselect={(key) => settingsStore.setCloudModel(key)}
			/>
		{/if}
		<div class="flex-1"></div>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					{#if generating && onstop}
						<Button
							{...props}
							size="icon"
							class="bg-ring hover:bg-ring/90 text-background rounded-md"
							onclick={onstop}
							aria-label={t('chat.stop')}
						>
							<SquareIcon class="size-3.5 fill-current" />
						</Button>
					{:else}
						<Button
							{...props}
							size="icon"
							class="bg-ring hover:bg-ring/90 text-background rounded-md disabled:opacity-40"
							onclick={submit}
							disabled={sendBlocked || !text.trim() || mode === null}
							aria-label={t('composer.sendAria')}
						>
							<ArrowUpIcon class="size-4" />
						</Button>
					{/if}
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top">
				{generating && onstop
					? t('chat.stopTip')
					: readiness.blocking
						? t('disabled.indexingChat')
						: mode === null
							? t('disabled.chooseMode')
							: !text.trim()
								? t('disabled.emptyMessage')
								: t('composer.sendTip')}
			</Tooltip.Content>
		</Tooltip.Root>
	</div>
</div>
<div
	class="text-muted-foreground mx-auto mt-2 flex w-full max-w-3xl items-center justify-between px-3 font-mono text-[10px]"
>
	<span>{t('composer.footer')}</span>
	<span class="hidden sm:inline">{t('composer.enterHint')}</span>
</div>

<script lang="ts">
	// Before the gigabytes, not after them.
	//
	// It used to open whenever navigator.storage.persist() said no, and that fired
	// for nearly everyone: Chromium decides persistence from how often you have
	// visited a site, not from how much room you have. So an ordinary first visit
	// was told the download "would very likely fail partway" and it then succeeded.
	// The gate is now the one measurement that speaks to the question — free bytes
	// against the size of the file — so when this opens it is arithmetic rather
	// than a prediction, and it can print both numbers.
	//
	// It stays a dialog because it has to be read before an action worth minutes
	// and gigabytes, and it stays dismissible because the numbers can be wrong in
	// the reader's favour and the decision is theirs.
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import { guidesHref } from '$lib/marketing-links.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { NEW_TAB } from '$lib/external-page';

	const open = $derived(llmStore.storageRisk);
	const size = $derived(llmStore.tier?.downloadLabel ?? '');
	const free = $derived.by(() => {
		const bytes = llmStore.storageFreeBytes;
		if (bytes === null) return '';
		const gb = bytes / 1_000_000_000;
		// Under a gigabyte the number in GB rounds to something that reads as zero,
		// and "0.3 GB" is harder to place than "280 MB".
		return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
	});
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next) llmStore.storageRisk = false;
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2.5">
				<HardDriveIcon class="text-muted-foreground size-4" />
				{t('storageRisk.title')}
			</Dialog.Title>
			<Dialog.Description>{t('storageRisk.body', { size, free })}</Dialog.Description>
		</Dialog.Header>

		<p class="text-sm leading-relaxed">{t('storageRisk.reason')}</p>

		<p class="text-muted-foreground text-sm leading-relaxed">{t('storageRisk.alternative')}</p>

		<Dialog.Footer class="sm:justify-between">
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground"
				href={guidesHref('model-storage')}
				{...NEW_TAB}
			>
				{t('app.whatToDo')}
			</Button>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => (llmStore.storageRisk = false)}>
					{t('common.cancel')}
				</Button>
				<!-- Their call, once they have read it. -->
				<Button
					onclick={() => {
						llmStore.storageRisk = false;
						void llmStore.prepare({ force: true });
					}}
				>
					{t('storageRisk.anyway')}
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

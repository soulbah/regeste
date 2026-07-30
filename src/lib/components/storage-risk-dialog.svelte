<script lang="ts">
	// Before the gigabytes, not after them.
	//
	// The download used to start regardless and fail partway: 23% of one model,
	// then 46% of a smaller one after an automatic retry, every byte crossing the
	// deployment's own proxy. The person was left with a console error and no idea
	// that the window they chose was the reason.
	//
	// It is a dialog rather than an inline line because it has to be read before an
	// action worth minutes and gigabytes, and dismissible because the decision is
	// theirs: someone who understands the trade can still proceed.
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import { resolve } from '$app/paths';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { NEW_TAB } from '$lib/external-page';

	const open = $derived(llmStore.storageRisk);
	const size = $derived(llmStore.tier?.downloadLabel ?? '');
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next) llmStore.storageRisk = false;
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2.5">
				<HardDriveIcon class="text-muted-foreground size-4" />
				{t('storageRisk.title')}
			</Dialog.Title>
			<Dialog.Description>{t('storageRisk.body', { size })}</Dialog.Description>
		</Dialog.Header>

		<ul class="space-y-2.5 text-sm leading-relaxed">
			<li class="flex gap-2.5">
				<span class="text-muted-foreground mt-px font-mono text-[11px]">01</span>
				<span class="flex-1">{t('storageRisk.reason1')}</span>
			</li>
			<li class="flex gap-2.5">
				<span class="text-muted-foreground mt-px font-mono text-[11px]">02</span>
				<span class="flex-1">{t('storageRisk.reason2')}</span>
			</li>
		</ul>

		<p class="text-muted-foreground text-sm leading-relaxed">{t('storageRisk.alternative')}</p>

		<Dialog.Footer class="sm:justify-between">
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground"
				href={resolve('/(marketing)/help/[[topic]]', { topic: 'model-storage' })}
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

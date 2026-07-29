<script lang="ts">
	// The chat header, extracted verbatim from the chat page so the capture
	// stage photographs the real thing (title, document count, the egress pill)
	// instead of an invented titlebar. One source, two surfaces, no drift.
	import { resolve } from '$app/paths';
	import PanelRightIcon from '@lucide/svelte/icons/panel-right';
	import { Button } from '$lib/components/ui/button';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { t } from '$lib/i18n/index.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';

	let {
		panelOpen,
		ontogglepanel = null,
		/** The capture stage has no sidebar provider; the trigger needs one. */
		sidebarTrigger = true
	}: {
		panelOpen: boolean;
		ontogglepanel?: (() => void) | null;
		sidebarTrigger?: boolean;
	} = $props();
</script>

<header class="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
	<div class="flex min-w-0 items-center gap-1">
		{#if sidebarTrigger}
			<Sidebar.Trigger class="shrink-0 md:hidden" />
		{/if}
		<div class="min-w-0 px-1">
			<h1 class="font-display truncate text-base leading-tight tracking-tight">
				{chatsStore.activeChat?.title ?? t('chat.fallback')}
			</h1>
			<p class="text-muted-foreground truncate text-[11px] leading-tight">
				{t('chat.docCount', {
					count: chatsStore.chatDocuments.length,
					s: chatsStore.chatDocuments.length === 1 ? '' : 's'
				})}
			</p>
		</div>
	</div>
	<div class="flex shrink-0 items-center gap-2">
		<a
			href={resolve('/chat/privacy')}
			class="focus-visible:ring-ring rounded-full focus-visible:ring-2"
		>
			{#if chatsStore.chatEgress && chatsStore.chatEgress.cloudRequests > 0}
				<span
					class="bg-mode-assisted/15 text-mode-assisted flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px]"
				>
					<span class="bg-mode-assisted size-1.5 rounded-full"></span>
					{t('chat.cloudRequests', {
						count: chatsStore.chatEgress.cloudRequests,
						s: chatsStore.chatEgress.cloudRequests === 1 ? '' : 's',
						kb: (chatsStore.chatEgress.bytes / 1024).toFixed(1)
					})}
				</span>
			{:else}
				<span
					class="text-muted-foreground bg-muted flex items-center rounded-full px-2.5 py-1 font-mono text-[11px]"
				>
					{t('chat.zeroBytes')}
				</span>
			{/if}
		</a>
		<!-- Opens only: once the panel shows, its own ✕ is the sole close control
		     (standard pattern), so the opener disappears instead of flipping icon. -->
		{#if !panelOpen && ontogglepanel}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label={t('chat.panelToggleAria')}
							onclick={ontogglepanel}
						>
							<PanelRightIcon />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="bottom">{t('chat.panelTip.show')}</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</div>
</header>

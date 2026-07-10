<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import NavUser from '$lib/components/nav-user.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PinOffIcon from '@lucide/svelte/icons/pin-off';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import FileIcon from '@lucide/svelte/icons/file';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/index.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { searchStore } from '$lib/state/search.svelte';
	import type { LocalChat } from '$lib/types';

	let renameTarget = $state<LocalChat | null>(null);
	let renameValue = $state('');
	let deleteTarget = $state<LocalChat | null>(null);

	async function confirmRename() {
		if (!renameTarget) return;
		await chatsStore.rename(renameTarget.id, renameValue);
		renameTarget = null;
	}

	const groups = $derived.by(() => {
		const now = Date.now();
		const day = 24 * 60 * 60 * 1000;
		const pinned: LocalChat[] = [];
		const today: LocalChat[] = [];
		const yesterday: LocalChat[] = [];
		const previous: LocalChat[] = [];
		for (const chat of chatsStore.chats) {
			if (chat.pinned) {
				pinned.push(chat);
				continue;
			}
			const age = now - chat.updatedAt;
			if (age < day) today.push(chat);
			else if (age < 2 * day) yesterday.push(chat);
			else previous.push(chat);
		}
		return [
			{ label: t('sidebar.pinned'), chats: pinned },
			{ label: t('sidebar.today'), chats: today },
			{ label: t('sidebar.yesterday'), chats: yesterday },
			{ label: t('sidebar.previous'), chats: previous }
		].filter((g) => g.chats.length);
	});

	/** C4 — download the chat as Markdown. */
	async function exportChat(chat: LocalChat) {
		const md = await chatsStore.exportMarkdown(chat.id);
		const blob = new Blob([md], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${chat.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'chat'}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		const wasActive = page.url.pathname.includes(deleteTarget.id);
		await chatsStore.remove(deleteTarget.id);
		deleteTarget = null;
		if (wasActive) goto(resolve('/chat'));
	}
</script>

<Sidebar.Root variant="inset" collapsible="icon">
	<!-- Fixed top zone (market convention): brand + primary actions never scroll;
	     only the history below does. -->
	<Sidebar.Header>
		<!-- Expanded: logo left, collapse trigger right. Collapsed rail: the logo
		     holds the slot and the trigger takes its place on hover (ChatGPT). -->
		<div class="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
			<a
				href={resolve('/chat')}
				class="flex min-w-0 items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:hidden"
			>
				<FileIcon class="size-4 shrink-0" />
				<span class="font-display text-lg tracking-tight">Folio</span>
			</a>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Sidebar.Trigger
							{...props}
							class="text-sidebar-foreground/70 shrink-0 group-data-[collapsible=icon]:hidden"
						/>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="right">{t('sidebar.collapseTip')}</Tooltip.Content>
			</Tooltip.Root>
			<div class="group/logo relative hidden size-8 group-data-[collapsible=icon]:block">
				<span
					class="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity group-hover/logo:opacity-0"
				>
					<FileIcon class="size-4" />
				</span>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Sidebar.Trigger
								{...props}
								class="text-sidebar-foreground/70 absolute inset-0 opacity-0 transition-opacity group-hover/logo:opacity-100"
							/>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="right">{t('sidebar.expandTip')}</Tooltip.Content>
				</Tooltip.Root>
			</div>
		</div>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent={t('sidebar.newChat')}>
					{#snippet child({ props })}
						<a href={resolve('/chat')} {...props}>
							<PlusIcon /> <span>{t('sidebar.newChat')}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					tooltipContent={`${t('sidebar.search')} · ⌘K`}
					onclick={() => searchStore.toggle()}
				>
					<SearchIcon />
					<span>{t('sidebar.search')}</span>
					<span class="text-muted-foreground ml-auto font-mono text-[10px]">⌘K</span>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					tooltipContent={t('sidebar.documents')}
					isActive={page.url.pathname === '/chat/documents'}
				>
					{#snippet child({ props })}
						<a href={resolve('/chat/documents')} {...props}>
							<FolderIcon /> <span>{t('sidebar.documents')}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		{#each groups as group (group.label)}
			<Sidebar.Group class="group-data-[collapsible=icon]:hidden">
				<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each group.chats as chat (chat.id)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={page.url.pathname.includes(chat.id)}>
									{#snippet child({ props })}
										<a href={resolve(`/chat/${chat.id}`)} {...props}>
											<span class="truncate">{chat.title}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props: menuProps })}
											<Tooltip.Root>
												<Tooltip.Trigger>
													{#snippet child({ props: tipProps })}
														<Sidebar.MenuAction
															{...mergeProps(menuProps, tipProps)}
															showOnHover
															aria-label={t('sidebar.chatOptionsAria')}
														>
															<EllipsisIcon />
														</Sidebar.MenuAction>
													{/snippet}
												</Tooltip.Trigger>
												<Tooltip.Content side="right">
													{t('sidebar.chatOptionsAria')}
												</Tooltip.Content>
											</Tooltip.Root>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content side="right" align="start">
										<DropdownMenu.Item onclick={() => chatsStore.setPinned(chat.id, !chat.pinned)}>
											{#if chat.pinned}<PinOffIcon class="text-muted-foreground" />{:else}<PinIcon
													class="text-muted-foreground"
												/>{/if}
											{chat.pinned ? t('sidebar.unpin') : t('sidebar.pin')}
										</DropdownMenu.Item>
										<DropdownMenu.Item
											onclick={() => {
												renameValue = chat.title;
												renameTarget = chat;
											}}
										>
											<PencilIcon class="text-muted-foreground" />
											{t('sidebar.rename')}
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => exportChat(chat)}>
											<DownloadIcon class="text-muted-foreground" />
											{t('sidebar.exportMarkdown')}
										</DropdownMenu.Item>
										<DropdownMenu.Item variant="destructive" onclick={() => (deleteTarget = chat)}>
											<Trash2Icon />
											{t('common.delete')}
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser />
	</Sidebar.Footer>
	<Sidebar.ResizeHandle aria-label={t('sidebar.resizeAria')} />
</Sidebar.Root>

<Dialog.Root open={renameTarget !== null} onOpenChange={(o) => !o && (renameTarget = null)}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>{t('sidebar.renameTitle')}</Dialog.Title>
		</Dialog.Header>
		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				confirmRename();
			}}
		>
			<Input bind:value={renameValue} aria-label={t('sidebar.chatTitleAria')} />
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (renameTarget = null)}>
					{t('common.cancel')}
				</Button>
				<Button type="submit">{t('common.save')}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={deleteTarget !== null} onOpenChange={(o) => !o && (deleteTarget = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{t('sidebar.deleteTitle')}</AlertDialog.Title>
			<AlertDialog.Description>
				{t('sidebar.deleteDescription', { title: deleteTarget?.title ?? '' })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{t('common.cancel')}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirmDelete}>{t('common.delete')}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

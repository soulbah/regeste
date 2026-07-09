<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import FileIcon from '@lucide/svelte/icons/file';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { searchStore } from '$lib/state/search.svelte';
	import { sessionStore } from '$lib/state/session.svelte';
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
			{ label: 'Pinned', chats: pinned },
			{ label: 'Today', chats: today },
			{ label: 'Yesterday', chats: yesterday },
			{ label: 'Previous', chats: previous }
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
		if (wasActive) goto(resolve('/'));
	}
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<a href={resolve('/')} class="flex items-center gap-2 px-2 py-1.5">
			<FileIcon class="size-4" />
			<span class="font-display text-lg tracking-tight">Folio</span>
		</a>
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href={resolve('/')} {...props}>
									<PlusIcon /> <span>New chat</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={page.url.pathname === '/documents'}>
							{#snippet child({ props })}
								<a href={resolve('/documents')} {...props}>
									<FolderIcon /> <span>Documents</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton onclick={() => searchStore.toggle()}>
							<SearchIcon />
							<span>Search</span>
							<span class="text-muted-foreground ml-auto font-mono text-[10px]">⌘K</span>
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={page.url.pathname === '/privacy'}>
							{#snippet child({ props })}
								<a href={resolve('/privacy')} {...props}>
									<ShieldIcon /> <span>Privacy Report</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={page.url.pathname === '/settings'}>
							{#snippet child({ props })}
								<a href={resolve('/settings')} {...props}>
									<SettingsIcon /> <span>Settings</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>

		{#each groups as group (group.label)}
			<Sidebar.Group>
				<Sidebar.GroupLabel class="font-mono text-[10px] tracking-widest uppercase">
					{group.label}
				</Sidebar.GroupLabel>
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
										{#snippet child({ props })}
											<Sidebar.MenuAction {...props} showOnHover>
												<EllipsisIcon />
											</Sidebar.MenuAction>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content side="right" align="start">
										<DropdownMenu.Item onclick={() => chatsStore.setPinned(chat.id, !chat.pinned)}>
											{chat.pinned ? 'Unpin' : 'Pin'}
										</DropdownMenu.Item>
										<DropdownMenu.Item
											onclick={() => {
												renameValue = chat.title;
												renameTarget = chat;
											}}
										>
											Rename
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => exportChat(chat)}>
											Export as Markdown
										</DropdownMenu.Item>
										<DropdownMenu.Item
											class="text-destructive"
											onclick={() => (deleteTarget = chat)}
										>
											Delete
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
		<a
			href={resolve('/account')}
			class="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5"
		>
			<span class="bg-muted flex size-7 items-center justify-center rounded-full text-xs uppercase">
				{sessionStore.user ? sessionStore.user.email[0] : 'G'}
			</span>
			<div class="min-w-0">
				<p class="truncate text-sm font-medium">
					{sessionStore.user ? sessionStore.user.name || sessionStore.user.email : 'Guest'}
				</p>
				<p class="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
					{sessionStore.user ? 'Signed in · files stay local' : 'Local workspace'}
				</p>
			</div>
		</a>
	</Sidebar.Footer>
</Sidebar.Root>

<Dialog.Root open={renameTarget !== null} onOpenChange={(o) => !o && (renameTarget = null)}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Rename chat</Dialog.Title>
		</Dialog.Header>
		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				confirmRename();
			}}
		>
			<Input bind:value={renameValue} aria-label="Chat title" />
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (renameTarget = null)}>
					Cancel
				</Button>
				<Button type="submit">Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={deleteTarget !== null} onOpenChange={(o) => !o && (deleteTarget = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this chat?</AlertDialog.Title>
			<AlertDialog.Description>
				"{deleteTarget?.title}" and its messages will be permanently removed from this device.
				Documents stay in your library.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirmDelete}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<script lang="ts">
	// Account element at the bottom of the sidebar (spec 021): avatar + identity
	// + chevrons trigger, dropdown with quick settings (the Claude recipe),
	// Privacy Report, How it works, Settings (modal) and sign in/out.
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CheckIcon from '@lucide/svelte/icons/check';
	import SunMoonIcon from '@lucide/svelte/icons/sun-moon';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import { sessionStore } from '$lib/state/session.svelte';
	import { uiStore } from '$lib/state/ui.svelte';

	const themeChoices = [
		{ mode: 'light', label: 'settings.appearance.light' },
		{ mode: 'dark', label: 'settings.appearance.dark' },
		{ mode: 'system', label: 'settings.appearance.system' }
	] as const;

	// Sign-in is by email and nothing else, so most accounts have no name and the
	// two lines printed the same address twice. When there is nothing to add
	// under the address, the second line stays empty rather than echoing it.
	const identity = $derived(
		sessionStore.user
			? {
					name: sessionStore.user.name || sessionStore.user.email,
					line: sessionStore.user.name ? sessionStore.user.email : null
				}
			: { name: t('sidebar.guest'), line: t('sidebar.localWorkspace') }
	);

	async function signOut() {
		await sessionStore.signOut();
		await sessionStore.refresh();
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						{...props}
						size="lg"
						class="data-open:bg-foreground/7 group-data-[collapsible=icon]:p-0!"
					>
						<span
							class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-xs uppercase"
						>
							{identity.name[0]}
						</span>
						<span class="grid min-w-0 flex-1 leading-tight">
							<span class="truncate text-sm font-medium">{identity.name}</span>
							{#if identity.line}<span class="text-muted-foreground truncate text-xs"
									>{identity.line}</span
								>{/if}
						</span>
						<ChevronsUpDownIcon class="text-muted-foreground ml-auto size-4" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content side="top" align="start" class="w-60">
				<!-- Signed out there is no identity worth repeating: skip the header. -->
				{#if sessionStore.user}
					<DropdownMenu.Label class="font-normal">
						<span class="grid leading-tight">
							<span class="truncate text-sm font-medium">{identity.name}</span>
							{#if identity.line}<span class="text-muted-foreground truncate text-xs"
									>{identity.line}</span
								>{/if}
						</span>
					</DropdownMenu.Label>
					<DropdownMenu.Separator />
				{/if}
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger>
						<SunMoonIcon class="text-muted-foreground" />
						{t('settings.appearance.title')}
					</DropdownMenu.SubTrigger>
					<DropdownMenu.SubContent class="w-40">
						{#each themeChoices as { mode, label } (mode)}
							<DropdownMenu.Item onclick={() => setMode(mode)}>
								{t(label)}
								{#if userPrefersMode.current === mode}
									<CheckIcon class="text-ring ml-auto" />
								{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger>
						<LanguagesIcon class="text-muted-foreground" />
						{t('menu.language')}
					</DropdownMenu.SubTrigger>
					<DropdownMenu.SubContent class="w-40">
						<DropdownMenu.Item onclick={() => i18n.setLocale('en')}>
							English
							{#if i18n.locale === 'en'}<CheckIcon class="text-ring ml-auto" />{/if}
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => i18n.setLocale('fr')}>
							Français
							{#if i18n.locale === 'fr'}<CheckIcon class="text-ring ml-auto" />{/if}
						</DropdownMenu.Item>
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={() => goto(resolve('/chat/privacy'))}>
					<ShieldIcon class="text-muted-foreground" />
					{t('sidebar.privacyReport')}
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => goto(resolve('/how-it-works'))}>
					<CircleHelpIcon class="text-muted-foreground" />
					{t('hiw.title')}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={() => uiStore.openSettings()}>
					<SettingsIcon class="text-muted-foreground" />
					{t('settings.title')}
				</DropdownMenu.Item>
				{#if sessionStore.user}
					<DropdownMenu.Item onclick={signOut}>
						<LogOutIcon class="text-muted-foreground" />
						{t('account.signOut')}
					</DropdownMenu.Item>
				{:else}
					<DropdownMenu.Item onclick={() => goto(resolve('/auth'))}>
						<LogInIcon class="text-muted-foreground" />
						{t('menu.signIn')}
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>

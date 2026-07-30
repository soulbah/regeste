<script lang="ts">
	// The application chrome: sidebar, command palette, settings modal, viewer
	// sheet.
	//
	// It used to live in the root layout, which meant every route in the project
	// inherited it, sign-in included. A sign-in screen with the app's sidebar
	// behind it offers a dozen things you cannot do until you finish signing in,
	// so the chrome moved down here into a route group. The group's parentheses
	// keep it out of the URL: /chat is still /chat.
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import CommandPalette from '$lib/components/command-palette.svelte';
	import SettingsDialog from '$lib/components/settings-dialog.svelte';
	import ViewerPanel from '$lib/components/viewer-panel.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import { panelStore } from '$lib/state/panel.svelte';
	import StorageRiskDialog from '$lib/components/storage-risk-dialog.svelte';
	import { registerAdvisories } from '$lib/state/register-advisories.svelte';

	let { children } = $props();

	registerAdvisories();
</script>

<CommandPalette />
<SettingsDialog />

<Sheet.Root
	open={viewerStore.isOpen && !panelStore.usingShell}
	onOpenChange={(o) => !o && viewerStore.close()}
>
	<Sheet.Content side="right" class="w-full gap-0 p-0 sm:max-w-md">
		<!-- This sheet portals outside Sidebar.Provider (the app's Tooltip
		     provider); the panel header's tooltips need their own. -->
		<Tooltip.Provider delayDuration={300}>
			<ViewerPanel />
		</Tooltip.Provider>
	</Sheet.Content>
</Sheet.Root>

<Sidebar.Provider>
	<AppSidebar />
	<!-- When a route mounts a PanelShell (chat, documents…), the inset stops being
	     a card and becomes a transparent frame: the main content and the contextual
	     panel float as their own cards on the workspace. Other routes keep the card. -->
	<Sidebar.Inset
		class={panelStore.usingShell
			? 'md:overflow-visible md:bg-transparent md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:border-0 md:peer-data-[variant=inset]:shadow-none'
			: undefined}
	>
		{@render children()}
	</Sidebar.Inset>
</Sidebar.Provider>

<StorageRiskDialog />

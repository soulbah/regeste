<script lang="ts">
	// The app's contextual-panel shell (extracted from the chat, spec 019). Owns
	// the whole mechanism so every route reuses ONE panel: a resizable, collapsible
	// right pane ≥1024px (a floating card beside the main card), a right Sheet
	// below that. Routes pass their main content and panel content as snippets and
	// drive visibility through `open`; the "why" (what summons/clears the panel)
	// stays in the route.
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import * as Resizable from '$lib/components/ui/resizable';
	import * as Sheet from '$lib/components/ui/sheet';
	import { panelStore } from '$lib/state/panel.svelte';

	let {
		open = $bindable(false),
		onOpenChange,
		main,
		panel,
		mainMinSize = 35,
		autoSaveId = 'regeste-panes'
	}: {
		open?: boolean;
		/** Fired when the user closes it (drag-collapse or Sheet dismiss). */
		onOpenChange?: (open: boolean) => void;
		main: Snippet;
		panel: Snippet;
		mainMinSize?: number;
		autoSaveId?: string;
	} = $props();

	const lgViewport = new MediaQuery('(min-width: 1024px)');
	const PANEL_DEFAULT_SIZE = 30;
	// Start collapsed when the route opens closed — avoids a one-frame flash of an
	// open panel before the effect below collapses it.
	const initialPanelSize = open ? PANEL_DEFAULT_SIZE : 0;

	let panelPane = $state<{
		collapse: () => void;
		expand: () => void;
		resize: (size: number) => void;
		isCollapsed: () => boolean;
	} | null>(null);

	// paneforge restores its persisted layout on mount and fires onCollapse/onExpand
	// while doing so. That restore must not drive `open` — a stale "expanded" entry
	// would otherwise open the panel with nothing to show. Accept pane events only
	// after we've reconciled the restored pane to `open` below.
	let mounted = $state(false);

	// Tell the layout to drop its inset card so the two panes float as cards.
	$effect(() => {
		panelStore.usingShell = true;
		return () => {
			panelStore.usingShell = false;
		};
	});

	// Reflect `open` into the pane (only acts on a real mismatch, so the
	// onCollapse/onExpand round-trip can't loop).
	$effect(() => {
		if (!lgViewport.current || !panelPane) return;
		if (open && panelPane.isCollapsed()) panelPane.expand();
		else if (!open && !panelPane.isCollapsed()) panelPane.collapse();
	});

	// After paneforge has restored (child mounts run before this), force the pane
	// to match `open`, discarding any persisted open/closed state; width is kept.
	onMount(() => {
		if (lgViewport.current && panelPane) {
			if (open && panelPane.isCollapsed()) panelPane.expand();
			else if (!open && !panelPane.isCollapsed()) panelPane.collapse();
		}
		mounted = true;
	});

	function setOpen(o: boolean) {
		if (o === open) return;
		open = o;
		onOpenChange?.(o);
	}
</script>

<Resizable.PaneGroup direction="horizontal" class="h-full" {autoSaveId}>
	<Resizable.Pane
		defaultSize={100 - initialPanelSize}
		minSize={mainMinSize}
		class="bg-background overflow-hidden md:rounded-xl md:border md:shadow-sm"
	>
		{@render main()}
	</Resizable.Pane>
	<!-- Transparent gutter, same width as the workspace frame; hidden when closed. -->
	<Resizable.Handle
		withHandle
		class={open ? 'hidden w-2 bg-transparent lg:flex' : 'hidden'}
		ondblclick={() => panelPane?.resize(PANEL_DEFAULT_SIZE)}
	/>
	<Resizable.Pane
		bind:this={panelPane}
		defaultSize={initialPanelSize}
		minSize={22}
		maxSize={50}
		collapsible
		collapsedSize={0}
		onCollapse={() => mounted && setOpen(false)}
		onExpand={() => mounted && setOpen(true)}
		class={[
			'bg-card hidden overflow-hidden rounded-xl lg:block',
			// Collapsed, the pane is 0-wide; the border would leave a 2px sliver.
			open && 'border shadow-sm'
		]}
	>
		{@render panel()}
	</Resizable.Pane>
</Resizable.PaneGroup>

<!-- Below 1024px the panel rides a right Sheet over the main content. -->
{#if !lgViewport.current}
	<Sheet.Root {open} onOpenChange={(o) => setOpen(o)}>
		<Sheet.Content
			side="right"
			class="w-full gap-0 p-0 sm:max-w-md [&>[data-slot=sheet-close]]:hidden"
		>
			{@render panel()}
		</Sheet.Content>
	</Sheet.Root>
{/if}

<script lang="ts">
	// Drag-to-resize edge for the desktop sidebar (owned adaptation, Notion/Linear
	// pattern): an invisible strip on the outer edge; hovering paints a guide line,
	// dragging turns it green and suspends width transitions (data-resizing on the
	// wrapper). Double-click restores the default width. Hidden on mobile and in
	// the collapsed icon rail. Render it as a direct child of Sidebar.Root.
	import { cn } from '$lib/utils.js';
	import { useSidebar } from './context.svelte.js';

	let { 'aria-label': ariaLabel = 'Resize sidebar' }: { 'aria-label'?: string } = $props();

	const sidebar = useSidebar();
	let startX = 0;
	let startWidth = 0;

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0) return;
		startX = e.clientX;
		startWidth = sidebar.width;
		sidebar.resizing = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onpointermove(e: PointerEvent) {
		if (!sidebar.resizing) return;
		sidebar.setWidth(startWidth + (e.clientX - startX));
	}

	function endDrag() {
		if (!sidebar.resizing) return;
		sidebar.resizing = false;
		sidebar.persistWidth();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		sidebar.setWidth(sidebar.width + (e.key === 'ArrowLeft' ? -16 : 16));
		sidebar.persistWidth();
	}
</script>

{#if !sidebar.isMobile}
	<div
		data-slot="sidebar-resize-handle"
		data-resizing={sidebar.resizing ? '' : undefined}
		role="separator"
		aria-orientation="vertical"
		aria-label={ariaLabel}
		tabindex={0}
		{onpointerdown}
		{onpointermove}
		onpointerup={endDrag}
		onpointercancel={endDrag}
		ondblclick={() => sidebar.resetWidth()}
		{onkeydown}
		class={cn(
			'absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize touch-none select-none sm:block',
			'group-data-[collapsible=icon]:hidden group-data-[collapsible=offcanvas]:hidden',
			'after:absolute after:inset-y-0 after:right-[3px] after:w-0.5 after:rounded-full after:bg-transparent after:transition-colors after:delay-75',
			'hover:after:bg-border data-resizing:after:bg-ring data-resizing:after:delay-0',
			'focus-visible:outline-none focus-visible:after:bg-ring'
		)}
	></div>
{/if}

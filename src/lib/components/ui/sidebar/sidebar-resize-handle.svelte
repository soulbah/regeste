<script lang="ts">
	// Drag-to-resize edge for the desktop sidebar (owned adaptation, Notion/Linear
	// pattern): an invisible strip on the outer edge; hovering paints a guide line,
	// dragging turns it green and suspends width transitions (data-resizing on the
	// wrapper). Double-click restores the default width. Hidden on mobile and in
	// the collapsed icon rail. Render it as a direct child of Sidebar.Root.
	import { cn } from '$lib/utils.js';
	import { SIDEBAR_WIDTH_MAX_PX, SIDEBAR_WIDTH_MIN_PX } from './constants.js';
	import { useSidebar } from './context.svelte.js';

	let { 'aria-label': ariaLabel = 'Resize sidebar' }: { 'aria-label'?: string } = $props();

	const sidebar = useSidebar();

	// Splitter cursor standard, mirroring paneforge so both edges feel identical:
	// col-resize at rest/hover; while dragging the move cursor, degrading to the
	// one-way arrow at a bound to say which direction is still available.
	const cursorClass = $derived(
		!sidebar.resizing
			? 'cursor-col-resize'
			: sidebar.width <= SIDEBAR_WIDTH_MIN_PX
				? 'cursor-e-resize'
				: sidebar.width >= SIDEBAR_WIDTH_MAX_PX
					? 'cursor-w-resize'
					: 'cursor-ew-resize'
	);
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
	<!-- A focusable separator with keyboard support is the ARIA window-splitter
	     pattern; the a11y rules below don't know it. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
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
			'group/resize absolute inset-y-0 -right-1 z-20 hidden w-2 touch-none select-none sm:block',
			cursorClass,
			'group-data-[collapsible=icon]:hidden group-data-[collapsible=offcanvas]:hidden',
			'focus-visible:outline-none'
		)}
	>
		<!-- Grab pill (claude.ai pattern), shared language with the pane handle:
		     the pill alone carries the affordance, the zone border stays quiet. -->
		<div
			class="bg-muted-foreground/60 absolute top-1/2 left-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity delay-75 group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100 group-data-[resizing]/resize:bg-ring group-data-[resizing]/resize:opacity-100"
		></div>
	</div>
{/if}

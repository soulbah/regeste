<script lang="ts">
	import * as ResizablePrimitive from 'paneforge';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		withHandle = false,
		...restProps
	}: WithoutChildrenOrChild<ResizablePrimitive.PaneResizerProps> & {
		withHandle?: boolean;
	} = $props();
</script>

<ResizablePrimitive.PaneResizer
	bind:ref
	data-slot="resizable-handle"
	class={cn(
		'cn-resizable-handle bg-border focus-visible:ring-ring group/handle relative flex w-px items-center justify-center [&:not([data-active])]:cursor-col-resize! after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[direction=vertical]:h-px data-[direction=vertical]:w-full data-[direction=vertical]:after:left-0 data-[direction=vertical]:after:h-2 data-[direction=vertical]:after:w-full data-[direction=vertical]:after:translate-x-0 data-[direction=vertical]:after:-translate-y-1/2 [&[data-direction=vertical]>div]:rotate-90',
		className
	)}
	{...restProps}
>
	{#if withHandle}
		<!-- Grab pill (claude.ai pattern): hover affordance that says "drag me",
		     green while dragging. Same language as the sidebar resize handle;
		     the pane border itself stays quiet. -->
		<div
			class="bg-muted-foreground/60 group-hover/handle:opacity-100 group-data-[active=keyboard]/handle:bg-ring group-data-[active=keyboard]/handle:opacity-100 group-data-[active=pointer]/handle:bg-ring group-data-[active=pointer]/handle:opacity-100 z-10 flex h-16 w-1 shrink-0 rounded-full opacity-0 transition-opacity delay-75"
		></div>
	{/if}
</ResizablePrimitive.PaneResizer>

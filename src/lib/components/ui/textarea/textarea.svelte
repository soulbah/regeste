<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		'data-slot': dataSlot = 'textarea',
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		// text-base under md, and under any coarse pointer: iOS Safari zooms the
		// page when a field smaller than 16px takes focus, and the breakpoint
		// alone left tablets (>=768px, touch) zooming on every tap.
		'border-input focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-2 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 resize-none rounded-md border bg-transparent px-3 py-2 text-base transition-[color,border-color] md:text-sm pointer-coarse:text-base placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	bind:value
	{...restProps}></textarea>

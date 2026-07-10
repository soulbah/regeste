<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="sidebar-footer"
	data-sidebar="footer"
	class={cn(
		'gap-2 px-1.5 py-2 flex flex-col group-data-[collapsible=icon]:items-center',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

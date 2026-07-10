<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = 'default',
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { size?: 'default' | 'sm' } = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	data-size={size}
	class={cn(
		'bg-card text-card-foreground ring-foreground/5 gap-(--card-spacing) overflow-hidden py-(--card-spacing) text-sm shadow-sm ring-1 [--card-spacing:--spacing(8)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(5)] *:[img:first-child]:rounded-lg *:[img:last-child]:rounded-lg group/card flex flex-col',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

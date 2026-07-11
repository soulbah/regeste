<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<span
	bind:this={ref}
	aria-hidden="true"
	data-slot="pagination-ellipsis"
	class={cn('text-muted-foreground flex size-8 items-center justify-center', className)}
	{...restProps}
>
	<EllipsisIcon class="size-4" />
</span>

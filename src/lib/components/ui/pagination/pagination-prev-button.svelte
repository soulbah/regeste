<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: PaginationPrimitive.PrevButtonProps = $props();
</script>

<PaginationPrimitive.PrevButton
	bind:ref
	data-slot="pagination-prev"
	class={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), className)}
	{...restProps}
>
	{#if children}
		{@render children()}
	{:else}
		<ChevronLeftIcon />
	{/if}
</PaginationPrimitive.PrevButton>

<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: PaginationPrimitive.NextButtonProps = $props();
</script>

<PaginationPrimitive.NextButton
	bind:ref
	data-slot="pagination-next"
	class={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), className)}
	{...restProps}
>
	{#if children}
		{@render children()}
	{:else}
		<ChevronRightIcon />
	{/if}
</PaginationPrimitive.NextButton>

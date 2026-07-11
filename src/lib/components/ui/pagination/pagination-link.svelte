<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';
	import { buttonVariants, type ButtonSize } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		size = 'icon',
		isActive = false,
		page,
		children,
		...restProps
	}: PaginationPrimitive.PageProps & {
		isActive?: boolean;
		size?: ButtonSize;
	} = $props();
</script>

<PaginationPrimitive.Page
	bind:ref
	{page}
	data-slot="pagination-link"
	data-active={isActive}
	class={cn(buttonVariants({ variant: isActive ? 'outline' : 'ghost', size }), className)}
	{...restProps}
>
	{#if children}
		{@render children()}
	{:else}
		{page.value}
	{/if}
</PaginationPrimitive.Page>

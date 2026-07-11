<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		page = $bindable(1),
		...restProps
	}: PaginationPrimitive.RootProps = $props();
</script>

<PaginationPrimitive.Root
	bind:ref
	bind:page
	data-slot="pagination"
	class={cn('mx-auto flex w-full flex-col items-center', className)}
	{...restProps}
/>

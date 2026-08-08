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
		// pb sits above the home indicator on a notched phone (the sidebar is a
		// full-height sheet there). env() resolves to 0px everywhere else, so the
		// desktop rail keeps its exact py-2.
		'gap-2 px-1.5 py-2 pb-[max(--spacing(2),env(safe-area-inset-bottom))] flex flex-col group-data-[collapsible=icon]:items-center',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

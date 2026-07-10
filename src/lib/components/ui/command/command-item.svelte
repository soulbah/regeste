<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import CheckIcon from '@lucide/svelte/icons/check';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPrimitive.ItemProps = $props();
</script>

<CommandPrimitive.Item
	bind:ref
	data-slot="command-item"
	class={cn(
		"group/command-item data-selected:bg-foreground/7 data-selected:text-foreground data-selected:*:[svg]:text-foreground data-selected:before:bg-ring relative flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm outline-hidden select-none data-selected:before:absolute data-selected:before:top-1/2 data-selected:before:left-0 data-selected:before:h-5 data-selected:before:w-[3px] data-selected:before:-translate-y-1/2 data-selected:before:rounded-full data-selected:before:content-[''] data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<CheckIcon
		class="cn-command-item-indicator ml-auto opacity-0 group-has-[[data-slot=command-shortcut]]/command-item:hidden group-data-[checked=true]/command-item:opacity-100"
	/>
</CommandPrimitive.Item>

<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import AlertDialogPortal from './alert-dialog-portal.svelte';
	import AlertDialogOverlay from './alert-dialog-overlay.svelte';
	import { cn, type WithoutChild, type WithoutChildrenOrChild } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		size = 'default',
		portalProps,
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		size?: 'default' | 'sm';
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
	} = $props();
</script>

<AlertDialogPortal {...portalProps}>
	<AlertDialogOverlay />
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		data-size={size}
		class={cn(
			// Matched to dialog-content, which grew for the same reason: these carry the
			// sentences someone has to read before an irreversible answer, and 448px
			// wrapped them into a column. `sm` stays narrow — it is the size asked for
			// when the question really is one line.
			'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 bg-popover text-popover-foreground ring-foreground/10 gap-7 rounded-lg p-7 shadow-md ring-1 duration-100 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 outline-none',
			className
		)}
		{...restProps}
	/>
</AlertDialogPortal>

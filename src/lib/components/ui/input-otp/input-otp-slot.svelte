<script lang="ts">
	import { PinInput as InputOTPPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		cell,
		class: className,
		...restProps
	}: InputOTPPrimitive.CellProps = $props();
</script>

<InputOTPPrimitive.Cell
	{cell}
	bind:ref
	data-slot="input-otp-slot"
	class={cn(
		'border-b-input data-[active=true]:border-b-ring aria-invalid:border-b-destructive dark:aria-invalid:border-b-destructive/50 size-10 border border-transparent bg-transparent text-sm transition-[color,border-color] outline-none first:rounded-none last:rounded-none relative flex items-center justify-center data-[active=true]:z-10',
		className
	)}
	{...restProps}
>
	{cell.char}
	{#if cell.hasFakeCaret}
		<div
			class="cn-input-otp-caret pointer-events-none absolute inset-0 flex items-center justify-center"
		>
			<div
				class="animate-caret-blink bg-foreground h-4 w-px duration-1000 bg-foreground h-4 w-px"
			></div>
		</div>
	{/if}
</InputOTPPrimitive.Cell>

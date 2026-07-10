<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<kbd
	class="border-border bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border px-1 font-mono text-[11px]"
>
	{@render children()}
</kbd>

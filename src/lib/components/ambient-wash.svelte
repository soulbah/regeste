<script lang="ts">
	// A single soft wash of the brand accent, sitting behind a screen that would
	// otherwise be flat charcoal.
	//
	// It exists on the screens that are mostly empty by design — the sign-in
	// page, the engine choice, the first run — where a plain dark rectangle
	// reads as an error state rather than as a considered one. Everywhere else
	// there is content to carry the page and this would just be haze.
	//
	// One wash, never two. Low opacity and a very large blur so it is felt more
	// than seen: at this size the eye reads it as the page having a light
	// source, not as a coloured shape.
	let {
		/** Vertical placement as a percentage of the container. */
		top = '-18%',
		size = '42rem'
	}: { top?: string; size?: string } = $props();
</script>

<div
	aria-hidden="true"
	class="bg-accent-foreground/12 pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full blur-[140px]"
	style="top: {top}; width: {size}; height: {size}"
></div>

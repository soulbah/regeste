<script lang="ts">
	// A single soft wash of the brand accent, sitting behind a screen that would
	// otherwise be flat charcoal.
	//
	// It exists on the screens that are mostly empty by design — the sign-in
	// page, the engine choice, the first run — where a plain dark rectangle
	// reads as an error state rather than as a considered one. Everywhere else
	// there is content to carry the page and this would just be haze.
	//
	// One wash, never two, and only on those screens: the reference pages that
	// carry real content (how it works, the guides) were tried with it and it
	// read as haze over the text, which is the opposite of sober.
	//
	// Low opacity and a very large blur so it is felt more than seen: at this
	// size the eye should read it as the page having a light source, not as a
	// coloured shape.
	//
	// How strong depends on how empty the screen is, which is why it is a prop and
	// not one constant. Sign-in is a single field on an otherwise bare page and
	// carries the full wash. The chat's first run already has a dropzone and a
	// composer holding the composition, and there the same value read as a glow
	// rather than as a light source.
	//
	// Two literal classes rather than an interpolated opacity: Tailwind's scanner
	// reads source text, so a computed `bg-accent-foreground/${n}` would simply
	// not be generated.
	let {
		/** Vertical placement as a percentage of the container. */
		top = '-18%',
		size = '42rem',
		strength = 'full'
	}: { top?: string; size?: string; strength?: 'full' | 'quiet' } = $props();
</script>

<div
	aria-hidden="true"
	class="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full blur-[170px] {strength ===
	'quiet'
		? 'bg-accent-foreground/5'
		: 'bg-accent-foreground/10'}"
	style="top: {top}; width: {size}; height: {size}"
></div>

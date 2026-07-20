<script lang="ts">
	// Render LLM markdown safely. marked's LEXER only (a pure tokeniser, emits no
	// HTML); the token walker renders through Svelte text interpolation, so
	// nothing from the model — including an untrusted My AI endpoint — ever
	// becomes raw markup. marked.parse()/{@html} are never used.
	import { marked } from 'marked';
	import Tokens from './tokens.svelte';
	import { neutralizeMarkers } from './marker';
	import type { CitationRow } from '$lib/local-db/worker';

	let {
		source,
		variant = 'answer',
		citations = null
	}: {
		source: string;
		variant?: 'answer' | 'notes';
		citations?: CitationRow[] | null;
	} = $props();

	// Neutralise citation markers before lexing (see marker.ts), then parse once.
	// breaks:true keeps the single-newline breaks both surfaces showed under
	// whitespace-pre-wrap.
	const tokens = $derived(
		marked.lexer(neutralizeMarkers(source ?? ''), { gfm: true, breaks: true })
	);
</script>

<div class={variant === 'notes' ? 'prose-notes' : 'prose-answer'}>
	<Tokens {tokens} {citations} />
</div>

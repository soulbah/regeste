<script lang="ts">
	// Recursive markdown token walker. Every content field goes through Svelte's
	// text interpolation {…}, which escapes < and &, so untrusted model output
	// (a My AI endpoint) can never inject markup — no {@html} anywhere. Unknown
	// or deliberately unrendered tokens (raw html, images, tables) fall to the
	// escaped-text catch-all, so safety is structural, not a fixed enumeration.
	import Self from './tokens.svelte';
	import CitationChip from '$lib/components/citation-chip.svelte';
	import { restoreMarkers, sentinelPattern } from './marker';
	import type { Token } from 'marked';
	import type { CitationRow } from '$lib/local-db/worker';

	let { tokens, citations = null }: { tokens: Token[]; citations?: CitationRow[] | null } =
		$props();

	// A leaf text run, split into text and citation chips on the neutralised
	// markers. Without citations (draft notes), the sentinels become literal [n].
	function parts(text: string): Array<{ t: string } | { n: number }> {
		if (!citations?.length) return [{ t: restoreMarkers(text) }];
		const out: Array<{ t: string } | { n: number }> = [];
		let last = 0;
		for (const m of text.matchAll(sentinelPattern())) {
			if (m.index > last) out.push({ t: text.slice(last, m.index) });
			out.push({ n: Number(m[1]) });
			last = m.index + m[0].length;
		}
		if (last < text.length) out.push({ t: text.slice(last) });
		return out;
	}
</script>

{#each tokens as tok, i (i)}
	{#if tok.type === 'paragraph'}
		<p><Self tokens={tok.tokens ?? []} {citations} /></p>
	{:else if tok.type === 'heading'}
		<p class="md-h"><Self tokens={tok.tokens ?? []} {citations} /></p>
	{:else if tok.type === 'list'}
		{#if tok.ordered}
			<ol start={typeof tok.start === 'number' ? tok.start : 1}>
				{#each tok.items as it, j (j)}<li><Self tokens={it.tokens ?? []} {citations} /></li>{/each}
			</ol>
		{:else}
			<ul>
				{#each tok.items as it, j (j)}<li><Self tokens={it.tokens ?? []} {citations} /></li>{/each}
			</ul>
		{/if}
	{:else if tok.type === 'code'}
		<pre><code>{restoreMarkers(tok.text)}</code></pre>
	{:else if tok.type === 'blockquote'}
		<blockquote><Self tokens={tok.tokens ?? []} {citations} /></blockquote>
	{:else if tok.type === 'hr'}
		<hr />
	{:else if tok.type === 'strong'}
		<strong><Self tokens={tok.tokens ?? []} {citations} /></strong>
	{:else if tok.type === 'em'}
		<em><Self tokens={tok.tokens ?? []} {citations} /></em>
	{:else if tok.type === 'del'}
		<del><Self tokens={tok.tokens ?? []} {citations} /></del>
	{:else if tok.type === 'codespan'}
		<code>{restoreMarkers(tok.text)}</code>
	{:else if tok.type === 'br'}
		<br />
	{:else if tok.type === 'link'}
		<!-- untrusted: render the label as text, never an anchor/href -->
		<Self tokens={tok.tokens ?? []} {citations} />
	{:else if tok.type === 'text'}
		{#if 'tokens' in tok && tok.tokens}<Self
				tokens={tok.tokens}
				{citations}
			/>{:else}{#each parts(tok.text) as p, k (k)}{#if 'n' in p}<CitationChip
						n={p.n}
						citations={citations ?? []}
					/>{:else}{p.t}{/if}{/each}{/if}
	{:else if tok.type === 'escape'}
		{#each parts(tok.text) as p, k (k)}{#if 'n' in p}<CitationChip
					n={p.n}
					citations={citations ?? []}
				/>{:else}{p.t}{/if}{/each}
	{:else}
		<!-- html, image, table, def, space: escaped text, never raw HTML -->
		{restoreMarkers('raw' in tok ? tok.raw : '')}
	{/if}
{/each}

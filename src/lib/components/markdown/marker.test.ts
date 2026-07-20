import { describe, it, expect } from 'vitest';
import { marked } from 'marked';
import { neutralizeMarkers, restoreMarkers } from './marker';

describe('citation marker neutralisation', () => {
	it('round-trips [n] through neutralise/restore', () => {
		const source = 'See [1] and [12], but keep arr[1] literal.';
		expect(restoreMarkers(neutralizeMarkers(source))).toBe(source);
	});

	// The bug this exists for: a trailing "[1]: source" line is read by marked as
	// a link reference definition, which turns the body [1] into a link (no chip)
	// and drops the definition line from output. Neutralising first prevents it.
	it('stops a trailing [n]: line from becoming a link reference definition', () => {
		const poison = 'Cats sleep [1].\n\n[1]: report.pdf';
		expect(marked.lexer(poison).some((t) => t.type === 'def')).toBe(true);
		expect(marked.lexer(neutralizeMarkers(poison)).some((t) => t.type === 'def')).toBe(false);
	});

	// [1](url) makes marked absorb the marker into a link, so the chip is lost.
	// After neutralisation no link carries the marker, and it survives as
	// recoverable text. (The bare URL still autolinks under GFM; the walker
	// renders that as a text-only label with the href dropped.)
	it('stops [n](url) from absorbing the marker into a link', () => {
		const inline = marked
			.lexer('Total [1](https://x.example) end', { gfm: true })
			.flatMap((t) => ('tokens' in t && t.tokens ? t.tokens : []));
		expect(inline.some((t) => t.type === 'link')).toBe(true);

		const neutralised = marked
			.lexer(neutralizeMarkers('Total [1](https://x.example) end'), { gfm: true })
			.flatMap((t) => ('tokens' in t && t.tokens ? t.tokens : []));
		expect(
			neutralised.some(
				(t) => t.type === 'link' && 'text' in t && restoreMarkers(t.text).includes('1')
			)
		).toBe(false);
		expect(restoreMarkers(neutralised.map((t) => t.raw).join(''))).toContain('[1]');
	});

	it('leaves the marker recoverable inside a bold span', () => {
		const [para] = marked.lexer(neutralizeMarkers('The **amount [1]** here'), { gfm: true });
		const strong = ('tokens' in para ? (para.tokens ?? []) : []).find((t) => t.type === 'strong');
		expect(strong && 'text' in strong && restoreMarkers(strong.text)).toBe('amount [1]');
	});
});

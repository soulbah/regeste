// Citation markers [1]..[99] must survive markdown tokenising untouched. Left
// as literal brackets, marked reads a trailing `[1]: source.pdf` line as a link
// reference definition — the body's [1] then becomes a link (losing its chip)
// and the definition line is dropped from output entirely (verified on
// marked@18). Neutralising the markers to private-use codepoints before the
// lexer runs removes every markdown meaning they could carry; the walker splits
// on the sentinels afterwards, on leaf text only, so a [1] inside a list item or
// a bold span never disturbs the surrounding block. Private-use codepoints so
// nothing a document or a model could legitimately emit collides with them.

const OPEN = '\u{E000}';
const CLOSE = '\u{E001}';

/** Rewrite every [n] to a sentinel pair before lexing. */
export function neutralizeMarkers(source: string): string {
	return source.replace(/\[(\d{1,2})\]/g, (_, n) => `${OPEN}${n}${CLOSE}`);
}

/** Turn a sentinel pair back into the literal [n] — for code spans and blocks,
 * where a citation is never a chip, and for any surface with no citations. */
export function restoreMarkers(text: string): string {
	return text.replace(sentinelPattern(), (_, n) => `[${n}]`);
}

/** A fresh matcher each call: a global regex carries lastIndex, and sharing one
 * across the walker's many leaves would skip matches. */
export function sentinelPattern(): RegExp {
	return new RegExp(`${OPEN}(\\d{1,2})${CLOSE}`, 'g');
}

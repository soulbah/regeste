// Only French takes a path prefix. English lives at the root, because that URL
// existed first and because a redirect from / to /en costs every visitor a round
// trip for nothing.
//
// Restricting the matcher to the one value is what keeps /how-it-works from being
// read as a language segment.
export function match(param: string): boolean {
	return param === 'fr';
}

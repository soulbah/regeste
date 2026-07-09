// C8/C9 (spec 010): question suggestions derived from section headings —
// zero LLM, zero network, honest about their origin (the document structure).

/** Last segment of a ' > '-joined heading path, trimmed for display. */
function leaf(headingPath: string): string {
	const parts = headingPath.split(' > ');
	return parts[parts.length - 1].trim();
}

export function suggestionsFromHeadings(
	headingPaths: string[],
	exclude: string[] = [],
	max = 3
): string[] {
	const excluded = new Set(exclude.map((e) => e.toLowerCase()));
	const seen = new Set<string>();
	const out: string[] = [];
	for (const path of headingPaths) {
		const section = leaf(path);
		if (!section || section.length > 80) continue;
		const key = section.toLowerCase();
		if (seen.has(key) || excluded.has(key)) continue;
		seen.add(key);
		out.push(`What does “${section}” say?`);
		if (out.length >= max) break;
	}
	return out;
}

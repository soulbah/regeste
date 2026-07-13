const LIGATURES: Record<string, string> = { œ: 'oe', Œ: 'oe', æ: 'ae', Æ: 'ae' };

/** Retrieval-only normalization. Source text and citation offsets are never changed. */
export function normalizeForFuzzy(text: string): string {
	return text
		.replace(/[œŒæÆ]/g, (char) => LIGATURES[char])
		.replace(/\u00ad/g, '')
		.replace(/([\p{L}\p{N}])-\s*\n\s*([\p{L}\p{N}])/gu, '$1$2')
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[’‘`´]/g, "'")
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

export function characterGrams(text: string, size = 3, limit = 768): string[] {
	const normalized = normalizeForFuzzy(text);
	const variants = [...normalized.split(' '), normalized.replaceAll(' ', '')].filter(Boolean);
	const grams = new Set<string>();
	for (const variant of variants) {
		const padded = `^${variant}$`;
		if (padded.length <= size) grams.add(padded);
		else for (let i = 0; i <= padded.length - size; i++) grams.add(padded.slice(i, i + size));
		if (grams.size >= limit) break;
	}
	return [...grams].slice(0, limit);
}

/** Space-delimited grams are indexed by a dedicated FTS5 table. */
export function fuzzyIndexText(text: string): string {
	// A 1,000-character chunk plus structural context can exceed the former
	// 768-gram cap. Truncating that view made late facts (notably table values
	// and RFC fields) impossible to recall after a typo.
	return characterGrams(text, 3, 4096).join(' ');
}

/** Separate heading grams let structural queries prefer title matches over body mentions. */
export function fuzzyHeadingIndexText(text: string): string {
	return characterGrams(text)
		.filter((gram) => /^[\p{L}\p{N}]{3}$/u.test(gram))
		.map((gram) => `h${gram}`)
		.join(' ');
}

/** Keep grams from every significant query token; a global prefix cap would
 * silently drop late discriminators such as a person's name. */
export function fuzzyQueryGrams(text: string, perToken = 6, limit = 96): string[] {
	const tokens = [
		...new Set(
			normalizeForFuzzy(text)
				.split(' ')
				.filter((term) => term.length >= 3)
		)
	];
	const out: string[] = [];
	for (const token of tokens) {
		const grams = characterGrams(token).filter((gram) => gram.length === 3);
		const interior = grams.filter((gram) => !gram.includes('^') && !gram.includes('$'));
		for (const gram of (interior.length ? interior : grams).slice(0, perToken))
			if (!out.includes(gram)) out.push(gram);
	}
	const normal = out.slice(0, limit);
	const structural =
		extractIdentifiers(text).length === 0 &&
		/\b(?:section|sectoin|chapitre|chapter|heading|titre)\b/i.test(normalizeForFuzzy(text))
			? normal.filter((gram) => /^[\p{L}\p{N}]{3}$/u.test(gram)).map((gram) => `h${gram}`)
			: [];
	return [...normal, ...structural];
}

export function extractIdentifiers(text: string): string[] {
	const found = (
		text
			.toUpperCase()
			.match(/\b(?=[A-Z0-9./_-]{3,}\b)(?=[A-Z0-9./_-]*\d)[A-Z0-9]+(?:[./_-][A-Z0-9]+)*\b/g) ?? []
	).filter((value) => /[A-Z]/.test(value) || /[./_-]/.test(value));
	const identifiers = new Set(found);
	for (const value of found) {
		const basename = value.replace(/\.(?:PDF|DOCX?|TXT|MD|MARKDOWN)$/i, '');
		if (basename !== value) identifiers.add(basename);
	}
	return [...identifiers];
}

export function extractAliases(text: string): string[] {
	const aliases = new Set<string>();
	for (const match of text.matchAll(
		/\b([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){1,8})\s*\(([A-Z][A-Z0-9-]{1,10})\)/gu
	)) {
		aliases.add(match[1]);
		aliases.add(match[2]);
	}
	return [...aliases];
}

export function damerauLevenshtein(a: string, b: string, max = 4): number {
	const left = normalizeForFuzzy(a);
	const right = normalizeForFuzzy(b);
	if (Math.abs(left.length - right.length) > max) return max + 1;
	const matrix = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1));
	for (let i = 0; i <= left.length; i++) matrix[i][0] = i;
	for (let j = 0; j <= right.length; j++) matrix[0][j] = j;
	for (let i = 1; i <= left.length; i++) {
		let rowMin = max + 1;
		for (let j = 1; j <= right.length; j++) {
			const cost = left[i - 1] === right[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1,
				matrix[i][j - 1] + 1,
				matrix[i - 1][j - 1] + cost
			);
			if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1])
				matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
			rowMin = Math.min(rowMin, matrix[i][j]);
		}
		if (rowMin > max) return max + 1;
	}
	return matrix[left.length][right.length];
}

/** Fuzzy text may recall a candidate, but a conflicting exact identifier rejects it. */
export function identifierCompatibility(query: string, candidate: string): number {
	const wanted = extractIdentifiers(query);
	if (!wanted.length) return 1;
	const found = new Set(extractIdentifiers(candidate));
	if (wanted.some((id) => found.has(id))) return 1;
	return found.size ? 0 : 0.25;
}

/** Best-token edit similarity used only after broad candidate generation. */
export function fuzzyQueryCoverage(query: string, candidate: string): number {
	const wanted = normalizeForFuzzy(query)
		.split(' ')
		.filter((term) => term.length >= 4);
	const available = normalizeForFuzzy(candidate)
		.split(' ')
		.filter((term) => term.length >= 3);
	if (!wanted.length || !available.length) return 0;
	return (
		wanted.reduce((sum, term) => {
			let best = 0;
			for (const other of available) {
				const distance = damerauLevenshtein(term, other, 2);
				if (distance <= 2)
					best = Math.max(best, 1 - distance / Math.max(term.length, other.length));
				if (best === 1) break;
			}
			return sum + best;
		}, 0) / wanted.length
	);
}

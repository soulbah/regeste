import { eng, fra, removeStopwords } from 'stopword';
import { stemmer as englishStemmer } from '@orama/stemmers/english';
import { stemmer as frenchStemmer } from '@orama/stemmers/french';

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

const RETRIEVAL_STOPWORDS = [
	...new Set([...fra, ...eng].map((word) => normalizeForFuzzy(word)).filter(Boolean))
];

const COVERAGE_CACHE_LIMIT = 4096;
const stemmedCoverageCache = new Map<string, number>();
const phraseCoverageCache = new Map<string, number>();
const fuzzyCoverageCache = new Map<string, number>();

function cachedCoverage(
	cache: Map<string, number>,
	query: string,
	candidate: string,
	compute: () => number
): number {
	const key = `${query}\0${candidate}`;
	const cached = cache.get(key);
	if (cached !== undefined) {
		cache.delete(key);
		cache.set(key, cached);
		return cached;
	}
	const value = compute();
	cache.set(key, value);
	while (cache.size > COVERAGE_CACHE_LIMIT) {
		const oldest = cache.keys().next().value as string | undefined;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
	return value;
}

/** Language-library stopword filtering for sparse retrieval channels. Dense
 * retrieval still receives the untouched question. If everything is filtered,
 * preserve the original tokens so short queries never become empty. */
export function significantQueryTokens(
	text: string,
	minimumLength = 2,
	fallbackToAll = true
): string[] {
	const tokens = normalizeForFuzzy(text)
		.split(' ')
		.filter((token) => token.length >= minimumLength);
	const compoundTokens = new Set(
		(text.match(/[\p{L}\p{N}]+(?:[-‐‑‒–—][\p{L}\p{N}]+)+/gu) ?? [])
			.flatMap((compound) => {
				const parts = normalizeForFuzzy(compound).split(' ');
				return parts.every((part) => part.length >= 3) ? parts : [];
			})
			.filter((token) => token.length >= minimumLength)
	);
	const protectedTokens = new Set([
		...(text.match(/\b[\p{Lu}\d][\p{Lu}\d._/-]{1,}\b/gu) ?? []).map(normalizeForFuzzy),
		...compoundTokens
	]);
	const retained = new Set(removeStopwords(tokens, RETRIEVAL_STOPWORDS));
	const significant = tokens.filter((token) => retained.has(token) || protectedTokens.has(token));
	return significant.length || !fallbackToAll ? significant : tokens;
}

/** Language-agnostic sparse view for the two product languages. Prefixing
 * stems keeps them separate from source words and avoids false exact matches.
 * Both stemmers are applied because document language detection can be wrong
 * on short OCR chunks and a single document may contain both languages. */
export function lexicalStemTokens(text: string): string[] {
	const stems = new Set<string>();
	for (const token of significantQueryTokens(text, 3)) {
		const french = normalizeForFuzzy(frenchStemmer(token));
		const english = normalizeForFuzzy(englishStemmer(token));
		if (french.length >= 3 && french !== token) stems.add(`frstem${french}`);
		if (english.length >= 3 && english !== token) stems.add(`enstem${english}`);
	}
	return [...stems];
}

/** Augment the FTS-only value; displayed source text remains untouched. */
export function lexicalIndexText(text: string): string {
	const stems = lexicalStemTokens(text);
	return stems.length ? `${text}\n${stems.join(' ')}` : text;
}

function tokenForms(token: string): string[] {
	return [
		...new Set([
			token,
			normalizeForFuzzy(frenchStemmer(token)),
			normalizeForFuzzy(englishStemmer(token))
		])
	].filter((form) => form.length >= 3);
}

/** Morphology-tolerant coverage for reranking and citation binding. */
export function stemmedQueryCoverage(query: string, candidate: string): number {
	return cachedCoverage(stemmedCoverageCache, query, candidate, () => {
		const wanted = significantQueryTokens(query, 3);
		const available = new Set(
			significantQueryTokens(candidate, 3).flatMap((token) => tokenForms(token))
		);
		if (!wanted.length || !available.size) return 0;
		return (
			wanted.filter((token) => tokenForms(token).some((form) => available.has(form))).length /
			wanted.length
		);
	});
}

function lexicalBigrams(
	text: string,
	stem: (token: string) => string = (token) => token
): Set<string> {
	const tokens = significantQueryTokens(text, 3).map((token) => normalizeForFuzzy(stem(token)));
	const bigrams = new Set<string>();
	for (let i = 0; i < tokens.length - 1; i++) bigrams.add(`${tokens[i]}:${tokens[i + 1]}`);
	return bigrams;
}

function bigramCoverage(
	query: string,
	candidate: string,
	stem?: (token: string) => string
): number {
	const wanted = lexicalBigrams(query, stem);
	const available = lexicalBigrams(candidate, stem);
	if (!wanted.size || !available.size) return 0;
	let matches = 0;
	for (const bigram of wanted) if (available.has(bigram)) matches++;
	return matches / wanted.size;
}

/** Adjacent concept coverage distinguishes a complete noun phrase from a
 * nearby passage that merely shares generic words (gas vs electricity). */
export function phraseQueryCoverage(query: string, candidate: string): number {
	return cachedCoverage(phraseCoverageCache, query, candidate, () =>
		Math.max(
			bigramCoverage(query, candidate),
			bigramCoverage(query, candidate, frenchStemmer),
			bigramCoverage(query, candidate, englishStemmer)
		)
	);
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
	const tokens = [...new Set(significantQueryTokens(text, 3))];
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

function damerauLevenshteinNormalized(left: string, right: string, max: number): number {
	if (Math.abs(left.length - right.length) > max) return max + 1;
	if (left === right) return 0;
	let previousPrevious = new Int16Array(right.length + 1).fill(max + 1);
	let previous = new Int16Array(right.length + 1);
	let current = new Int16Array(right.length + 1).fill(max + 1);
	for (let j = 0; j <= right.length; j++) previous[j] = j <= max ? j : max + 1;
	for (let i = 1; i <= left.length; i++) {
		current.fill(max + 1);
		if (i <= max) current[0] = i;
		let rowMin = max + 1;
		const start = Math.max(1, i - max);
		const end = Math.min(right.length, i + max);
		for (let j = start; j <= end; j++) {
			const cost = left[i - 1] === right[j - 1] ? 0 : 1;
			current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
			if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1])
				current[j] = Math.min(current[j], previousPrevious[j - 2] + cost);
			rowMin = Math.min(rowMin, current[j]);
		}
		if (rowMin > max) return max + 1;
		const recycled = previousPrevious;
		previousPrevious = previous;
		previous = current;
		current = recycled;
	}
	return previous[right.length] <= max ? previous[right.length] : max + 1;
}

export function damerauLevenshtein(a: string, b: string, max = 4): number {
	return damerauLevenshteinNormalized(normalizeForFuzzy(a), normalizeForFuzzy(b), max);
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
	return cachedCoverage(fuzzyCoverageCache, query, candidate, () => {
		const wanted = normalizeForFuzzy(query)
			.split(' ')
			.filter((term) => term.length >= 4);
		const available = [
			...new Set(
				normalizeForFuzzy(candidate)
					.split(' ')
					.filter((term) => term.length >= 3)
			)
		];
		if (!wanted.length || !available.length) return 0;
		const exact = new Set(available);
		const byLength = new Map<number, string[]>();
		for (const term of available) {
			const bucket = byLength.get(term.length) ?? [];
			bucket.push(term);
			byLength.set(term.length, bucket);
		}
		return (
			wanted.reduce((sum, term) => {
				if (exact.has(term)) return sum + 1;
				let best = 0;
				for (let length = Math.max(3, term.length - 2); length <= term.length + 2; length++) {
					for (const other of byLength.get(length) ?? []) {
						const distance = damerauLevenshteinNormalized(term, other, 2);
						if (distance <= 2)
							best = Math.max(best, 1 - distance / Math.max(term.length, other.length));
					}
				}
				return sum + best;
			}, 0) / wanted.length
		);
	});
}

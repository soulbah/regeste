// Grounded-QA prompt building and citation post-processing. Pure and tested:
// small models hallucinate citations, so markers are validated against the
// retrieved set after generation — an invalid [n] is silently dropped.

import type { SearchHit } from '$lib/types';
import { queryCoverage, splitQueryClauses } from '$lib/pipeline/retrieval';
import { analyzeQuestion } from '$lib/analysis/query-router';
import {
	extractIdentifiers,
	fuzzyQueryCoverage,
	phraseQueryCoverage,
	stemmedQueryCoverage
} from '$lib/pipeline/fuzzy';
import { normalizeQuestion } from '$lib/nlu/semantic-frame';
import { isIdentityQuestion } from '$lib/pipeline/identity-evidence';
import { isContestation } from '$lib/retrieval-context';
import { canonicalNumbers } from '$lib/numbers';

// A genuine directional change: "de 2018 à 2019", not the ubiquitous French
// "de … à …" span (normalizeQuestion folds "à"→"a", which is also the verb).
const STRICT_DIRECTION = /\b(?:de|from)\s+(\d{4})[\s\S]*?\s+(?:a|to)\s+(\d{4})\b/u;

// Leading adverbial framings ("D'après le contrat,", "Selon vous,") and
// interjections ("Non, l'acompte est…", "Oui, et…") are not answerable parts.
// splitQueryClauses would otherwise count them as a part and the multi-part
// contract would make the model recite the user's own words back as an answer.
const LEADING_FRAMING =
	/^(?:d['’ ]?apres|selon|a mon avis|en general|par ailleurs|d['’ ]?ailleurs|non|no|oui|yes|ok|d['’ ]?accord|merci|thanks|bonjour|hello)\b/u;

export const GROUNDED_VERIFICATION_VERSION = 7;
export const MAX_VERIFICATION_EVIDENCE_CHARS = 4800;
const MAX_EVIDENCE_INVENTORY_CHARS = 2600;

/** Clauses a multi-part answer must cover, dropping a leading framing clause. */
function answerableClauses(question: string): string[] {
	// “Who is insured and with whom?” is one identity frame with a companion
	// slot, not two independent facts. Splitting it makes small models invent a
	// second relationship from an unrelated excerpt.
	if (
		isIdentityQuestion(question) &&
		/\b(?:avec qui|with whom)\b/u.test(normalizeQuestion(question))
	)
		return [];
	const clauses = splitQueryClauses(question);
	if (clauses.length > 1 && LEADING_FRAMING.test(normalizeQuestion(clauses[0]))) {
		const rest = clauses.slice(1);
		return rest.length > 1 ? rest : [];
	}
	return clauses;
}

/** Deterministic answer schema derived from the question. The model fills this
 * contract from evidence; it does not decide for itself what "complete" means. */
export function buildAnswerCoverageContract(question: string): string {
	const normalized = normalizeQuestion(question);
	const analysis = analyzeQuestion(question);
	const parts = answerableClauses(question);
	const requirements: string[] = [];
	if (parts.length) {
		requirements.push(
			`Cover every requested slot, combining related facts into natural prose without repeating or labelling the questions:\n${parts.map((part, index) => `${index + 1}. ${part}`).join('\n')}`
		);
	}
	if (
		analysis.operation === 'list' ||
		analysis.exhaustive ||
		/\b(?:droits?|obligations?|options?|rights?|duties)\b/u.test(normalized)
	) {
		requirements.push(
			'List every distinct supported item in the relevant section, including a continued bullet or immediately following subsection.'
		);
	}
	if (
		/\b(?:delai|deadline|prescription|duree|duration|combien de temps|how long)\b/u.test(normalized)
	) {
		requirements.push(
			'For every time value, copy its exact unit and exact starting event/trigger; do not replace it with another date or event.'
		);
	}
	if (analysis.answerShape === 'explanation' || /^(?:comment|how)\b/u.test(normalized)) {
		requirements.push(
			'Include the main rule and its adjacent prerequisites, timing, exceptions, and proof/payment conditions when supported.'
		);
	}
	if (
		/\b(?:coherent|coherence|consistent|difference|ecart|contradiction|compare)\w*\b/u.test(
			normalized
		)
	) {
		requirements.push(
			'Compare both sides item by item, then state an explicit yes/no conclusion consistent with every mismatch found.'
		);
	}
	if (
		/\b(?:couvert|couverte|couverts|couverture|assure|assuree|eligible|covered|coverage|insured|eligible)\b/u.test(
			normalized
		)
	) {
		requirements.push(
			'Apply the clause matching the exact scenario in the question. Keep base cover, exclusions, and optional cover distinct; do not substitute another exclusion.'
		);
	}
	if (/\b(?:nom|name)\b/u.test(normalized)) {
		requirements.push(
			'If the requested name is absent but the evidence gives a related status or condition, report that known status and explicitly say the name is not specified.'
		);
	}
	if (!requirements.length) return '';
	return `Answer coverage contract (all applicable rows are mandatory):\n- ${requirements.join('\n- ')}`;
}

interface EvidenceInventoryItem {
	hit: SearchHit;
	text: string;
	utility: number;
	order: number;
	extraCitations?: SearchHit[];
	/** A short label/value pair recovered from adjacent lines. Exempt from the
	 * containment rule below: it is the answer isolated, and the long run that
	 * happens to contain it is not the same fact stated twice. */
	precise?: boolean;
}

function logicalEvidenceLines(text: string): string[] {
	const lines = text
		.split(/\n+/u)
		.map((line) => line.trim())
		.filter(Boolean);
	const logical: string[] = [];
	let current = '';
	for (const line of lines) {
		const startsItem = /^(?:[-•●✓✗!]\s+|\d+[.)]\s+)/u.test(line);
		if (startsItem && current) {
			logical.push(current);
			current = line;
		} else {
			current = current ? `${current} ${line}` : line;
		}
	}
	if (current) logical.push(current);
	return logical;
}

/** Compact extractive evidence plan. Labels, values, exact scenario sentences,
 * and structural continuations are resolved before free-form generation. */
export function buildEvidenceInventory(
	question: string,
	hits: SearchHit[],
	citationNumbers: ReadonlyMap<number, number> | null = null
): string {
	if (!hits.length) return '';
	const parts = answerableClauses(question);
	const queryViews = parts.length ? [question, ...parts] : [question];
	const items: EvidenceInventoryItem[] = [];
	const score = (text: string) =>
		Math.max(
			...queryViews.map((view) =>
				Math.max(
					queryCoverage(view, text),
					fuzzyQueryCoverage(view, text),
					stemmedQueryCoverage(view, text),
					phraseQueryCoverage(view, text)
				)
			)
		);
	for (const [hitIndex, hit] of hits.entries()) {
		const lines = logicalEvidenceLines(hit.text);
		const sentences = hit.text
			.replace(/\s*\n\s*/gu, ' ')
			.split(/(?<=[.!?;:])\s+(?=[\p{Lu}\d«“"'’●•✓✗!-])/gu)
			.map((sentence) => sentence.trim())
			.filter((sentence) => sentence.length >= 25 && sentence.length <= 500);
		// PDF form layers often split a label from its value across visual lines
		// ("Prénom et Nom :" / "Camille Moreau"). Rebind them so the inventory
		// carries complete facts instead of dangling labels.
		const rawLines = hit.text
			.split(/\n+/u)
			.map((line) => line.trim())
			.filter(Boolean);
		const pairedRows: string[] = [];
		for (let index = 0; index < rawLines.length - 1; index++) {
			const label = /^(?:[-•●✓✗!]\s*)?(.{3,180}?)\s*:\s*$/u.exec(rawLines[index])?.[1]?.trim();
			if (!label) continue;
			const value = rawLines[index + 1];
			if (
				!value ||
				value.length > 220 ||
				/[:：]\s*$/u.test(value) ||
				/^[-•●✓✗!]\s/u.test(value) ||
				/^\d{1,3}[.)]\s/u.test(value)
			)
				continue;
			pairedRows.push(`${label} : ${value}`);
		}
		// A bare label carries no value of its own, and the inventory selects lines
		// by how much they overlap the question — so "Votre Directeur d'Agence"
		// was kept and "AMELIE ROUSSEAU", printed on the line above it, was
		// dropped for sharing no word with "qui est le directeur d'agence ?". The
		// model then bound the label to the company boilerplate that followed and
		// answered a person question with a bank's name.
		//
		// A French signature block writes the name above the role, a form writes
		// the value below the label, and neither is reachable by looking one way
		// only. Joining a value-less line with each short neighbour covers both
		// without a list of titles: the pair is scored like any other row, so it
		// only survives when the label itself was relevant.
		const carriesNoValue = (line: string) =>
			!/\d/u.test(line) &&
			!/[:?]\s*\S/u.test(line) &&
			line.split(/\s+/u).filter(Boolean).length <= 6;
		// Raw lines, not the logical ones: logicalEvidenceLines merges consecutive
		// lines into one run, which is exactly the adjacency this needs.
		const neighbourJoined: string[] = [];
		for (const [index, line] of rawLines.entries()) {
			if (!carriesNoValue(line)) continue;
			for (const rawNeighbour of [rawLines[index - 1], rawLines[index + 1]]) {
				if (!rawNeighbour) continue;
				const neighbour = rawNeighbour;
				// A long or sentence-shaped neighbour is prose, not a label. The
				// glued-footer repair that used to salvage its head is gone with the
				// glue itself: chrome is split off at parse time now (spec 034).
				if (
					neighbour.split(/\s+/u).filter(Boolean).length > 8 ||
					/[.!?»]\s*$/u.test(neighbour.trim())
				)
					continue;
				neighbourJoined.push(
					rawNeighbour === rawLines[index - 1] ? `${neighbour} ${line}` : `${line} ${neighbour}`
				);
			}
		}

		const preciseRows = new Set(neighbourJoined);
		for (const text of [...lines, ...sentences, ...pairedRows, ...neighbourJoined]) {
			const normalized = normalizeQuestion(text);
			const labelValue = /[:?]\s*\S/u.test(text) || /^[-•●✓✗!]\s+/u.test(text);
			const continuation =
				/^(?:ce|cet|cette|ces|seulement|si|lorsque|apres|avant|toutefois|mais|oui|non)\b/u.test(
					normalized
				);
			const precise = preciseRows.has(text);
			const utility =
				score(text) + (labelValue ? 0.3 : 0) + (continuation ? 0.22 : 0) + (precise ? 0.35 : 0);
			if (utility < 0.2) continue;
			items.push({ hit, text, utility, order: hitIndex, ...(precise ? { precise: true } : {}) });
		}
	}

	// Join a label split at a chunk boundary with its short answer. Form/OCR
	// chunks frequently place a structural parent between both child rows.
	const structural = [...hits]
		.filter((hit) => hit.seq !== undefined)
		.sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0));
	for (const anchor of structural) {
		const anchorLines = logicalEvidenceLines(anchor.text);
		const label = anchorLines.at(-1);
		if (!label || !/:\s*$/u.test(label)) continue;
		const next = structural.find(
			(hit) =>
				hit.documentId === anchor.documentId &&
				hit.page === anchor.page &&
				hit.seq! > anchor.seq! &&
				hit.seq! - anchor.seq! <= 2 &&
				/^(?:oui|non|yes|no)\b/u.test(normalizeQuestion(hit.text))
		);
		if (!next) continue;
		const value = /^(?:Oui|Non|Yes|No)\b/iu.exec(next.text.trim())?.[0];
		if (!value) continue;
		const text = `${label} ${value}`;
		items.push({
			hit: anchor,
			text,
			utility: score(text) + 0.7,
			order: hits.indexOf(anchor),
			extraCitations: [next]
		});
	}

	// A clause split at a chunk boundary ("dans un délai d'un mois à compter de
	// la" | "publication de l'arrêté…") must reach the model as one fact.
	for (const anchor of structural) {
		if (/[.!?»]\s*$/u.test(anchor.text.trim())) continue;
		const next = structural.find(
			(hit) =>
				hit.documentId === anchor.documentId &&
				hit.seq! === anchor.seq! + 1 &&
				(hit.page === null || anchor.page === null || Math.abs(hit.page - anchor.page) <= 1)
		);
		if (!next) continue;
		const tail = logicalEvidenceLines(anchor.text).at(-1) ?? '';
		const head = next.text
			.trim()
			.split(/(?<=[.!?;])\s+/u, 1)[0]
			.trim();
		if (!tail || !head) continue;
		const text = `${tail} ${head}`.slice(0, 420);
		items.push({
			hit: anchor,
			text,
			utility: score(text) + 0.35,
			order: hits.indexOf(anchor),
			extraCitations: [next]
		});
	}

	const selected: EvidenceInventoryItem[] = [];
	let chars = 0;
	for (const item of items.sort(
		(left, right) => right.utility - left.utility || left.order - right.order
	)) {
		const normalized = normalizeQuestion(item.text);
		// Containment means "already said" for two runs of prose. It does not for
		// a recovered pair: "AMELIE ROUSSEAU Votre Directeur d'Agence" sits
		// inside a 420-character run of the whole letter foot, and dropping it
		// left the model the label without the name.
		const duplicate = selected.some((candidate) => {
			const other = normalizeQuestion(candidate.text);
			if (other === normalized) return true;
			if (item.precise) return false;
			return other.includes(normalized) || normalized.includes(other);
		});
		if (duplicate) continue;
		const excerpt = item.text.slice(0, 420);
		if (selected.length > 0 && chars + excerpt.length > MAX_EVIDENCE_INVENTORY_CHARS) continue;
		selected.push({ ...item, text: excerpt });
		chars += excerpt.length;
		if (selected.length === 14) break;
	}
	if (!selected.length) return '';
	const rows = selected.map((item) => {
		const citations = [item.hit, ...(item.extraCitations ?? [])]
			.map((hit) => citationNumbers?.get(hit.chunkId) ?? hits.indexOf(hit) + 1)
			.filter((value, index, all) => value > 0 && all.indexOf(value) === index)
			.map((value) => `[${value}]`)
			.join('');
		return `- ${item.text} ${citations}`;
	});
	return `Structured evidence inventory (exact extractive facts; preserve labels and citations):\n${rows.join('\n')}`;
}

export const SYSTEM_PROMPT = `You are a careful assistant answering questions strictly from the numbered document excerpts provided.
Rules:
- Answer in the language of the question.
- Answer the exact question immediately. For a name, number, date, or amount, use one short natural sentence unless clarification is necessary.
- Preserve names as written. Do not split a full name into an alias or add phrases such as "under the name" unless the source explicitly distinguishes them.
- When asked for a line, section, sheet, or detail reference, copy the exact identifier adjacent to the requested label. Do not infer a different identifier from nearby arithmetic.
- Answer every part of a multi-part question. For a calculation, state the operands and the result.
- Combine related facts into one natural sentence or compact paragraph. Never repeat the questions, add field-style labels, or narrate where the answer was found; citations carry provenance.
- Preserve strict bounds and comparisons exactly: "less than" is not "up to" or "a maximum of", and "after" is not "on or after".
- Bind every value to its adjacent label and subject. Never substitute a document creation, signature, print or generation timestamp for a contract effective date, and never substitute a value from a neighboring category.
- Keep the requested insured object or category exact: building, belongings, liability, assistance and optional cover are not interchangeable.
- For a list, rights, obligations, consequences, selected options, or excluded options, include every distinct item supported by the excerpts. Distinguish what was selected from what was merely recommended or available.
- When asked what is covered, list covered events only; do not mix exclusions, causes that are not covered, or unrelated assistance services into the answer.
- For a yes/no question about coverage, eligibility or permission, state the decisive limitation and any explicitly named option or condition that changes the answer. Never present an optional protection as part of the base coverage.
- For requested actions or obligations, include every distinct relevant action in the excerpts, including required notices, evidence and deadlines.
- When asked for a difference or comparison, state the concrete values and the numeric difference when it can be computed. Do not answer only "higher", "lower", or "consistent".
- Use ONLY the excerpts. If they do not contain enough information, reply exactly: "I couldn't find enough information in the attached documents to answer this." (translated to the question's language) and nothing else.
- Cite every factual statement with the excerpt number in square brackets, e.g. [1] or [2][3].
- The bracketed numbers labeling each excerpt are reference labels added when assembling the excerpts. They are not part of any document: never report them as numbers, identifiers or values from the documents.
- Conversation context may resolve pronouns, but it is not evidence. Never cite it or repeat a fact that current excerpts do not support.
- Be concise. No reasoning preamble.`;

/** A question naming an email, phone or link is answered by the value itself.
 * A passage that echoes the question's wording without carrying one wins on
 * every overlap feature, so a draft can cite it and name no value at all ("the
 * address used for this request"). Used only when the excerpts demonstrably
 * carry a value and the draft states none. */
export function buildContactValuePrompt(
	question: string,
	value: string,
	excerptNumber: number
): string {
	// The rejected draft is deliberately NOT shown: quoting it back anchors the
	// model, which then welds the value onto the wrong claim ("the address used
	// for this request, namely <recipient address>") — confidently wrong where it
	// was merely vague. Answer from the carrying excerpt instead.
	return `Question: ${question}

Excerpt [${excerptNumber}] contains ${value}, which is what this question asks for. Answer the question from excerpt [${excerptNumber}], stating ${value} and citing [${excerptNumber}]. Do not describe which address, number or link to use without naming it. Answer in the language of the question and return only the answer.`;
}

/** A "who holds this role" question is answered by a person. The letterhead and
 * the legal footer both out-score the signature block on every overlap feature
 * (they carry the role's own words), so a draft can name the organisation and
 * no person at all. Same contract as the other value corrections: used only
 * when an excerpt demonstrably carries a name beside the role, and the draft is
 * never quoted back. */
export function buildPersonValuePrompt(
	question: string,
	name: string,
	excerptNumber: number
): string {
	return `Question: ${question}

Excerpt [${excerptNumber}] names ${name} directly beside the role this question asks about. Answer from excerpt [${excerptNumber}], stating that ${name} holds that role and citing [${excerptNumber}]. Name the person, never the organisation, the branch or the letterhead. Answer in the language of the question and return only the answer.`;
}

/** A multi-part question asking one deadline per part is only answered when
 * every part gets its own value; the 4B reliably states the deadline it read
 * last and drops the other ("acknowledged within ten working days, answered
 * within two months" → only the two months survive). Same contract as the
 * contact-value correction: used only when an excerpt demonstrably carries a
 * deadline the draft does not state, and the draft is never quoted back. */
export function buildDurationValuePrompt(
	question: string,
	value: string,
	excerptNumber: number
): string {
	return `Question: ${question}

Each part of this question asks for its own time limit. Excerpt [${excerptNumber}] states the time limit "${value}", which answers one part the draft missed. Answer every part of the question, stating each part's time limit from the excerpts, including "${value}" cited [${excerptNumber}]. Answer in the language of the question and return only the answer.`;
}

/** An amount the excerpts bind to a term the question names, which the draft
 * did not state. Same contract as the other value corrections: the proof is in
 * the document (amount and term in one clause), the draft is never quoted back,
 * and the retry is adopted only if it states the literal. */
export function buildAmountValuePrompt(
	question: string,
	value: string,
	excerptNumber: number
): string {
	return `Question: ${question}

Excerpt [${excerptNumber}] states the amount "${value}" for exactly what this question asks about. Answer from excerpt [${excerptNumber}], stating "${value}" and citing [${excerptNumber}]. Answer in the language of the question and return only the answer.`;
}

/**
 * Does the draft state the value this literal carries, however it spells it?
 *
 * The question a value correction actually needs to ask. It replaced a pair of
 * vocabularies — one listing the ways a model refuses, one listing the ways it
 * offers to answer instead of answering — that gated the amount correction
 * before it. Those lists were trying to establish WHY the draft failed, which
 * the correction does not need to know: an answer that omits a value the
 * evidence proves is wrong whether the model refused, misread, or wrote a
 * paragraph about how it could help.
 *
 * Comparison is by canonical value, not by string, so a draft writing "1 100
 * euros HT" counts as stating "1100 € HT" and no needless retry fires. That is
 * a check on a token type, which is what survives `.claude/rules/nlp.md`.
 */
export function statesTheValue(draft: string, literal: string): boolean {
	const wanted = canonicalNumbers(literal);
	if (!wanted.length) return draft.includes(literal);
	const stated = new Set(canonicalNumbers(draft));
	return wanted.every((value) => stated.has(value));
}

/** A schedule row reads `rank date balance installment amortized interest`,
 * and the model reliably answers the first large amount after the date — the
 * outstanding balance — when asked for an installment. Used only when the
 * ordinal schedule cell was resolved deterministically (repeating-column
 * analysis) and the draft states a different value. */
export function buildScheduleValuePrompt(
	question: string,
	value: string,
	excerptNumber: number
): string {
	return `Question: ${question}

Excerpt [${excerptNumber}] is a payment schedule table: each row lists the row number, the date, the remaining balance, and then the payment amounts, following the column order of the table's header line. The installment amount this question asks for is "${value}" — the value under the installment column of the relevant row, not the remaining balance next to the date. Answer the question stating "${value}" and citing [${excerptNumber}]. Answer in the language of the question and return only the answer.`;
}

/** The 4B's context window is 4096 tokens and MLC rejects any prompt that
 * exceeds it outright — the whole turn dies in an exception the retry then
 * repeats (measured: 4114 tokens on a 16-excerpt coverage question). Trim the
 * lowest-ranked excerpts until the assembled prompt fits. French runs ~3.2
 * chars per token on this tokenizer; dividing by 3 overestimates tokens, so
 * the clamp errs toward dropping one excerpt too many rather than throwing.
 * Callers MUST use the returned list everywhere (prompt, citations, excerpt
 * records): citation numbers are positional, and trimming after numbering
 * would remap every [n] to the wrong source. */
export function fitEvidenceToContext(
	question: string,
	hits: SearchHit[],
	conversationContext: string | null = null,
	maxPromptTokens = 3900
): SearchHit[] {
	const fits = (list: SearchHit[]) =>
		(SYSTEM_PROMPT.length + buildUserPrompt(question, list, conversationContext).length) / 3 <=
		maxPromptTokens;
	let kept = hits;
	while (kept.length > 1 && !fits(kept)) kept = kept.slice(0, -1);
	return kept;
}

/** A generation that died after a token or two: too short to answer anything
 * AND carrying no citation marker. Both conditions matter — a terse cited fact
 * ("1 200,50 € [1].") is a legitimate answer and must never be judged
 * degenerate, while a bare "1" is the first decoded token of an answer whose
 * generation failed (worker death, stop, or the known early-EOS failure of
 * this model family). Callers retry once or refuse to adopt, never both. */
/**
 * The scaffold the verification prompt asks the model to build *silently*:
 * one row per requested part, labelled subject/label/value/unit/condition/
 * exception/citation. A small local model does not keep it silent — it emits
 * the empty checklist instead of the answer, and the verification pass then
 * replaces a correct draft with it. Measured live: twelve identical rows,
 * every field blank but the subject, shown to the user under a real citation.
 *
 * Matched on the labels rather than on any one phrasing, because the model
 * translates them and reorders them.
 */
const CHECKLIST_SCAFFOLD =
	/^[-*\s]*(?:requested subject|sujet demand|exact adjacent source label|libell[ée] (?:source )?adjacent|value|valeur|unit[ée]?|condition|exception|citation)\s*:/imu;

/** Lines an answer repeats verbatim. A model that loops emits the same row over
 * and over; genuine prose repeats a whole line essentially never. */
function repeatedLineRatio(text: string): number {
	const lines = text
		.split('\n')
		.map((line) => line.trim().toLowerCase())
		.filter((line) => line.length > 2);
	if (lines.length < 6) return 0;
	const seen = new Map<string, number>();
	for (const line of lines) seen.set(line, (seen.get(line) ?? 0) + 1);
	const repeated = [...seen.values()].reduce((sum, count) => sum + (count > 1 ? count : 0), 0);
	return repeated / lines.length;
}

/** How much of the tail to look for again. Long enough that prose never
 *  repeats it by chance, short enough to catch a loop within a line or two. */
const REPETITION_PROBE_CHARS = 90;
/** Seen this many times, it is a decoder stuck on its own output, not emphasis. */
const REPETITION_OCCURRENCES = 3;

/**
 * Is the stream looping on itself, right now?
 *
 * `isDegenerateAnswer` judges a finished candidate that would replace a draft.
 * It never sees the draft as it streams, which is why a model repeating the
 * same two sentences twelve times reached a reader in full, ran 86 seconds, and
 * only stopped because they pressed the button.
 *
 * Greedy decoding at temperature 0 has no way out of that on its own: once a
 * run of tokens is the likeliest continuation it stays the likeliest. The
 * literature calls the fix real-time stream detection, and it is the layer that
 * catches what a repetition penalty and a cleaner prompt still let through.
 *
 * Looks for the tail appearing earlier in the text rather than for known bad
 * shapes, so it holds for any loop period and any language.
 */
export function hasCollapsedIntoRepetition(text: string): boolean {
	if (text.length < REPETITION_PROBE_CHARS * REPETITION_OCCURRENCES) return false;
	const probe = text.slice(-REPETITION_PROBE_CHARS);
	let seen = 0;
	let at = text.indexOf(probe);
	while (at >= 0) {
		if (++seen >= REPETITION_OCCURRENCES) return true;
		at = text.indexOf(probe, at + 1);
	}
	return false;
}

/**
 * An output that is not an answer: too short to say anything, a collapsed
 * repetition loop, or the internal checklist emitted instead of prose.
 *
 * Used to decide whether a generation may REPLACE a draft, so it has to catch
 * long garbage as well as short: the original length test passed a 3 000-char
 * loop because it carried a citation marker.
 */
export function isDegenerateAnswer(text: string): boolean {
	const visible = text.trim();
	if (visible.length < 40 && !/\[\d{1,2}\]/.test(visible)) return true;
	if (CHECKLIST_SCAFFOLD.test(visible)) return true;
	return repeatedLineRatio(visible) >= 0.5;
}

/** Verification may correct claims, but cannot erase attribution while the
 * retrieval sufficiency gate still says evidence answers the question. This
 * compares citation token shape only; no refusal vocabulary is involved. */
export function verificationPreservesGrounding(
	draft: string,
	verified: string,
	evidenceSufficient: boolean
): boolean {
	if (!evidenceSufficient) return true;
	const citation = /\[\d{1,2}\]/u;
	return !citation.test(draft) || citation.test(verified);
}

/** Stop a direct factual stream once it already covers every coordinated
 * request in complete prose. Local decoders otherwise keep expanding a valid
 * two-sentence answer into copied prompt scaffolding for tens of seconds.
 * Coverage is semantic/lexical over arbitrary clauses; no document vocabulary
 * or answer values are encoded here. Citations can be bound deterministically
 * from the same evidence after generation. */
export function hasCompleteFactualAnswer(question: string, draft: string): boolean {
	return completeFactualAnswerPrefix(question, draft) !== null;
}

/** Reader-facing prefix proven complete even when one decoder delta already
 * appended the beginning of another line. */
export function completeFactualAnswerPrefix(question: string, draft: string): string | null {
	const analysis = analyzeQuestion(question);
	const clauses = answerableClauses(question);
	const visible = stripThink(draft).trim();
	if (analysis.answerShape !== 'fact' || clauses.length < 2 || visible.length < 30) return null;
	const sentences = [...visible.matchAll(/[^.!?]+[.!?](?:\s+|$)/gu)]
		.map((match) => match[0].trim())
		.filter((sentence) => sentence.length >= 10);
	for (let count = 1; count <= sentences.length; count++) {
		const prefix = sentences.slice(0, count);
		if (
			clauses.every((clause) =>
				prefix.some((sentence) => citationGroundingCoverage(clause, sentence) >= 0.15)
			)
		)
			return prefix.join(' ');
	}
	return null;
}

export function groundedRefusal(question: string): string {
	return analyzeQuestion(question).locale === 'fr'
		? "Je n'ai pas trouvé assez d'informations dans les documents joints pour répondre."
		: "I couldn't find enough information in the attached documents to answer this.";
}

/**
 * The model refusing by blaming the reader for something they did.
 *
 * Measured live on a fee agreement, with sixteen passages in the prompt: "Je ne
 * peux pas fournir une réponse qui ne soit pas étayée par les documents
 * fournis. Puisque vous n'avez pas fourni les documents, je ne peux pas
 * répondre." The documents were attached and searched, so the sentence is
 * false, and it tells the user the fault is theirs. It escaped `isRefusalLike`
 * — which looks for claims that a FACT is absent — so it was shown verbatim
 * instead of being replaced by the app's own honest refusal.
 */
const BLAMES_THE_READER =
	/\b(?:vous n avez pas (?:fourni|donne|joint)|you (?:did not|have not|haven t) provided|sans (?:les )?documents fournis|je ne peux pas (?:fournir une reponse|repondre)|i cannot (?:provide an answer|answer))\b/u;

export function isRefusalLike(text: string): boolean {
	const normalized = normalizeQuestion(text);
	if (BLAMES_THE_READER.test(normalized)) return true;
	// "n'est pas indiqué" is the model's most common absence phrasing and was
	// missing here — the answer then kept a citation on an absence claim, which
	// the honest-refusal rule forbids (a citation cannot prove an absence).
	return /\b(?:je n ai pas trouve|pas mentionne|ne mentionne pas|ne precise(?:nt)? pas|n est pas (?:fourni|specifie|precise|indique|mentionne|disponible)|aucune information|aucun detail|ne contiennent aucune information|objet exact|non fourni|not mentioned|not specified|not provided|not indicated|not available|no information|couldn t find enough information)\b/u.test(
		normalized
	);
}

/** A qualified answer may honestly state that one requested detail is absent
 * while still returning a useful, supported fact. Only pure refusals should be
 * canonicalized and stripped of citations. */
export function isPureRefusalLike(text: string): boolean {
	if (!isRefusalLike(text)) return false;
	const normalized = normalizeQuestion(text);
	return !/\b(?:mais|cependant|toutefois|pourtant|en revanche|however|but|nevertheless)\b/u.test(
		normalized
	);
}

export function needsGroundedVerification(question: string, draft = ''): boolean {
	const normalized = normalizeQuestion(question);
	const verificationCore = normalized.replace(/^(?:d apres|selon)[^,]*,\s*/u, '');
	const analysis = analyzeQuestion(question);
	const identityCompanion =
		isIdentityQuestion(question) && /\b(?:avec qui|with whom)\b/u.test(normalized);
	// A short factual synthesis already constrained to cited evidence should not
	// pay for a second full generation. Numeric grounding, citation resolution,
	// typed-value retries and deterministic invariants still run afterwards. An
	// uncited or refusing draft keeps the audit path.
	const factualSynthesis =
		analysis.route === 'synthesis' && analysis.answerShape === 'fact' && !isPureRefusalLike(draft);
	return (
		(draft.length > 0 && isPureRefusalLike(draft)) ||
		(analysis.route === 'synthesis' && !identityCompanion && !factualSynthesis) ||
		/\b(?:ligne|line|section|feuille|sheet|detail|reference)\b/u.test(normalized) ||
		/\b(?:consequence|droit|obligation|ecart|difference|selectionne|choisi|exclu|rights?|duties|difference|selected|chosen|excluded)\w*\b/u.test(
			verificationCore
		) ||
		/\b(?:delai|deadline|prescription|inferieur|superieur|below|above|before|after|avant|apres)\b/u.test(
			verificationCore
		) ||
		(!identityCompanion &&
			/\b(?:couvert|couverte|couverts|couverture|couvre|couvrent|assure|assuree|eligible|covered|covers|coverage|insured|eligible)\b/u.test(
				verificationCore
			)) ||
		/\b(?:nom|marque|modele|numero exact|objet precis|name|brand|model|exact number|specific item)\b/u.test(
			normalized
		) ||
		STRICT_DIRECTION.test(normalized) ||
		(answerableClauses(question).length > 1 && !factualSynthesis)
	);
}

/** Keep whole evidence chunks and their structural continuations for the
 * verifier, while removing distant topical noise. Sparse citation numbers are
 * preserved by buildVerificationUserPrompt, so correction cannot silently
 * rebind a claim to another source. */
export function selectVerificationHits(
	question: string,
	hits: SearchHit[],
	maxHits = 8
): SearchHit[] {
	if (hits.length <= 1) return hits;
	const utility = (hit: SearchHit) => {
		const candidate = `${hit.headingPath ?? ''}\n${hit.text}`;
		return (
			queryCoverage(question, candidate) * 0.8 +
			fuzzyQueryCoverage(question, candidate) * 0.65 +
			stemmedQueryCoverage(question, candidate) * 0.8 +
			phraseQueryCoverage(question, candidate) * 1.1
		);
	};
	const ranked = hits
		.map((hit, index) => ({ hit, index, utility: utility(hit) }))
		.sort((left, right) => right.utility - left.utility || right.hit.score - left.hit.score);
	// Start from a small number of strong anchors, then preserve their complete
	// local evidence units. Four topical anchors used to crowd out a decisive
	// continuation before the verifier saw it.
	const anchors = ranked.slice(0, Math.min(2, maxHits));
	const neighbors = anchors.flatMap((anchor) =>
		hits
			.map((hit, index) => ({ hit, index }))
			.filter(({ hit }) => {
				if (hit.documentId !== anchor.hit.documentId || hit.chunkId === anchor.hit.chunkId)
					return false;
				if (hit.page != null && anchor.hit.page != null && hit.page === anchor.hit.page)
					return true;
				return (
					hit.seq !== undefined &&
					anchor.hit.seq !== undefined &&
					Math.abs(hit.seq - anchor.hit.seq) <= 2
				);
			})
			.sort((left, right) => {
				const leftDistance =
					left.hit.seq === undefined || anchor.hit.seq === undefined
						? Number.MAX_SAFE_INTEGER
						: Math.abs(left.hit.seq - anchor.hit.seq);
				const rightDistance =
					right.hit.seq === undefined || anchor.hit.seq === undefined
						? Number.MAX_SAFE_INTEGER
						: Math.abs(right.hit.seq - anchor.hit.seq);
				return leftDistance - rightDistance || left.index - right.index;
			})
			.slice(0, 5)
	);
	const order = [...anchors, ...neighbors, ...ranked].map((candidate) => candidate.hit);
	const selected: SearchHit[] = [];
	let chars = 0;
	for (const hit of order) {
		if (selected.some((candidate) => candidate.chunkId === hit.chunkId)) continue;
		const nextChars = hit.text.length + hit.documentName.length + 40;
		if (selected.length > 0 && chars + nextChars > MAX_VERIFICATION_EVIDENCE_CHARS) continue;
		selected.push(hit);
		chars += nextChars;
		if (selected.length === maxHits) break;
	}
	return selected.length ? selected : hits.slice(0, 1);
}

export function buildVerificationPrompt(
	question: string,
	evidencePrompt: string,
	draft: string
): string {
	const coverageContract = buildAnswerCoverageContract(question);
	return `Audit and correct the draft against the excerpts. Return only the corrected answer in the question's language, with citations.
Treat the draft as untrusted. Re-solve the question from the excerpts before comparing it with the draft. Output the corrected answer only: prose for the reader, no checklist, no headings, no field labels, no notes about your own process.
Check every requested part, exact form/output identifiers, strict bounds and comparisons, start-to-end direction, operands, units and arithmetic. Bind each value to its exact adjacent source label and requested subject; when two similar labels exist, keep both labels distinct rather than silently choosing one. Reject document creation/signature/print timestamps when the question asks for a contract effective date, and reject values from neighboring categories. A duration cannot be replaced by a price, deductible or retention period for another subject. For every deadline, copy the exact starting event after "from"/"à compter de". For lists, rights, obligations, consequences and selected/excluded options, compare the draft item by item with every relevant bullet, continuation, or following subsection; restore omissions. When asked how a payment, entitlement or remedy works, include supported prerequisites, deadlines and proof requirements from adjacent excerpts. When asked what is covered, use the clause matching the exact scenario and remove unrelated exclusions or assistance services. For coverage questions, preserve the decisive limitation and any explicitly offered option. For requested actions, include relevant notices, evidence and deadlines. If a requested value is absent but a related status or condition is present, return a qualified answer containing both the known status and the explicit absence; do not give a generic refusal. If the premise is disproved by the excerpts, state the contradiction and the useful supported fact instead of giving a generic refusal. Check contradictions instead of smoothing them over. Never add unsupported facts.
If two compared values are unequal or the computed difference is non-zero, the yes/no conclusion must be "no", never "yes".

${coverageContract}

${evidencePrompt}

Draft to verify:
${draft}

Question: ${question}`;
}

/** Enforce only invariants that can be proven from the generated text itself.
 * Semantic corrections stay with retrieval + verification; deterministic
 * arithmetic/consistency contradictions must never survive presentation. */
export function enforceAnswerInvariants(question: string, text: string): string {
	let corrected = stripThink(text);
	// This heading is an internal prompt sentinel, never document content. If a
	// small model copies the evidence scaffold after finishing its answer, keep
	// only reader-facing prose. Stream completion normally stops before this;
	// trimming is a last-resort boundary guard.
	const leakedInventory = corrected.search(/\n+\s*Structured evidence inventory\s*:/iu);
	if (leakedInventory >= 0) corrected = corrected.slice(0, leakedInventory).trimEnd();
	// Some small decoders finish a natural answer, emit its citation, then start
	// a field-style appendix (`[1]: value…`) copied from their own internal
	// coverage scaffold. Reader-facing citations never introduce a colon, so the
	// boundary is structural and document-agnostic. Keep the complete prose; the
	// citation resolver below will bind it again from the supporting excerpts.
	const labelledAppendix = corrected.search(/\s*\[\d{1,2}\]\s*:\s*(?=\p{L})/u);
	if (labelledAppendix >= 40 && /[.!?]\s*$/u.test(corrected.slice(0, labelledAppendix).trim()))
		corrected = corrected.slice(0, labelledAppendix).trimEnd();
	const normalizedQuestion = normalizeQuestion(question);
	let normalizedAnswer = normalizeQuestion(corrected);
	const difference =
		/(?:ecart|difference)\s+(?:est|is|:)?\s*(?:de|of)?\s*(-?\d+(?:[.,]\d+)?)/u.exec(
			normalizedAnswer
		);
	if (difference) {
		const value = Number(difference[1].replace(',', '.'));
		if (Number.isFinite(value) && Math.abs(value) > 1e-9) {
			corrected = corrected.replace(
				/^(\s*(?:\d+[.)]\s*)?)(?:oui|yes)\b/iu,
				(_match, prefix: string) =>
					`${prefix}${analyzeQuestion(question).locale === 'en' ? 'No' : 'Non'}`
			);
		}
	}
	normalizedAnswer = normalizeQuestion(corrected);
	if (
		/\b(?:coherent\w*|coherence|consistent|consistency)\b/u.test(normalizedQuestion) &&
		/\b(?:cependant|toutefois|or|however|but)\b/u.test(normalizedAnswer) &&
		/\b(?:ecart|contradiction|incoherent|discrepancy|inconsistent|non ajoute\w*|not selected)\b/u.test(
			normalizedAnswer
		)
	) {
		corrected = corrected
			.replace(/\best coh[eé]rent(e)?\b/iu, "n'est pas cohérent$1")
			.replace(/\bis consistent\b/iu, 'is not consistent');
	}
	// "Quel est mon solde ?" answered "Mon solde est…": the model has echoed the
	// asker's own possessive and speaks as them. The assistant never owns the
	// asker's balance, so the sentence-initial first person is wrong whenever the
	// question used one. Only sentence-initial, and only before a lowercase word:
	// a product name spelt "Mon Compte Épargne" stays what the document calls it.
	if (/\b(?:mon|ma|mes|my)\b/u.test(normalizedQuestion)) {
		corrected = corrected
			.replace(/(^|[.!?]\s+|\n)(?:Mon|Ma)(\s+\p{Ll})/gu, '$1Votre$2')
			.replace(/(^|[.!?]\s+|\n)Mes(\s+\p{Ll})/gu, '$1Vos$2')
			.replace(/(^|[.!?]\s+|\n)My(\s+\p{Ll})/gu, '$1Your$2');
	}
	return withoutRepeatedAnswerSentences(corrected);
}

/** The floor below which a repeated sentence is presumed legitimate rather
 * than redundant. This is not a tuning knob: it exists to protect the short
 * formulas a multi-part answer repeats on purpose — "Oui [1]" then "Oui [2]"
 * are two answers to two parts, and stripping citations for comparison makes
 * them identical. Above it, a verbatim self-repeat inside one answer states
 * nothing twice except itself; the boundary tests pin both sides. */
const REPEATED_ANSWER_SENTENCE_CHARS = 24;

/**
 * The answer with its own repeated sentences removed.
 *
 * A small model told to answer every part of a multi-part question writes each
 * part and then a closing paragraph that restates all of them — the same two
 * sentences, word for word, read twice. Provable from the generated text alone,
 * so it belongs with the other presentation-stage invariants: a sentence is
 * dropped only when an earlier sentence normalises to exactly the same words,
 * citations aside.
 */
export function withoutRepeatedAnswerSentences(text: string): string {
	const seen = new Set<string>();
	const parts = text.split(/(\n+)/u);
	const kept = parts.map((part) => {
		if (/^\n+$/u.test(part)) return part;
		return part
			.split(/(?<=[.!?])\s+/u)
			.filter((sentence) => {
				const key = sentence
					.replace(/\s*\[\d+\]/gu, '')
					.replace(/\s+/gu, ' ')
					.replace(/[.!?\s]+$/u, '')
					.trim()
					.toLowerCase();
				if (key.length < REPEATED_ANSWER_SENTENCE_CHARS) return true;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			})
			.join(' ');
	});
	return kept
		.join('')
		.replace(/\n{3,}/gu, '\n\n')
		.trim();
}

/** A sentence long enough that seeing it twice is redundancy rather than a
 * heading or a shared label two passages legitimately both carry. */
const REDUNDANT_SENTENCE_CHARS = 60;

/**
 * A passage with the sentences an earlier passage already carried removed.
 *
 * Chunks overlap on purpose — it is what keeps a fact retrievable when it
 * straddles a boundary — but the model is shown every retrieved chunk in full,
 * so the overlap is paid again in the prompt. Measured on a fee agreement with
 * sixteen passages: 7 005 of 13 653 characters were sentences already present
 * in a higher-ranked passage, about 2 300 tokens of prefill spent restating
 * what the model had just read, on the answer pass and again on every
 * verification and retry.
 *
 * A passage is never emptied and never renumbered: it keeps its citation
 * number and its own first sentence, so every `[n]` the model can emit still
 * resolves and the fact remains in the prompt exactly once.
 */
export function withoutRepeatedSentences(text: string, seen: Set<string>): string {
	const sentences = text.split(/(?<=[.;:!?])\s+/u);
	const kept: string[] = [];
	for (const sentence of sentences) {
		const key = sentence.replace(/\s+/gu, ' ').trim().toLowerCase();
		if (key.length >= REDUNDANT_SENTENCE_CHARS && seen.has(key)) continue;
		if (key.length >= REDUNDANT_SENTENCE_CHARS) seen.add(key);
		kept.push(sentence);
	}
	// Every sentence already seen: keep the first one so the passage still says
	// something under its number.
	return (kept.length ? kept : sentences.slice(0, 1)).join(' ').trim();
}

export function buildUserPrompt(
	question: string,
	hits: SearchHit[],
	conversationContext: string | null = null,
	citationNumbers: ReadonlyMap<number, number> | null = null,
	inventoryHits: SearchHit[] | null = null
): string {
	const seen = new Set<string>();
	const excerpts = hits
		.map((h, i) => {
			const locator = h.page ? `page ${h.page}` : (h.headingPath ?? '');
			const citationNumber = citationNumbers?.get(h.chunkId) ?? i + 1;
			return `[${citationNumber}] (${h.documentName}${locator ? ` · ${locator}` : ''})\n${withoutRepeatedSentences(h.text, seen)}`;
		})
		.join('\n\n');
	const context = conversationContext
		? `Conversation context (reference resolution only, not a source):\n${conversationContext}\n\n`
		: '';
	// A dispute is not a query to echo: the model must re-weigh the evidence and
	// either stand on it with the exact wording, or concede plainly.
	const contestedConstraint =
		conversationContext && isContestation(question)
			? `The user disputes the previous answer. Re-examine the excerpts from scratch. If they support the previous answer, confirm it and quote the exact supporting wording. If they support the user's correction, give the corrected answer and say plainly that the previous answer was wrong. If the excerpts settle neither, say the documents do not settle this point. Never repeat the user's words as the answer and never defend a claim the excerpts do not support.\n\n`
			: '';
	const role = analyzeQuestion(question).moneyRole;
	const roleConstraint = role
		? `Requested financial role: ${role}. Keep financial roles distinct; do not substitute sent, received, fees, tax, subtotal, or total/debited values for one another.\n\n`
		: '';
	const structuralConstraint =
		/\b(?:ligne|line|section|feuille|sheet|d[eé]tail|detail|r[eé]f[eé]rence|reference)\b/iu.test(
			question
		)
			? 'Required answer shape: start with the exact requested line, section, sheet, detail, or reference identifier, then explain only if needed. On forms, return the identifier printed on the requested output field itself, not an earlier instruction or calculation line.\n\n'
			: '';
	const direction = STRICT_DIRECTION.exec(normalizeQuestion(question));
	const directionalConstraint = direction
		? `Requested direction: ${direction[1]} is the start and ${direction[2]} is the end. Compute end minus start and describe that direction.\n\n`
		: '';
	const queryIdentifiers = new Set(extractIdentifiers(question));
	const nearbyReferences = new Set<string>();
	for (const hit of hits.slice(0, 4)) {
		const upper = hit.text.toUpperCase();
		for (const identifier of queryIdentifiers) {
			const offset = upper.indexOf(identifier);
			if (offset < 0) continue;
			const window = hit.text.slice(Math.max(0, offset - 100), offset + identifier.length + 140);
			for (const candidate of extractIdentifiers(window)) {
				if (!queryIdentifiers.has(candidate)) nearbyReferences.add(candidate);
			}
		}
	}
	const referenceHint = nearbyReferences.size
		? `Exact nearby references copied from the excerpts: ${[...nearbyReferences].slice(0, 6).join(', ')}.\n\n`
		: '';
	const parts = answerableClauses(question);
	const multiPartConstraint = parts.length
		? `Facts the answer must cover (combine them into natural prose; do not repeat or label these prompts):\n${parts.map((part, index) => `${index + 1}. ${part}`).join('\n')}\nUse only the excerpts relevant to each part. Never mix numbers between parts or documents. For each calculation, write its operands and formula before the result.\n\n`
		: '';
	// multiPartConstraint already carries these slots. Repeating the same
	// checklist increases prefill and encourages checklist-shaped output.
	const coverageContract = parts.length ? '' : buildAnswerCoverageContract(question);
	const coverageConstraint = coverageContract ? `${coverageContract}\n\n` : '';
	// Coordinated factual lookup already has explicit clause constraints and a
	// compact evidence set. Repeating it as an internal inventory adds prefill
	// latency and gives a small model scaffold text it may copy to the reader.
	const compactFactualLookup = parts.length > 1 && analyzeQuestion(question).answerShape === 'fact';
	const inventory = compactFactualLookup
		? ''
		: buildEvidenceInventory(question, inventoryHits ?? hits, citationNumbers);
	const inventoryConstraint = inventory ? `${inventory}\n\n` : '';
	// Order follows the U-shaped attention curve measured for long contexts
	// (Liu et al., "Lost in the Middle"): a model uses the head and the tail of
	// its context well and loses the middle, and instructions work best close to
	// the point of generation. The task constraints used to sit above the
	// passages, so on this document they were ~3 500 tokens away from the
	// question — the worst position available. They now sit between the passages
	// and the question, which is the tail. Conversation context stays at the
	// head: it is reference material for resolving pronouns, not an instruction.
	const constraints = `${contestedConstraint}${roleConstraint}${structuralConstraint}${directionalConstraint}${referenceHint}${multiPartConstraint}${coverageConstraint}${inventoryConstraint}`;
	return `${context}Excerpts:\n\n${excerpts}\n\n${constraints}Question: ${question}`;
}

export function buildVerificationUserPrompt(
	question: string,
	hits: SearchHit[],
	conversationContext: string | null = null
): string {
	const selected = selectVerificationHits(question, hits);
	const citationNumbers = new Map(hits.map((hit, index) => [hit.chunkId, index + 1]));
	return buildUserPrompt(question, selected, conversationContext, citationNumbers, hits);
}

/**
 * Reasoning models (Qwen3) emit <think>…</think> before the answer. Strip it
 * for display and post-processing; an unclosed block (mid-stream) yields ''.
 */
export function stripThink(text: string): string {
	const withoutClosed = text.replace(/<think>[\s\S]*?<\/think>/g, '');
	const openIdx = withoutClosed.indexOf('<think>');
	return (openIdx >= 0 ? withoutClosed.slice(0, openIdx) : withoutClosed).trimStart();
}

/** True while the tail of the stream is inside an unclosed <think> block. */
export function isThinking(text: string): boolean {
	const lastOpen = text.lastIndexOf('<think>');
	return lastOpen >= 0 && text.indexOf('</think>', lastOpen) === -1;
}

/** The reasoning inside <think> blocks — closed ones and a trailing unclosed
 * one (mid-stream). Displayed as the turn's draft notes, never as the answer. */
export function extractThink(text: string): string {
	const parts = [...text.matchAll(/<think>([\s\S]*?)<\/think>/g)].map((match) => match[1]);
	const withoutClosed = text.replace(/<think>[\s\S]*?<\/think>/g, '');
	const openIdx = withoutClosed.indexOf('<think>');
	if (openIdx >= 0) parts.push(withoutClosed.slice(openIdx + '<think>'.length));
	return parts.join('\n').trim();
}

export interface CitationRef {
	/** 1-based excerpt number as emitted by the model. */
	n: number;
	hit: SearchHit;
}

export function citationGroundingCoverage(query: string, text: string): number {
	return (
		queryCoverage(query, text) * 0.3 +
		fuzzyQueryCoverage(query, text) * 0.25 +
		stemmedQueryCoverage(query, text) * 0.25 +
		phraseQueryCoverage(query, text) * 0.2
	);
}

/** Repair citation numbering for messages persisted before sparse markers were compacted. */
export function compactCitationMarkers(text: string, citationCount: number): string {
	if (!citationCount) return text;
	const numbers = [...new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])))].sort(
		(a, b) => a - b
	);
	if (numbers.length !== citationCount) return text;
	const compact = new Map(numbers.map((original, index) => [original, index + 1]));
	return text.replace(/\[(\d{1,2})\]/g, (_, raw: string) => `[${compact.get(Number(raw))}]`);
}

/** Bind each substantive line of an uncited answer to the passage that best
 * supports its actual words. A grounded answer the model forgot to cite is a
 * provenance defect, not a reason to present sourced facts as unsourced. */
function bindUncitedAnswerParts(
	text: string,
	hits: SearchHit[],
	question: string
): { text: string; citations: CitationRef[] } | null {
	const parts = text
		.split(/\n+/u)
		.map((part) => part.trim())
		.filter(Boolean);
	const citations: CitationRef[] = [];
	const numberByChunk = new Map<number, number>();
	const lines: string[] = [];
	for (const part of parts) {
		const content = part.replace(/^(?:\d{1,2}[.)]\s*|[-•●]\s*)/u, '');
		if (content.length < 12) {
			lines.push(part);
			continue;
		}
		const best = hits
			.map((hit) => ({
				hit,
				answerSupport: citationGroundingCoverage(content, hit.text),
				support: citationGroundingCoverage(`${question} ${content}`, hit.text)
			}))
			.sort(
				(left, right) =>
					right.answerSupport - left.answerSupport ||
					right.support - left.support ||
					right.hit.score - left.hit.score
			)[0];
		// A bare yes/no adds no content words of its own; the clause matching the
		// question's scenario is its legitimate source.
		const bareVerdict =
			/^(?:oui|non|yes|no)\b/u.test(normalizeQuestion(content)) && content.length <= 140;
		if (!best || (best.answerSupport < 0.2 && !(bareVerdict && best.support >= 0.25))) {
			lines.push(part);
			continue;
		}
		let marker = numberByChunk.get(best.hit.chunkId);
		if (marker === undefined) {
			marker = numberByChunk.size + 1;
			numberByChunk.set(best.hit.chunkId, marker);
			citations.push({ n: marker, hit: best.hit });
		}
		lines.push(`${part} [${marker}]`);
	}
	if (!citations.length) return null;
	return { text: lines.join('\n'), citations };
}

/**
 * Validate [n] markers against the retrieved set. Returns the cleaned text
 * (invalid markers removed) and the ordered unique list of valid citations.
 * With a question, an uncited grounded answer gets its citations rebound from
 * evidence support instead of being returned unsourced.
 */
export function resolveCitations(
	text: string,
	hits: SearchHit[],
	question: string | null = null
): { text: string; citations: CitationRef[] } {
	if (question !== null && hits.length && !/\[\d{1,2}\]/.test(text) && !isRefusalLike(text)) {
		const bound = bindUncitedAnswerParts(text, hits, question);
		if (bound) return bound;
	}
	const sourceNumbers = [
		...new Set(
			[...text.matchAll(/\[(\d{1,2})\]/g)]
				.map((match) => Number(match[1]))
				.filter((n) => n >= 1 && n <= hits.length)
		)
	].sort((a, b) => a - b);
	const compactNumber = new Map(sourceNumbers.map((original, index) => [original, index + 1]));
	const cleaned = text.replace(/\[(\d{1,2})\]/g, (_marker, numStr: string) => {
		const n = Number(numStr);
		const compact = compactNumber.get(n);
		return compact === undefined ? '' : `[${compact}]`;
	});
	return {
		text: cleaned,
		citations: sourceNumbers.map((original, index) => ({
			n: index + 1,
			hit: hits[original - 1]
		}))
	};
}

/**
 * The values a text states, so "17 056,11 €" and "17056,11" are one value and
 * "page 12, 3 ans" is not the value 123. Comparing a stripped digit soup
 * instead let an invented number match a passage by accident — and because the
 * citation candidates are then narrowed to the passages carrying that accident,
 * it also excluded the passage that spells the value in words.
 *
 * Single digits are dropped: an answer numbering its own list items must not
 * bind a citation, and a fabricated amount is essentially never one digit.
 */
export function numberTokens(text: string): string[] {
	return canonicalNumbers(text).filter((value) => value.replace(/\D/gu, '').length >= 2);
}

/** For one-fact answers, bind citation to passage that best supports words/numbers actually written. */
export function resolveTargetedCitations(
	text: string,
	hits: SearchHit[],
	question: string
): { text: string; citations: CitationRef[] } {
	if (isPureRefusalLike(text)) return { text: groundedRefusal(question), citations: [] };
	if (!hits.length) return resolveCitations(text, hits);
	const answerIdentifiers = extractIdentifiers(text);
	const answerNumbers = numberTokens(text);
	const candidatesWithAnswerSignals = hits.filter((hit) => {
		const hitIdentifiers = extractIdentifiers(hit.text);
		const hitNumbers = new Set(numberTokens(hit.text));
		return (
			answerIdentifiers.some((identifier) => hitIdentifiers.includes(identifier)) ||
			answerNumbers.some((number) => hitNumbers.has(number))
		);
	});
	const citationCandidates = candidatesWithAnswerSignals.length
		? candidatesWithAnswerSignals
		: hits;
	if (!/\[\d{1,2}\]/.test(text)) {
		// The citation must support the words actually written. Question-term
		// overlap is only a tiebreaker: a clause merely *about* the same topic
		// (a definition, a neighboring category) must never outrank the passage
		// the answer was extracted from.
		const supporting = citationCandidates
			.map((hit) => ({
				hit,
				support: citationGroundingCoverage(`${question} ${text}`, hit.text),
				answerSupport: citationGroundingCoverage(text, hit.text)
			}))
			.sort(
				(left, right) =>
					right.answerSupport - left.answerSupport ||
					right.support - left.support ||
					right.hit.score - left.hit.score
			)[0];
		// A bare yes/no adds no content words of its own; the clause matching the
		// question's scenario is its legitimate source.
		const bareVerdict =
			/^(?:oui|non|yes|no)\b/u.test(normalizeQuestion(text)) &&
			text.replace(/\[\d{1,2}\]/g, '').trim().length <= 140;
		if (
			supporting &&
			(candidatesWithAnswerSignals.length > 0 ||
				supporting.answerSupport >= 0.2 ||
				(bareVerdict && supporting.support >= 0.25))
		)
			return { text: `${text.trimEnd()} [1]`, citations: [{ n: 1, hit: supporting.hit }] };
		return resolveCitations(text, hits, question);
	}
	// Coordinated questions and answers can contain several independently
	// sourced facts. Collapsing every marker to one "best" passage would turn a
	// correct multi-source answer into a misleading single citation.
	if (
		/\b(et|ainsi que|and|as well as)\b/i.test(question) ||
		/\b(?:cependant|toutefois|however|nevertheless)\b/iu.test(text) ||
		/[;\n]/.test(text)
	) {
		return resolveCitations(text, hits);
	}
	const answerText = text.replace(/\[\d{1,2}\]/g, '');
	const grounding = `${question} ${answerText}`;
	const best = [...citationCandidates]
		.map((hit) => ({
			hit,
			answerSupport: citationGroundingCoverage(answerText, hit.text),
			support: citationGroundingCoverage(grounding, hit.text)
		}))
		.sort(
			(a, b) =>
				b.answerSupport - a.answerSupport || b.support - a.support || b.hit.score - a.hit.score
		)[0];
	if (!best || best.support === 0) return resolveCitations(text, hits);
	return {
		text: text.replace(/(?:\s*\[\d{1,2}\])+/g, ' [1]'),
		citations: [{ n: 1, hit: best.hit }]
	};
}

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

// A genuine directional change: "de 2018 à 2019", not the ubiquitous French
// "de … à …" span (normalizeQuestion folds "à"→"a", which is also the verb).
const STRICT_DIRECTION = /\b(?:de|from)\s+(\d{4})[\s\S]*?\s+(?:a|to)\s+(\d{4})\b/u;

// Leading adverbial framings ("D'après le contrat,", "Selon vous,") are not
// answerable parts. splitQueryClauses would otherwise count them as a part and
// route a simple question through the multi-part / verification machinery.
const LEADING_FRAMING =
	/^(?:d['’ ]?apres|selon|a mon avis|en general|par ailleurs|d['’ ]?ailleurs)\b/u;

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
			`Answer each requested slot separately:\n${parts.map((part, index) => `${index + 1}. ${part}`).join('\n')}`
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
		for (const text of [...lines, ...sentences, ...pairedRows]) {
			const normalized = normalizeQuestion(text);
			const labelValue = /[:?]\s*\S/u.test(text) || /^[-•●✓✗!]\s+/u.test(text);
			const continuation =
				/^(?:ce|cet|cette|ces|seulement|si|lorsque|apres|avant|toutefois|mais|oui|non)\b/u.test(
					normalized
				);
			const utility = score(text) + (labelValue ? 0.3 : 0) + (continuation ? 0.22 : 0);
			if (utility < 0.2) continue;
			items.push({ hit, text, utility, order: hitIndex });
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
		if (
			selected.some(
				(candidate) =>
					normalizeQuestion(candidate.text) === normalized ||
					normalizeQuestion(candidate.text).includes(normalized) ||
					normalized.includes(normalizeQuestion(candidate.text))
			)
		)
			continue;
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
- Conversation context may resolve pronouns, but it is not evidence. Never cite it or repeat a fact that current excerpts do not support.
- Be concise. No reasoning preamble.`;

export function groundedRefusal(question: string): string {
	return analyzeQuestion(question).locale === 'fr'
		? "Je n'ai pas trouvé assez d'informations dans les documents joints pour répondre."
		: "I couldn't find enough information in the attached documents to answer this.";
}

export function isRefusalLike(text: string): boolean {
	const normalized = normalizeQuestion(text);
	return /\b(?:je n ai pas trouve|pas mentionne|ne mentionne pas|ne precise(?:nt)? pas|n est pas (?:fourni|specifie|precise)|aucune information|aucun detail|ne contiennent aucune information|objet exact|non fourni|not mentioned|not specified|not provided|no information|couldn t find enough information)\b/u.test(
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
	return (
		(draft.length > 0 && isPureRefusalLike(draft)) ||
		(analysis.route === 'synthesis' && !identityCompanion) ||
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
		answerableClauses(question).length > 1
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
Treat the draft as untrusted. Re-solve the question from the excerpts before comparing it with the draft. Silently build a checklist with one row per requested part: requested subject, exact adjacent source label, value, unit, condition, exception and citation. Then write the answer from that checklist.
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
	return corrected;
}

export function buildUserPrompt(
	question: string,
	hits: SearchHit[],
	conversationContext: string | null = null,
	citationNumbers: ReadonlyMap<number, number> | null = null,
	inventoryHits: SearchHit[] | null = null
): string {
	const excerpts = hits
		.map((h, i) => {
			const locator = h.page ? `page ${h.page}` : (h.headingPath ?? '');
			const citationNumber = citationNumbers?.get(h.chunkId) ?? i + 1;
			return `[${citationNumber}] (${h.documentName}${locator ? ` · ${locator}` : ''})\n${h.text}`;
		})
		.join('\n\n');
	const context = conversationContext
		? `Conversation context (reference resolution only, not a source):\n${conversationContext}\n\n`
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
		? `Requested parts (answer each one separately):\n${parts.map((part, index) => `${index + 1}. ${part}`).join('\n')}\nUse only the excerpts relevant to each part. Never mix numbers between parts or documents. For each calculation, write its operands and formula before the result.\n\n`
		: '';
	const coverageContract = buildAnswerCoverageContract(question);
	const coverageConstraint = coverageContract ? `${coverageContract}\n\n` : '';
	const inventory = buildEvidenceInventory(question, inventoryHits ?? hits, citationNumbers);
	const inventoryConstraint = inventory ? `${inventory}\n\n` : '';
	return `${context}${roleConstraint}${structuralConstraint}${directionalConstraint}${referenceHint}${multiPartConstraint}${coverageConstraint}${inventoryConstraint}Excerpts:\n\n${excerpts}\n\nQuestion: ${question}`;
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

/** For one-fact answers, bind citation to passage that best supports words/numbers actually written. */
export function resolveTargetedCitations(
	text: string,
	hits: SearchHit[],
	question: string
): { text: string; citations: CitationRef[] } {
	if (isPureRefusalLike(text)) return { text: groundedRefusal(question), citations: [] };
	if (!hits.length) return resolveCitations(text, hits);
	const answerIdentifiers = extractIdentifiers(text);
	const answerNumbers = [...text.matchAll(/\b\d[\d\s.,]*\d\b/g)]
		.map((match) => match[0].replace(/\D/g, ''))
		.filter((value) => value.length >= 2);
	const candidatesWithAnswerSignals = hits.filter((hit) => {
		const hitIdentifiers = extractIdentifiers(hit.text);
		const hitDigits = hit.text.replace(/\D/g, '');
		return (
			answerIdentifiers.some((identifier) => hitIdentifiers.includes(identifier)) ||
			answerNumbers.some((number) => hitDigits.includes(number))
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

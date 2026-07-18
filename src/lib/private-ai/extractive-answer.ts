import { analyzeQuestion } from '$lib/analysis/query-router';
import { normalizeQuestion } from '$lib/nlu/semantic-frame';
import {
	fuzzyQueryCoverage,
	normalizeForFuzzy,
	phraseQueryCoverage,
	stemmedQueryCoverage
} from '$lib/pipeline/fuzzy';
import { queryCoverage, splitQueryClauses } from '$lib/pipeline/retrieval';
import type { SearchHit } from '$lib/types';

interface EvidenceUnit {
	hit: SearchHit;
	text: string;
	order: number;
}

interface LabelValueFact extends EvidenceUnit {
	label: string;
	value: string;
}

const SCENARIO_STOPWORDS = new Set(
	'avec dans est il elle les mon ma mes notre votre pour quel quelle quels quelles qui que quoi comment couvert couverte couverts couverture garantie base assure assuree vol vole volee theft stolen insured covered coverage what which where when how the this that'.split(
		' '
	)
);

function logicalLines(text: string): string[] {
	const lines = text
		.split(/\n+/u)
		.map((line) => line.trim())
		.filter(Boolean);
	const result: string[] = [];
	let current = '';
	for (const line of lines) {
		const startsItem = /^(?:[-•●✓✗!]\s+|\d+[.)]\s+)/u.test(line);
		if (startsItem && current) {
			result.push(current);
			current = line;
		} else if (
			current &&
			/^(?:[-•●✓✗!]\s+|\d+[.)]\s+)/u.test(current) &&
			/(?:\?|:)\s+\S/u.test(current) &&
			/^\p{Lu}/u.test(line)
		) {
			// A filled OCR form row ended; uppercase prose starts a new block.
			result.push(current);
			current = line;
		} else {
			current = current ? `${current} ${line}` : line;
		}
	}
	if (current) result.push(current);
	return result;
}

function evidenceUnits(hits: SearchHit[]): EvidenceUnit[] {
	return hits.flatMap((hit, order) => {
		const sentences = hit.text
			.replace(/\s*\n\s*/gu, ' ')
			.split(/(?<=[.!?;:])\s+(?=[\p{Lu}\d«“"'’●•✓✗!-])/gu)
			.map((text) => text.trim())
			.filter((text) => text.length >= 20);
		// Many contract exclusions express polarity in one sentence and exact
		// object/condition in next. Keep bounded two-sentence windows so answer
		// extraction does not fall back to whole unrelated chunk.
		const prose = [
			...sentences,
			...sentences.slice(0, -1).map((text, index) => `${text} ${sentences[index + 1]}`)
		];
		return [...logicalLines(hit.text), ...prose].map((text) => ({ hit, text, order }));
	});
}

function citation(hit: SearchHit, hits: SearchHit[]): string {
	return `[${hits.findIndex((candidate) => candidate.chunkId === hit.chunkId) + 1}]`;
}

function coverage(query: string, text: string): number {
	return Math.max(
		queryCoverage(query, text),
		fuzzyQueryCoverage(query, text),
		stemmedQueryCoverage(query, text),
		phraseQueryCoverage(query, text)
	);
}

function expandedSlot(slot: string): string {
	const normalized = normalizeForFuzzy(slot);
	const additions: string[] = [];
	if (/\b(?:surface|superficie|area)\b/u.test(normalized))
		additions.push('surface superficie area');
	if (/\b(?:materiau|material)\w*\b/u.test(normalized))
		additions.push('materiau materiaux material construction');
	if (/\b(?:construit|construction|built)\b/u.test(normalized))
		additions.push('quand when date periode annee construction construit built');
	if (/\b(?:dependance|outbuilding)\w*\b/u.test(normalized))
		additions.push('dependance dependances outbuilding garage cave taille');
	if (/\b(?:type|kind)\b/u.test(normalized)) additions.push('type logement habitation kind');
	if (/\b(?:dispositif|securite|protection|device|security)\w*\b/u.test(normalized))
		additions.push('dispositif securite protection alarme camera detecteur device security alarm');
	if (/\b(?:sinistre|claim)\w*\b/u.test(normalized)) additions.push('sinistre claim historique');
	if (/\b(?:hotel|hotels)\b/u.test(normalized))
		additions.push('hotel hebergement nuit nuits accommodation lodging night');
	if (/\b(?:souscripteur|subscriber|nomme|nommee|named)\b/u.test(normalized))
		additions.push('nom prenom souscripteur identite name subscriber identity');
	if (/\b(?:resili|cancel|terminat)\w*\b/u.test(normalized))
		additions.push('resiliation resilie cancelled terminated');
	if (/\b(?:assurance actuelle|currently insured|current insurance)\b/u.test(normalized))
		additions.push('assurance habitation contrat actuel currently insured current insurance');
	if (
		/\b(?:cohabitant|partenaire|conjoint|vit avec|living with|partner|spouse)\b/u.test(normalized)
	)
		additions.push(
			'qui d autre vit avec vous cohabitant partenaire conjoint living with partner spouse'
		);
	return additions.length ? `${slot} ${additions.join(' ')}` : slot;
}

function labelValueFacts(hits: SearchHit[]): LabelValueFact[] {
	const facts: LabelValueFact[] = [];
	for (const [order, hit] of hits.entries()) {
		const lines = hit.text
			.split(/\n+/u)
			.map((line) => line.trim())
			.filter((line) => line.length >= 1);
		const rows = [...logicalLines(hit.text), ...lines.filter((line) => line.length >= 4)];
		for (const raw of rows) {
			const text = raw.replace(/^(?:[-•●✓✗!]\s*)/u, '').trim();
			// Logical blocks may contain several OCR form rows. Individual lines
			// below are authoritative; never parse one merged multi-row value.
			if (/\s[-•●✓✗!]\s+/u.test(text)) continue;
			const colon = /^(.{3,180}?)\s*:\s*(\S[\s\S]{0,220})$/u.exec(text);
			const question = /^(.{3,180}\?)\s+(\S[\s\S]{0,160})$/u.exec(text);
			const match = colon ?? question;
			if (!match) continue;
			facts.push({ hit, label: match[1].trim(), value: match[2].trim(), text, order });
		}
		// PDF form layers often place the label and its value on separate visual
		// lines ("Prénom et Nom :" / "Camille Moreau"). Bind them when the label
		// line carries no inline value and the next line is not itself a label.
		for (let index = 0; index < lines.length - 1; index++) {
			const label = /^(?:[-•●✓✗!]\s*)?(.{3,180}?)\s*:\s*$/u.exec(lines[index])?.[1]?.trim();
			if (!label) continue;
			const value = lines[index + 1].trim();
			if (
				!value ||
				value.length > 220 ||
				/[:：]\s*$/u.test(value) ||
				/^[-•●✓✗!]\s/u.test(value) ||
				/^\d{1,3}[.)]\s/u.test(value)
			)
				continue;
			facts.push({ hit, label, value, text: `${label} : ${value}`, order });
		}
	}
	const structural = [...hits]
		.filter((hit) => hit.seq !== undefined)
		.sort((left, right) => left.seq! - right.seq!);
	for (const anchor of structural) {
		const last = logicalLines(anchor.text)
			.at(-1)
			?.replace(/^[-•●✓✗!]\s*/u, '')
			.trim();
		if (!last || !/:\s*$/u.test(last)) continue;
		const next = structural.find(
			(hit) =>
				hit.documentId === anchor.documentId &&
				hit.page === anchor.page &&
				hit.seq! > anchor.seq! &&
				hit.seq! - anchor.seq! <= 2 &&
				/^(?:oui|non|yes|no)\b/u.test(normalizeQuestion(hit.text))
		);
		const value = next ? /^(?:Oui|Non|Yes|No)\b/iu.exec(next.text.trim())?.[0] : undefined;
		if (!next || !value) continue;
		facts.push({
			hit: anchor,
			label: last.replace(/:\s*$/u, ''),
			value,
			text: `${last} ${value}`,
			order: hits.indexOf(anchor)
		});
	}
	const unique = facts.filter(
		(fact, index, all) =>
			all.findIndex(
				(candidate) =>
					normalizeQuestion(candidate.label) === normalizeQuestion(fact.label) &&
					normalizeQuestion(candidate.value) === normalizeQuestion(fact.value)
			) === index
	);
	// PDF text layers sometimes detach the superscript in m² and place it on
	// the preceding form value. Repair only when both halves occur together.
	const detachedArea = unique.find((fact) => /^\d+(?:[.,]\d+)?\s*m$/iu.test(fact.value));
	if (detachedArea) {
		detachedArea.value = detachedArea.value.replace(/\s*m$/iu, ' m²');
		detachedArea.text = `${detachedArea.label}: ${detachedArea.value}`;
		const superscriptDonor = unique.find(
			(fact) =>
				fact !== detachedArea &&
				/\p{L}\s+2$/u.test(fact.value) &&
				/\b(?:type|kind|logement|home|property)\b/u.test(normalizeForFuzzy(fact.label))
		);
		if (superscriptDonor) {
			superscriptDonor.value = superscriptDonor.value.replace(/\s+2$/u, '');
			superscriptDonor.text = `${superscriptDonor.label}: ${superscriptDonor.value}`;
		}
	}
	const dependencySize = unique.find(
		(fact) =>
			/\b(?:dependance|outbuilding)\w*\b/u.test(normalizeQuestion(fact.label)) &&
			/^\d+(?:[.,]\d+)?\s*(?:m²|m2|m)(?:\s|$)/iu.test(fact.value)
	);
	const dependencyPresence = unique.find(
		(fact) =>
			/\b(?:dependance|outbuilding)\w*\b/u.test(normalizeQuestion(fact.label)) &&
			normalizeQuestion(fact.label).includes(normalizeQuestion(fact.value))
	);
	if (dependencySize && dependencyPresence) {
		dependencyPresence.value = /\b(?:outbuilding)\w*\b/u.test(
			normalizeQuestion(dependencyPresence.label)
		)
			? 'Yes'
			: 'Oui';
		dependencyPresence.text = `${dependencyPresence.label}: ${dependencyPresence.value}`;
	}
	return unique;
}

function buildComparisonAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (!/\b(?:coherent|coherence|difference|ecart|contradiction|compare)\w*\b/u.test(normalized))
		return null;
	const facts = labelValueFacts(hits).filter(({ value }) =>
		/\b(?:ajoute|ajoutee|selectionne|selectionnee|inclus|incluse|oui|non|added|selected|included|yes|no|not)\b/u.test(
			normalizeQuestion(value)
		)
	);
	if (facts.length < 2) return null;
	const recommendation = evidenceUnits(hits)
		.filter((unit) =>
			/\b(?:conseill|recommand|recommend|advis)\w*\b/u.test(normalizeQuestion(unit.text))
		)
		.map((unit) => ({
			unit,
			matchedFacts: facts.filter((fact) => coverage(fact.label, unit.text) >= 0.7).length
		}))
		.sort(
			(left, right) => right.matchedFacts - left.matchedFacts || left.unit.order - right.unit.order
		)[0]?.unit;
	if (!recommendation) return null;
	const mismatches = facts.filter(
		(fact) =>
			/\b(?:non|pas|not|no)\b/u.test(normalizeQuestion(fact.value)) &&
			coverage(fact.label, recommendation.text) >= 0.7
	);
	if (!mismatches.length) return null;
	const structuralFactChunks = new Set(mismatches.map((fact) => fact.hit.chunkId));
	const statusFacts = facts.filter((fact) => structuralFactChunks.has(fact.hit.chunkId));
	const statusLines = statusFacts.map(
		(fact) =>
			`- ${fact.label.replace(/[?.]?$/u, '').trim()} : ${fact.value} ${citation(fact.hit, hits)}`
	);
	const labels = mismatches.map((fact) => fact.label.replace(/^option\s+/iu, '')).join(', ');
	const conclusion =
		analyzeQuestion(question).locale === 'fr'
			? `Conclusion : la liste et le conseil sont incohérents. Le conseil recommande ${labels}, alors que ces options sont marquées comme non ajoutées ${citation(recommendation.hit, hits)}${citation(mismatches[0].hit, hits)}.`
			: `Conclusion: the list and advice are inconsistent. The advice recommends ${labels}, while those options are marked as not added ${citation(recommendation.hit, hits)}${citation(mismatches[0].hit, hits)}.`;
	return [...statusLines, conclusion].join('\n');
}

function buildFormAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (/\b(?:coherent|coherence|difference|ecart|contradiction|compare)\w*\b/u.test(normalized))
		return null;
	// Label/value extraction is for declarations and selected options, not for
	// arbitrary multi-clause policy questions that happen to retrieve a form.
	if (
		!/\b(?:declar\w*|questionnaire|souscripteur|possede\w*|cohabitant|partenaire|conjoint|vit avec|dispositif\w*|securite|protection|logement|habitation|assurance actuelle|actuellement assure|choisi\w*|selectionne\w*|ajoute\w*|declared|questionnaire|policyholder|owns?|living with|security|selected|added|current insurance)\b/u.test(
			normalized
		)
	)
		return null;
	const slots = splitQueryClauses(question);
	if (slots.length < 2) return null;
	// A declared-form fact carries a concrete value (number, yes/no, unit, short
	// entry) — a glossary definition ("Période subséquente : Période se situant
	// après…") is prose, not a declaration.
	const facts = labelValueFacts(hits).filter(
		(fact) =>
			fact.value.length <= 60 || /(?:\d|\boui\b|\bnon\b|\byes\b|\bno\b|m²|m2|€)/iu.test(fact.value)
	);
	if (facts.length < 2) return null;
	const chosen: Array<{ slot: string; fact: LabelValueFact; score: number }> = [];
	// Exact token overlap outranks approximate matching: a fuzzy near-miss
	// ("données" ~ "donne") on an unrelated prose label must never displace the
	// label that literally contains the requested word. Assignment is global
	// greedy — the strongest slot/label pair claims its fact first, so a shared
	// token ("construction") cannot let an earlier slot steal a later slot's row.
	const rankedBySlot = new Map(
		slots.map((slot) => {
			const expanded = expandedSlot(slot);
			// First subject noun of the slot, skipping request verbs and metric
			// words; matched as a whole token so "donne" never rides inside
			// "données".
			const firstTerm =
				(normalizeQuestion(slot).match(/[\p{L}\p{N}]{4,}/gu) ?? []).find(
					(term) =>
						!METRIC_SLOT_TERM.test(term) &&
						!/^(?:donne|donner|donnez|resume|resumer|recapitule|indique|indiquez|give|state|summarize|list)$/u.test(
							term
						)
				) ?? '';
			return [
				slot,
				facts
					.map((fact) => ({
						fact,
						exact:
							Math.max(queryCoverage(slot, fact.label), queryCoverage(expanded, fact.label)) +
							(firstTerm &&
							(normalizeQuestion(fact.label).match(/[\p{L}\p{N}]+/gu) ?? []).some(
								(token) => token === firstTerm
							)
								? 0.3
								: 0),
						score: Math.max(coverage(slot, fact.label), coverage(expanded, fact.label))
					}))
					.sort(
						(left, right) =>
							right.score + 0.5 * right.exact - (left.score + 0.5 * left.exact) ||
							left.fact.order - right.fact.order
					)
			] as const;
		})
	);
	const minimumScoreFor = (slot: string) =>
		/\b(?:construit|construction|periode|built)\b/u.test(normalizeQuestion(slot)) ? 0.2 : 0.3;
	const pairs = slots
		.flatMap((slot) =>
			rankedBySlot
				.get(slot)!
				.filter((candidate) => candidate.score >= minimumScoreFor(slot))
				.map((candidate) => ({ slot, ...candidate }))
		)
		.sort((left, right) => right.score + 0.5 * right.exact - (left.score + 0.5 * left.exact));
	const assignedSlots = new Set<string>();
	for (const pair of pairs) {
		if (assignedSlots.has(pair.slot) || chosen.some((current) => current.fact === pair.fact))
			continue;
		assignedSlots.add(pair.slot);
		chosen.push({ slot: pair.slot, fact: pair.fact, score: pair.score });
	}
	for (const slot of slots) {
		if (!assignedSlots.has(slot)) continue;
		const ranked = rankedBySlot.get(slot)!;
		if (/\b(?:quels|quelles|which|what)\b/u.test(normalizeQuestion(slot))) {
			const topChunkId = ranked[0].fact.hit.chunkId;
			for (const related of ranked
				.slice(1)
				.filter(
					(candidate) =>
						(candidate.score >= 0.24 ||
							(candidate.fact.hit.chunkId === topChunkId &&
								candidate.score >= 0.12 &&
								/^(?:oui|non|yes|no)$/u.test(normalizeQuestion(candidate.fact.value)))) &&
						!chosen.some((current) => current.fact === candidate.fact)
				)
				.slice(0, 4))
				chosen.push({ slot, ...related });
		}
		if (!/\b(?:dependance|outbuilding)\w*\b/u.test(normalizeQuestion(slot))) continue;
		const measurement = ranked
			.slice(1)
			.find(
				(candidate) =>
					candidate.score >= 0.3 &&
					/\d+(?:[.,]\d+)?\s*(?:m²|m2|m\b|€|%|ans?\b|years?\b)/iu.test(candidate.fact.value) &&
					!chosen.some((current) => current.fact === candidate.fact)
			);
		if (measurement) chosen.push({ slot, ...measurement });
		const categorical = ranked.find(
			(candidate) =>
				candidate.score >= 0.3 &&
				/^(?:oui|non|yes|no)$/u.test(normalizeQuestion(candidate.fact.value)) &&
				!chosen.some((current) => current.fact === candidate.fact)
		);
		if (categorical) chosen.push({ slot, ...categorical });
	}
	for (const current of [...chosen]) {
		if (!(
			/\b(?:actuel\w*|currently|current)\b/u.test(normalizeQuestion(current.fact.label)) &&
			/\b(?:oui|yes)\b/u.test(normalizeQuestion(current.fact.value))
		))
			continue;
		const duration = facts.find(
			(fact) =>
				fact.order > current.fact.order &&
				fact.order - current.fact.order <= 2 &&
				/\b(?:depuis combien|combien de temps|how long|duration)\b/u.test(
					normalizeQuestion(fact.label)
				)
		);
		if (duration) chosen.push({ slot: current.slot, fact: duration, score: 1 });
	}
	const unique = chosen.filter(
		(candidate, index, all) => all.findIndex((other) => other.fact === candidate.fact) === index
	);
	if (new Set(unique.map((candidate) => candidate.slot)).size < 2) return null;
	return unique
		.sort((left, right) => left.fact.order - right.fact.order)
		.map(
			({ fact }) =>
				`- ${fact.label.replace(/[?.]?$/u, '').trim()} : ${fact.value} ${citation(fact.hit, hits)}`
		)
		.join('\n');
}

const SMALL_NUMBER_VALUES: Readonly<Record<string, number>> = {
	zero: 0,
	un: 1,
	une: 1,
	one: 1,
	deux: 2,
	two: 2,
	trois: 3,
	three: 3,
	quatre: 4,
	four: 4,
	cinq: 5,
	five: 5,
	six: 6,
	sept: 7,
	seven: 7,
	huit: 8,
	eight: 8,
	neuf: 9,
	nine: 9,
	dix: 10,
	ten: 10,
	onze: 11,
	eleven: 11,
	douze: 12,
	twelve: 12
};

function smallNumber(value: string): number | null {
	const normalized = normalizeQuestion(value);
	if (/^\d+$/u.test(normalized)) return Number(normalized);
	return SMALL_NUMBER_VALUES[normalized] ?? null;
}

function buildDurationThresholdAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	const durationPattern = new RegExp(
		`\\b(\\d+|${Object.keys(SMALL_NUMBER_VALUES).join('|')})\\s*(mois|months?)\\b`,
		'gu'
	);
	const requested = [...normalized.matchAll(durationPattern)]
		.map((match) => ({ value: smallNumber(match[1]), unit: match[2] }))
		.filter((item): item is { value: number; unit: string } => item.value !== null);
	if (requested.length < 2) return null;
	const thresholdUnit = evidenceUnits(hits).find((unit) =>
		/\b(?:moins de|inferieur(?:e)? a|less than|under)\s+(?:\d+|\p{L}+)\s*(?:mois|months?)\b/iu.test(
			normalizeQuestion(unit.text)
		)
	);
	if (!thresholdUnit) return null;
	const thresholdMatch = new RegExp(
		`\\b(?:moins de|inferieur(?:e)? a|less than|under)\\s+(\\d+|${Object.keys(SMALL_NUMBER_VALUES).join('|')})\\s*(mois|months?)\\b`,
		'iu'
	).exec(normalizeQuestion(thresholdUnit.text));
	if (!thresholdMatch) return null;
	const threshold = smallNumber(thresholdMatch[1]);
	if (threshold === null) return null;
	const marker = citation(thresholdUnit.hit, hits);
	const locale = analyzeQuestion(question).locale;
	return requested
		.map(({ value, unit }) => {
			const covered = value < threshold;
			if (locale === 'fr')
				return `${value} ${unit} : ${covered ? 'oui, couvert' : 'non, pas couvert'} (la limite est strictement inférieure à ${threshold} mois) ${marker}.`;
			return `${value} ${unit}: ${covered ? 'yes, covered' : 'no, not covered'} (the limit is strictly less than ${threshold} months) ${marker}.`;
		})
		.join('\n');
}

function parseDecimal(value: string): number {
	return Number(value.replace(/\s/gu, '').replace(',', '.'));
}

function formatDecimal(value: number, locale: 'fr' | 'en'): string {
	return value.toFixed(2).replace('.', locale === 'fr' ? ',' : '.');
}

function buildArithmeticAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (!/\b(?:calcul|calcule|calculate|compute|font elles|do they equal)\b/u.test(normalized))
		return null;
	const countMatch = new RegExp(
		`\\b(\\d+|${Object.keys(SMALL_NUMBER_VALUES).join('|')})\\s+(?:mensualites?|versements?|paiements?|payments?|installments?)\\b`,
		'iu'
	).exec(normalized);
	const unitMatch =
		/(?:mensualites?|versements?|paiements?|payments?|installments?)[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*(?:€|euros?|eur\b)?/iu.exec(
			normalized
		);
	if (!countMatch || !unitMatch) return null;
	const count = smallNumber(countMatch[1]);
	if (count === null) return null;
	const unitAmount = parseDecimal(unitMatch[1]);
	const annual = evidenceUnits(hits)
		.map((unit) => ({
			unit,
			match:
				/\b(?:prime|cotisation)\s+annuelle[^\d]{0,30}(\d+(?:[.,]\d+)?)\s*(?:€|euros?|eur\b)/iu.exec(
					unit.text
				)
		}))
		.find((candidate) => candidate.match !== null);
	if (!annual?.match) return null;
	const annualAmount = parseDecimal(annual.match[1]);
	const calculated = count * unitAmount;
	const difference = Math.abs(annualAmount - calculated);
	const locale = analyzeQuestion(question).locale;
	const marker = citation(annual.unit.hit, hits);
	return locale === 'fr'
		? `${count} × ${formatDecimal(unitAmount, locale)} € = ${formatDecimal(calculated, locale)} €. La prime annuelle indiquée est ${formatDecimal(annualAmount, locale)} €. ${difference < 0.005 ? 'Les montants correspondent' : `Ils ne correspondent pas : l’écart est de ${formatDecimal(difference, locale)} €`} ${marker}.`
		: `${count} × ${formatDecimal(unitAmount, locale)} = ${formatDecimal(calculated, locale)}. The stated annual premium is ${formatDecimal(annualAmount, locale)}. ${difference < 0.005 ? 'The amounts match' : `They do not match: the difference is ${formatDecimal(difference, locale)}`} ${marker}.`;
}

function buildExactDateTimeAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (!/\bdate\b/u.test(normalized) || !/\b(?:heure|time)\b/u.test(normalized)) return null;
	const candidates = evidenceUnits(hits)
		.filter(
			(unit) =>
				/(?:\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}\s+\p{L}+\s+\d{4}\b)/iu.test(unit.text) &&
				/\b\d{1,2}\s*(?::|h)\s*\d{2}\b/iu.test(unit.text)
		)
		.map((unit) => ({ unit, score: coverage(question, unit.text) }))
		.sort((left, right) => right.score - left.score || left.unit.order - right.unit.order);
	if (!candidates[0] || candidates[0].score < 0.2) return null;
	return `${candidates[0].unit.text.trim()} ${citation(candidates[0].unit.hit, hits)}`;
}

function buildPercentageModifierAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (!/\b(?:major\w*|augment\w*|supplement\w*|pourcent\w*|percent)\b/u.test(normalized))
		return null;
	const candidates = evidenceUnits(hits)
		.filter((unit) => /\b\d+(?:[.,]\d+)?\s*%/u.test(unit.text))
		.map((unit) => ({ unit, score: coverage(question, unit.text) }))
		.sort((left, right) => right.score - left.score || left.unit.order - right.unit.order);
	if (!candidates[0] || candidates[0].score < 0.2) return null;
	return `${candidates[0].unit.text.trim()} ${citation(candidates[0].unit.hit, hits)}`;
}

function buildActionObligationsAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (
		!/(?:\bque (?:dois|devons|faut)[- ]?(?:je|nous|il)\b|\bwhat (?:should|must) (?:i|we) do\b)/u.test(
			normalized
		)
	)
		return null;
	const actionPattern =
		/\b(?:obligations?|tenu|avertiss\w*|alert\w*|signal\w*|prenez|prendre|fourniss\w*|devez|doit|notify|report|provide|must|required)\b/iu;
	const structuralPattern = /\b(?:obligations?|tenu|required|must)\b/iu;
	const anchors = hits
		.map((hit, order) => ({
			hit,
			order,
			score:
				coverage(question, hit.text) +
				(structuralPattern.test(hit.text) ? 0.8 : actionPattern.test(hit.text) ? 0.2 : 0)
		}))
		.filter(({ hit }) => actionPattern.test(hit.text))
		.sort((left, right) => right.score - left.score || left.order - right.order);
	if (!anchors[0] || anchors[0].score < 0.35) return null;
	const anchor = anchors[0].hit;
	const selected = hits
		.filter(
			(hit) =>
				hit.documentId === anchor.documentId &&
				hit.page === anchor.page &&
				actionPattern.test(hit.text) &&
				(anchor.seq === undefined || hit.seq === undefined || Math.abs(hit.seq - anchor.seq) <= 4)
		)
		.slice(0, 4);
	if (!selected.length) return null;
	return selected.map((hit) => `${hit.text.trim()} ${citation(hit, hits)}`).join('\n');
}

function buildEnumeratedEvidenceAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (
		!/\b(?:cite\w*|enumere\w*|liste\w*|list|enumerate)\b/u.test(normalized) &&
		!(
			/\b(?:principaux|principales|main)\b/u.test(normalized) &&
			/\b(?:types?|categories?|evenements?|events?|elements?|items?)\b/u.test(normalized)
		)
	)
		return null;
	const requestedCount = new RegExp(
		`\\b(\\d+|${Object.keys(SMALL_NUMBER_VALUES).join('|')})\\s+(?:types?|categories?|elements?|items?|evenements?|events?)\\b`,
		'iu'
	).exec(normalized);
	const minimumItems = requestedCount ? (smallNumber(requestedCount[1]) ?? 5) : 5;
	const candidates = hits
		.map((hit, order) => {
			const numbered = (hit.text.match(/(?:^|\n)\s*\d+[.)]?\s*/gu) ?? []).length;
			const bullets = (hit.text.match(/(?:^|\n)\s*[-•●✓✗!]\s+/gu) ?? []).length;
			const separated = (hit.text.match(/[,;]/gu) ?? []).length + 1;
			const items = Math.max(numbered, bullets, separated);
			return { hit, order, items, numbered, score: coverage(question, hit.text) };
		})
		.filter((candidate) =>
			requestedCount
				? candidate.numbered >= minimumItems
				: candidate.items >= Math.min(minimumItems, 5)
		)
		.sort(
			(left, right) =>
				Number(right.numbered >= minimumItems) - Number(left.numbered >= minimumItems) ||
				right.score - left.score ||
				right.items - left.items ||
				left.order - right.order
		);
	if (!candidates[0] || candidates[0].score < 0.18) return null;
	return `${candidates[0].hit.text.trim()} ${citation(candidates[0].hit, hits)}`;
}

function buildCoLocatedMultiFactAnswer(question: string, hits: SearchHit[]): string | null {
	const slots = splitQueryClauses(question);
	if (slots.length < 2) return null;
	const terminalTerms = slots.map(
		(slot) =>
			(normalizeQuestion(slot).match(/[\p{L}\p{N}]+/gu) ?? [])
				.filter((term) => term.length >= 4)
				.at(-1) ?? ''
	);
	const measurePattern = new RegExp(
		`\\b(?:\\d+|${Object.keys(SMALL_NUMBER_VALUES).join('|')})\\s*(?:\\(\\s*\\d+\\s*\\)\\s*)?(?:%|€|eur|jours?|mois|ans?|annees?|days?|months?|years?)\\b` +
			// Contact numbers and long identifiers are co-located values too.
			String.raw`|(?:\+?\d[\d  ]{7,}\d)`,
		'giu'
	);
	const candidates = hits
		.map((hit, order) => {
			const normalizedText = normalizeQuestion(hit.text);
			const covered = slots.filter((slot, index) =>
				terminalTerms[index].length >= 4
					? normalizedText.includes(terminalTerms[index])
					: coverage(slot, hit.text) >= 0.12
			).length;
			const measurements = new Set(hit.text.match(measurePattern) ?? []).size;
			return { hit, order, covered, measurements };
		})
		.filter(
			(candidate) =>
				candidate.covered === slots.length && candidate.measurements >= Math.min(2, slots.length)
		)
		.sort(
			(left, right) =>
				right.measurements - left.measurements ||
				right.hit.score - left.hit.score ||
				left.order - right.order
		);
	if (!candidates[0]) return null;
	return `${candidates[0].hit.text.trim()} ${citation(candidates[0].hit, hits)}`;
}

function buildConsequenceAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (!/\b(?:consequence|consequences|entraine\w*|result\w*|happens?|effect)\b/u.test(normalized))
		return null;
	const candidates = hits
		.map((hit, order) => ({ hit, order, score: coverage(question, hit.text) }))
		.filter(({ hit }) =>
			/\b(?:entraine\w*|consequence|results? in|leads? to)\b/u.test(normalizeQuestion(hit.text))
		)
		.sort((left, right) => right.score - left.score || left.order - right.order);
	if (!candidates[0] || candidates[0].score < 0.2) return null;
	const selected = candidates[0].hit;
	const continuation =
		selected.seq !== undefined && !/[.!?;:]$/u.test(selected.text.trim())
			? hits.find(
					(hit) =>
						hit.documentId === selected.documentId &&
						hit.seq !== undefined &&
						hit.seq === selected.seq! + 1
				)
			: undefined;
	return `${selected.text.trim()} ${citation(selected, hits)}${continuation ? `\n${continuation.text.trim()} ${citation(continuation, hits)}` : ''}`;
}

function buildExhaustiveQuantifiedFormAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (
		!/\b(?:tous|toutes|all|exhaustif|exhaustive)\b/u.test(normalized) ||
		!/\b(?:montant|plafond|limite|amount|limit)\w*\b/u.test(normalized)
	)
		return null;
	const facts = labelValueFacts(hits).filter((fact) =>
		/(?:\d[\d\s.,]*\s*(?:€|eur\b|euros?\b)|\billimit\w*\b|\bunlimited\b)/iu.test(fact.value)
	);
	const byPage = new Map<number, LabelValueFact[]>();
	for (const fact of facts) {
		if (fact.hit.page === null) continue;
		byPage.set(fact.hit.page, [...(byPage.get(fact.hit.page) ?? []), fact]);
	}
	const seed = [...byPage.entries()].sort(
		(left, right) => right[1].length - left[1].length || left[1][0].order - right[1][0].order
	)[0];
	if (!seed || seed[1].length < 2) return null;
	const selected = facts.filter(
		(fact) => fact.hit.page !== null && Math.abs(fact.hit.page - seed[0]) <= 1
	);
	if (selected.length < 4) return null;
	return selected
		.filter(
			(fact, index, all) =>
				all.findIndex(
					(candidate) => normalizeQuestion(candidate.label) === normalizeQuestion(fact.label)
				) === index
		)
		.map(
			(fact) =>
				`- ${fact.label.replace(/[?.]?$/u, '').trim()} : ${fact.value} ${citation(fact.hit, hits)}`
		)
		.join('\n');
}

function enumeratedQuestionSlots(question: string): string[] {
	const tail = question.replace(
		/^.*?\b(?:donne|donner|resume|resumer|recapitule|recapituler|compare|explain|give|summarize|recap)\b\s*/iu,
		''
	);
	return tail
		.split(/\s*,\s*|\s+(?:et|ainsi que|y compris|and|including)\s+/iu)
		.map((slot) => slot.replace(/[?.]+$/u, '').trim())
		.filter((slot) => significantSlot(slot));
}

function significantSlot(slot: string): boolean {
	return (normalizeQuestion(slot).match(/[\p{L}\p{N}]+/gu) ?? []).some(
		(token) => token.length >= 4
	);
}

/** Question words and bare metric nouns anchor nothing by themselves: they
 * describe WHAT to report about each requested subject, not a subject. */
const METRIC_SLOT_TERM =
	/^(?:quel|quels|quelle|quelles|what|which|combien|comment|how|much|many|long|temps|reponse|reponses|answer|answers|plafond|plafonds|limite|limites|montant|montants|duree|durees|delai|delais|jour|jours|mois|nuit|nuits|an|ans|annee|annees|heure|heures|semaine|semaines|amount|amounts|limit|limits|duration|durations|deadline|deadlines|day|days|month|months|year|years|night|nights|hour|hours|week|weeks)$/u;

function distinctiveSlotTerms(slot: string): string[] {
	return (normalizeQuestion(slot).match(/[\p{L}\p{N}]+/gu) ?? []).filter(
		(term) => term.length >= 4 && !METRIC_SLOT_TERM.test(term)
	);
}

function containsTermish(normalizedText: string, term: string): boolean {
	if (normalizedText.includes(term)) return true;
	if (term.length < 6) return false;
	const prefix = term.slice(0, 6);
	return (normalizedText.match(/[\p{L}\p{N}]+/gu) ?? []).some((token) => token.startsWith(prefix));
}

const MEASURE_NUMBER_PATTERN = String.raw`(?:\d[\d \u00a0.,]*|\b(?:un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|fifteen|twenty|thirty)\b)`;

const MEASURE_UNIT_BY_KIND = {
	money: String.raw`(?:€|eur\b|euros?\b)`,
	duration: String.raw`(?:jours?\b|mois\b|ans?\b|annees?\b|heures?\b|semaines?\b|nuits?\b|days?\b|months?\b|years?\b|hours?\b|weeks?\b|nights?\b)`,
	other: String.raw`%`
} as const;
type MeasureKind = keyof typeof MEASURE_UNIT_BY_KIND;

/** The measure kind a question requests: a "délai" is a duration, never a
 * neighboring price or deductible; a "plafond" is an amount. */
function requestedMeasureKinds(question: string): MeasureKind[] {
	const normalized = normalizeQuestion(question);
	const kinds: MeasureKind[] = [];
	if (
		/\b(?:delai|delais|duree|durees|prescription|preavis|combien de temps|how long|deadline)\b/u.test(
			normalized
		)
	)
		kinds.push('duration');
	if (
		/\b(?:plafond|plafonds|montant|montants|prix|prime|franchise|cout|couts|amount|price|premium|deductible|cost)\b/u.test(
			normalized
		)
	)
		kinds.push('money');
	return kinds;
}

/** Character positions of concrete measure values (amounts, durations). */
function measurePositions(normalizedText: string, kinds: readonly MeasureKind[] = []): number[] {
	const unitPattern =
		kinds.length === 1
			? MEASURE_UNIT_BY_KIND[kinds[0]]
			: `(?:${Object.values(MEASURE_UNIT_BY_KIND).join('|')})`;
	return [
		...normalizedText.matchAll(new RegExp(`${MEASURE_NUMBER_PATTERN}\\s*${unitPattern}`, 'giu'))
	].map((match) => match.index);
}

function termPositions(normalizedText: string, terms: readonly string[]): number[] {
	const positions: number[] = [];
	for (const term of terms) {
		let at = normalizedText.indexOf(term);
		while (at >= 0) {
			positions.push(at);
			at = normalizedText.indexOf(term, at + 1);
		}
		if (term.length >= 6) {
			const prefixPattern = new RegExp(String.raw`\b${term.slice(0, 6)}\p{L}*`, 'gu');
			for (const match of normalizedText.matchAll(prefixPattern)) positions.push(match.index);
		}
	}
	return positions;
}

/** How tightly the slot's subject binds to a measure inside the unit: 1 when a
 * value sits next to the subject word, approaching 0 as it drifts away. */
function measureBindingProximity(
	normalizedText: string,
	terms: readonly string[],
	kinds: readonly MeasureKind[] = []
): number {
	if (!terms.length) return 0;
	const measures = measurePositions(normalizedText, kinds);
	const anchors = termPositions(normalizedText, terms);
	if (!measures.length || !anchors.length) return 0;
	const distance = Math.min(
		...anchors.flatMap((anchor) => measures.map((measure) => Math.abs(measure - anchor)))
	);
	return 1 / (1 + distance / 60);
}

/** True when the unit's nearest measure to the slot subject lives inside an
 * exception clause (introduced by "toutefois", "par exception", …). */
function nearestMeasureInExceptionScope(
	normalizedText: string,
	terms: readonly string[],
	kinds: readonly MeasureKind[] = []
): boolean {
	const measures = measurePositions(normalizedText, kinds);
	const anchors = termPositions(normalizedText, terms);
	if (!measures.length) return false;
	const nearest = anchors.length
		? measures.reduce((best, measure) =>
				Math.min(...anchors.map((anchor) => Math.abs(measure - anchor))) <
				Math.min(...anchors.map((anchor) => Math.abs(best - anchor)))
					? measure
					: best
			)
		: measures[0];
	const preceding = normalizedText.slice(Math.max(0, nearest - 140), nearest);
	return /\b(?:toutefois|cependant|neanmoins|par exception|par derogation|portee? a|sauf|however|except|nevertheless)\b/u.test(
		preceding
	);
}

function buildMultiFactAnswer(question: string, hits: SearchHit[]): string | null {
	const slots = enumeratedQuestionSlots(question);
	const temporalPair =
		slots.length === 2 &&
		/\b(?:delai|preavis|conserve|retention|quand|when|deadline)\w*\b/u.test(
			normalizeQuestion(question)
		);
	if (slots.length < 3 && !temporalPair) return null;
	const factValue =
		/(?:\d|€|%|\b(?:oui|non|yes|no|illimit\w*|unlimited|jour|jours|mois|an|ans|annee|annees|day|days|month|months|year|years)\b)/iu;
	const units = evidenceUnits(hits).filter((unit) => factValue.test(normalizeQuestion(unit.text)));
	const measureKinds = requestedMeasureKinds(question);
	const slotsInfo = slots.map((slot) => ({ slot, distinctive: distinctiveSlotTerms(slot) }));
	// A slot made only of question/metric words ("Quels plafonds") qualifies the
	// anchored slots instead of demanding its own passage.
	const anchored = slotsInfo.filter((info) => info.distinctive.length > 0);
	const effectiveSlots = anchored.length >= 2 ? anchored : slotsInfo;
	const chosen: EvidenceUnit[] = [];
	let matchedSlots = 0;
	for (const info of effectiveSlots) {
		const slot = info.slot;
		const normalizedSlot = normalizeQuestion(slot);
		const requiresDate = /\b(?:date|prise d effet|effective date)\b/u.test(normalizedSlot);
		const requiresMoney =
			/\b(?:prix|prime|paiement|franchise|plafond|biens|relogement|responsabilite|amount|price|premium|payment|deductible|limit)\b/u.test(
				normalizedSlot
			);
		const generalRule = /\b(?:en general|in general|normalement|habituellement|par defaut)\b/u.test(
			normalizedSlot
		);
		const competitorTerms = effectiveSlots
			.filter((other) => other !== info)
			.flatMap((other) => other.distinctive)
			.filter((term) => !info.distinctive.includes(term));
		const terminalTerm =
			(normalizedSlot.match(/[\p{L}\p{N}]+/gu) ?? []).filter((term) => term.length >= 4).at(-1) ??
			'';
		const best = units
			.filter((unit) => {
				if (
					requiresDate &&
					!/(?:\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}\s+\p{L}+\s+\d{4}\b)/iu.test(unit.text)
				)
					return false;
				if (!requiresMoney) return true;
				const text = normalizeQuestion(unit.text);
				if (/\b(?:mensuel|par mois|monthly|per month)\b/u.test(normalizedSlot))
					return /(?:\d[\d\s.,]*\s*€.{0,80}\b(?:mois|mensuel)|\b(?:mois|mensuel).{0,80}\d[\d\s.,]*\s*€)/iu.test(
						unit.text
					);
				if (/\b(?:annuel|annuelle|annual|yearly)\b/u.test(normalizedSlot))
					return /(?:\b(?:annuel|annuelle|annual|yearly).{0,100}\d[\d\s.,]*\s*€|\d[\d\s.,]*\s*€.{0,100}\b(?:annuel|annuelle|annual|yearly))/iu.test(
						unit.text
					);
				const labelAt = terminalTerm ? text.lastIndexOf(terminalTerm) : -1;
				return labelAt >= 0 && /\d[\d\s.,]*\s*€/u.test(text.slice(labelAt, labelAt + 180));
			})
			.map((unit) => {
				const normalizedText = normalizeQuestion(unit.text);
				const numbers = unit.text.match(/\d+(?:[.,]\d+)?/gu)?.length ?? 0;
				// Periodicity slots ("le prix mensuel") anchor on the periodicity
				// word: the money filter above already proved the unit's relevance.
				const anchorTerms = [
					...distinctiveSlotTerms(expandedSlot(slot)),
					...(requiresMoney && /\b(?:mensuel|par mois|monthly|per month)\b/u.test(normalizedSlot)
						? ['mois', 'mensuel', 'monthly', 'month']
						: []),
					...(requiresMoney && /\b(?:annuel|annuelle|annual|yearly)\b/u.test(normalizedSlot)
						? ['annuel', 'annuelle', 'annual', 'yearly']
						: [])
				];
				const subjectPresent =
					!anchorTerms.length || anchorTerms.some((term) => containsTermish(normalizedText, term));
				const binding = measureBindingProximity(normalizedText, anchorTerms, measureKinds);
				const competitorBinding = measureBindingProximity(
					normalizedText,
					competitorTerms,
					measureKinds
				);
				return {
					unit,
					numbers,
					score:
						Math.max(coverage(slot, unit.text), coverage(expandedSlot(slot), unit.text)) +
						(/:\s*[^\n]{0,160}\d/u.test(unit.text) ? 0.06 : 0) +
						0.24 * binding -
						// A unit that only shares metric vocabulary ("délai", "plafond")
						// with the slot answers a different subject.
						(subjectPresent ? 0 : 0.22) -
						// Another requested subject sits closer to this unit's value:
						// the value belongs to that subject, not this slot.
						(competitorBinding > binding ? 0.25 : 0) -
						(generalRule &&
						nearestMeasureInExceptionScope(normalizedText, info.distinctive, measureKinds)
							? 0.3
							: 0)
				};
			})
			.sort(
				(left, right) =>
					right.score - left.score ||
					left.numbers - right.numbers ||
					left.unit.text.length - right.unit.text.length ||
					left.unit.order - right.unit.order
			)[0];
		if (!best || best.score < 0.18) continue;
		matchedSlots++;
		if (
			!chosen.some(
				(current) =>
					current.hit.chunkId === best.unit.hit.chunkId &&
					normalizeQuestion(current.text) === normalizeQuestion(best.unit.text)
			)
		)
			chosen.push(best.unit);
	}
	if (matchedSlots < effectiveSlots.length || !chosen.length) return null;
	return chosen
		.map((unit) => `${unit.text.replace(/^[-•●✓✗!]\s*/u, '').trim()} ${citation(unit.hit, hits)}`)
		.join('\n');
}

/** A question anchored to an explicit multi-digit value ("plus de 90 jours")
 * is answered by the clause carrying that exact value, plus its structural
 * continuation when the clause ends on an unfinished list or sentence. */
function buildNumberAnchoredAnswer(question: string, hits: SearchHit[]): string | null {
	const normalizedQuestion = normalizeQuestion(question);
	const anchor = /\b(\d{2,})\b/u.exec(normalizedQuestion)?.[1];
	if (!anchor) return null;
	// "Que dit l'article 110 …" anchors a SECTION REFERENCE, not a value. Those
	// are content questions: copying the clause that contains the number dumps
	// whichever chunk mentions it (often straddling the previous section).
	// Leave them to model synthesis. The \p{L} in "ar\p{L}icle" tolerates the
	// common OCR artifact on the t ("Arțicle").
	if (
		new RegExp(
			String.raw`\b(?:ar\p{L}icle|art|section|chapitre|chapter|clause|paragraphe|paragraph|annexe|annex|alinea|§)\s*\.?\s*${anchor}\b`,
			'iu'
		).test(normalizedQuestion)
	)
		return null;
	const candidates = evidenceUnits(hits)
		.filter((unit) => new RegExp(String.raw`\b${anchor}\b`, 'u').test(normalizeQuestion(unit.text)))
		.map((unit) => ({ unit, score: coverage(question, unit.text) }))
		.sort((left, right) => right.score - left.score || left.unit.order - right.unit.order);
	if (!candidates[0] || candidates[0].score < 0.3) return null;
	const selected = candidates[0].unit;
	let text = selected.text.replace(/^[-•●✓✗!]\s*/u, '').trim();
	let markers = citation(selected.hit, hits);
	if (/[:;,]$/u.test(text) || !/[.!?]$/u.test(text)) {
		const continuation = hits.find(
			(hit) =>
				hit.documentId === selected.hit.documentId &&
				hit.seq !== undefined &&
				selected.hit.seq !== undefined &&
				hit.seq === selected.hit.seq + 1
		);
		if (continuation) {
			text = `${text} ${continuation.text.trim()}`;
			markers += citation(continuation, hits);
		}
	}
	return `${text} ${markers}`;
}

function buildQualifiedMissingAttribute(question: string, hits: SearchHit[]): string | null {
	const normalizedQuestion = normalizeQuestion(question);
	const requested = /\b(?:nom|name)\b/u.test(normalizedQuestion)
		? { fr: 'le nom demandé', frSpecified: 'précisé', en: 'the requested name' }
		: /\b(?:marque|brand)\b/u.test(normalizedQuestion)
			? { fr: 'la marque demandée', frSpecified: 'précisée', en: 'the requested brand' }
			: /\b(?:objet precis|specific (?:object|item))\b/u.test(normalizedQuestion)
				? {
						fr: "l'objet précis demandé",
						frSpecified: 'précisé',
						en: 'the requested specific item'
					}
				: null;
	if (!requested) return null;
	const facts = labelValueFacts(hits)
		.map((fact) => ({ fact, score: coverage(question, `${fact.label} ${fact.value}`) }))
		.filter(
			({ fact, score }) =>
				score >= 0.25 &&
				/^(?:oui|non|yes|no)(?:\s|$)|\b(?:non ajoute|not added|absent|none)\b/u.test(
					normalizeQuestion(fact.value)
				)
		)
		.sort((left, right) => right.score - left.score || left.fact.order - right.fact.order);
	if (!facts[0]) return null;
	const { fact } = facts[0];
	return analyzeQuestion(question).locale === 'fr'
		? `${fact.label} : ${fact.value}. Cependant, ${requested.fr} n'est pas ${requested.frSpecified} dans les documents ${citation(fact.hit, hits)}.`
		: `${fact.label}: ${fact.value}. However, ${requested.en} is not specified in the documents ${citation(fact.hit, hits)}.`;
}

function buildScenarioAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (
		/^(?:a\s+)?(?:quel|quelle|quels|quelles|quand|combien|comment|cite|citer|donne|resume|recapitule|what|which|when|how)\b/u.test(
			normalized
		)
	)
		return null;
	if (
		!/\b(?:couvert|couverte|couverts|couverture|assure|assuree|eligible|covered|coverage|insured|eligible|fonctionne|applique|appliquent|valable|applies|apply|valid)\b/u.test(
			normalized
		)
	)
		return null;
	const queryTerms = (normalized.match(/[\p{L}\p{N}]+/gu) ?? []).filter(
		(term) => term.length >= 4 && !SCENARIO_STOPWORDS.has(term)
	);
	if (!queryTerms.length) return null;
	const units = evidenceUnits(hits).filter((unit) =>
		/\b(?:couvr\w*|assur\w*|eligible|pas couvert|non couvert|n est pas couvert|covered|insured|eligible|not covered|accord\w*|garanti\w*|s appliquent?|applique\w*|granted|applies)\b/u.test(
			normalizeQuestion(unit.text)
		)
	);
	const ranked = units
		.map((unit) => {
			const text = normalizeQuestion(unit.text);
			const matched = queryTerms.filter((term) => text.includes(term));
			const rareScore = matched.reduce((sum, term) => {
				const frequency = units.filter((candidate) =>
					normalizeQuestion(candidate.text).includes(term)
				).length;
				return sum + 1 / Math.max(1, frequency);
			}, 0);
			return {
				unit,
				matched: matched.length,
				complete: matched.length === queryTerms.length,
				score: rareScore + coverage(question, unit.text)
			};
		})
		.sort(
			(left, right) =>
				right.matched - left.matched ||
				Number(right.complete) - Number(left.complete) ||
				left.unit.text.length - right.unit.text.length ||
				right.score - left.score ||
				left.unit.order - right.unit.order
		);
	if (!ranked[0] || ranked[0].matched < Math.max(2, Math.ceil(queryTerms.length * 0.65)))
		return null;
	const selected = ranked[0].unit;
	let text = selected.text.replace(/^[-•●✓✗!]\s*/u, '').trim();
	let prefix = '';
	if (/^(?:\p{Ll}|\d)/u.test(text) && selected.hit.seq !== undefined) {
		const previous = hits.find(
			(hit) =>
				hit.documentId === selected.hit.documentId &&
				hit.seq !== undefined &&
				hit.seq === selected.hit.seq! - 1
		);
		if (previous && coverage(question, previous.text) >= 0.18) {
			prefix = `${previous.text.trim()} ${citation(previous, hits)}\n`;
		}
	}
	const condition = evidenceUnits([selected.hit]).find(
		(unit) =>
			unit.text !== selected.text &&
			/^(?:si vous souhaitez|pour (?:etre|être) couvert|if you (?:wish|want)|to be covered)\b/iu.test(
				normalizeQuestion(unit.text)
			)
	);
	if (!/[.!?;:]$/u.test(text) && selected.hit.seq !== undefined) {
		const continuation = hits.find(
			(hit) =>
				hit.documentId === selected.hit.documentId &&
				hit.seq !== undefined &&
				hit.seq === selected.hit.seq! + 1
		);
		if (continuation) {
			const firstSentence = continuation.text.trim().split(/(?<=[.!?;])\s+/u, 1)[0];
			text = `${text} ${firstSentence}`;
		}
	}
	const decision = `${prefix}${text.replace(/[.!?]?$/u, '')} ${citation(selected.hit, hits)}.`;
	if (!condition || normalizeQuestion(text).includes(normalizeQuestion(condition.text)))
		return decision;
	let conditionText = condition.text.trim();
	let conditionCitation = citation(condition.hit, hits);
	if (!/[.!?;:]$/u.test(conditionText) && condition.hit.seq !== undefined) {
		const continuation = hits.find(
			(hit) =>
				hit.documentId === condition.hit.documentId &&
				hit.seq !== undefined &&
				hit.seq === condition.hit.seq! + 1
		);
		if (continuation) {
			const firstSentence = continuation.text.trim().split(/(?<=[.!?;])\s+/u, 1)[0];
			conditionText = `${conditionText} ${firstSentence}`;
			conditionCitation += citation(continuation, hits);
		}
	}
	return `${decision}\n${conditionText.replace(/[.!?]?$/u, '')} ${conditionCitation}.`;
}

function buildListAnswer(question: string, hits: SearchHit[]): string | null {
	const normalized = normalizeQuestion(question);
	if (!/\b(?:droits?|rights?|obligations?|duties)\b/u.test(normalized)) return null;
	const units = evidenceUnits(hits)
		.filter((unit) => {
			const text = normalizeQuestion(unit.text);
			return (
				/^(?:[-•●✓✗!]\s*)/u.test(unit.text) &&
				coverage(question, unit.text) >= 0.18 &&
				/\b(?:droit|acceder|retirer|rectifier|supprimer|restreindre|obtenir|plainte|opposer|access|withdraw|rectif|delete|restrict|obtain|complain|object)\w*\b/u.test(
					text
				)
			);
		})
		.filter((unit, index, all) => {
			const normalizedUnit = normalizeQuestion(unit.text);
			return (
				all.findIndex((candidate) => {
					const normalizedCandidate = normalizeQuestion(candidate.text);
					return (
						normalizedCandidate === normalizedUnit ||
						(index > all.indexOf(candidate) &&
							Math.min(normalizedCandidate.length, normalizedUnit.length) >= 40 &&
							(normalizedCandidate.includes(normalizedUnit) ||
								normalizedUnit.includes(normalizedCandidate)))
					);
				}) === index
			);
		})
		.slice(0, 12);
	const opposition = evidenceUnits(hits).find((unit) =>
		/\b(?:droit de vous opposer|right to object)\b/u.test(normalizeQuestion(unit.text))
	);
	if (opposition && !units.some((unit) => unit.hit.chunkId === opposition.hit.chunkId))
		units.push(opposition);
	if (units.length < 3) return null;
	return units
		.map((unit) => {
			let text = unit.text.replace(/^[-•●✓✗!]\s*/u, '').trim();
			if (!/[.!?;:]$/u.test(text)) {
				const completeOpposition =
					/(?:vous avez le droit de vous opposer au traitement de vos données personnelles|you have the right to object to the processing of your personal data)/iu.exec(
						text
					)?.[0];
				if (completeOpposition) text = completeOpposition;
			}
			return `- ${text} ${citation(unit.hit, hits)}`;
		})
		.join('\n');
}

function buildNumberedExplanation(question: string, hits: SearchHit[]): string | null {
	const analysis = analyzeQuestion(question);
	const queryNumbers = normalizeQuestion(question).match(/\b\d+(?:[.,]\d+)?\b/gu) ?? [];
	if (analysis.answerShape !== 'explanation' || !queryNumbers.length) return null;
	const clauses = splitQueryClauses(question);
	const views = clauses.length ? clauses : [question];
	const units = evidenceUnits(hits);
	const selected: EvidenceUnit[] = [];
	for (const view of views) {
		const best = [...units].sort(
			(left, right) =>
				coverage(view, right.text) - coverage(view, left.text) || left.order - right.order
		)[0];
		if (best && coverage(view, best.text) >= 0.2) selected.push(best);
	}
	const constrainedHits = hits.filter((hit) =>
		queryNumbers.every((number) => normalizeQuestion(hit.text).includes(number))
	);
	for (const anchor of constrainedHits.slice(0, 2)) {
		const continuation = hits.find(
			(hit) =>
				hit.documentId === anchor.documentId &&
				hit.page === anchor.page &&
				hit.seq !== undefined &&
				anchor.seq !== undefined &&
				hit.seq > anchor.seq &&
				hit.seq - anchor.seq <= 2 &&
				/^(?:ce|cet|cette|ces|seulement|si|lorsque|apres|toutefois|mais)\b/u.test(
					normalizeQuestion(hit.text)
				)
		);
		if (continuation)
			selected.push({
				hit: continuation,
				text: continuation.text,
				order: hits.indexOf(continuation)
			});
	}
	const unique = selected.filter(
		(unit, index, all) =>
			all.findIndex((candidate) => candidate.hit.chunkId === unit.hit.chunkId) === index
	);
	if (unique.length < 2) return null;
	return unique
		.slice(0, 4)
		.map((unit, index) => {
			let text = unit.text.trim().replace(/^[\p{Ll}\d][^.!?]{0,80}\?\s+(?=\p{Lu})/u, '');
			if (!/[.!?;:]$/u.test(text)) {
				const lastComplete = Math.max(
					text.lastIndexOf('.'),
					text.lastIndexOf('!'),
					text.lastIndexOf('?'),
					text.lastIndexOf(';')
				);
				if (lastComplete >= text.length * 0.45) text = text.slice(0, lastComplete + 1);
			}
			return `${index + 1}. ${text} ${citation(unit.hit, hits)}`;
		})
		.join('\n');
}

/** High-confidence non-generative answer path for deterministic document
 * structures. Returns null when free-form synthesis remains necessary. */
const EXTRACTIVE_BUILDERS: ReadonlyArray<
	[string, (question: string, hits: SearchHit[]) => string | null]
> = [
	['qualified-missing-attribute', buildQualifiedMissingAttribute],
	['comparison', buildComparisonAnswer],
	['arithmetic', buildArithmeticAnswer],
	['duration-threshold', buildDurationThresholdAnswer],
	['exact-date-time', buildExactDateTimeAnswer],
	['percentage-modifier', buildPercentageModifierAnswer],
	['action-obligations', buildActionObligationsAnswer],
	['enumerated-evidence', buildEnumeratedEvidenceAnswer],
	['co-located-multi-fact', buildCoLocatedMultiFactAnswer],
	['consequence', buildConsequenceAnswer],
	['exhaustive-quantified-form', buildExhaustiveQuantifiedFormAnswer],
	['form', buildFormAnswer],
	['multi-fact', buildMultiFactAnswer],
	['list', buildListAnswer],
	['numbered-explanation', buildNumberedExplanation],
	['number-anchored', buildNumberAnchoredAnswer],
	['scenario', buildScenarioAnswer]
];

export function buildDeterministicExtractiveAnswer(
	question: string,
	hits: SearchHit[]
): string | null {
	return explainDeterministicExtractiveAnswer(question, hits)?.answer ?? null;
}

/** Extractors that SELECT one clause among lexically plausible neighbors can
 * bind the right-looking clause to the wrong subject; their output is a draft
 * that grounded verification must audit. Exact-copy/calculation extractors
 * (arithmetic, exact date, thresholds, form rows) are reliable by construction
 * and must never be paraphrased by a model pass — measured on the private
 * benchmark: auditing selection extractors fixed 8 wrong bindings with zero
 * losses, while auditing exact-copy extractors broke 8 correct answers. */
const AUDITED_EXTRACTIVE_BUILDERS = new Set([
	'multi-fact',
	'co-located-multi-fact',
	'percentage-modifier',
	'enumerated-evidence'
]);

/** Deterministic extract plus whether grounded verification must audit it. */
export function buildAuditedExtractiveAnswer(
	question: string,
	hits: SearchHit[]
): { answer: string; needsAudit: boolean } | null {
	const result = explainDeterministicExtractiveAnswer(question, hits);
	if (!result) return null;
	return { answer: result.answer, needsAudit: AUDITED_EXTRACTIVE_BUILDERS.has(result.builder) };
}

/** Benchmark diagnostics: which extractor produced the answer. */
export function explainDeterministicExtractiveAnswer(
	question: string,
	hits: SearchHit[]
): { builder: string; answer: string } | null {
	if (!hits.length) return null;
	for (const [builder, build] of EXTRACTIVE_BUILDERS) {
		const answer = build(question, hits);
		if (answer !== null) return { builder, answer };
	}
	return null;
}

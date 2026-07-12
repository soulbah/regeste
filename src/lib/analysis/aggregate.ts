import { extractMoneyCandidates, requestedMoneyKind, type MoneyCandidate } from './money';
import type { QuestionRoute, SearchHit } from '$lib/types';

export const FACT_EXTRACTOR_VERSION = 'money-v1';

export interface DocumentMoneyFact extends MoneyCandidate {
	documentId: string;
	documentName: string;
	chunkId: number;
	page: number | null;
	headingPath: string | null;
	text: string;
}

export interface AggregateResult {
	operation: 'sum' | 'average' | 'minimum' | 'maximum' | 'count';
	facts: DocumentMoneyFact[];
	ambiguousDocuments: string[];
	groups: Array<{ currency: string; valueMinor: number; count: number }>;
}

function operationFromQuestion(question: string): AggregateResult['operation'] {
	if (/\b(moyenne|average)\b/i.test(question)) return 'average';
	if (/\b(minimum|min(?:imum)?)\b/i.test(question)) return 'minimum';
	if (/\b(maximum|max(?:imum)?)\b/i.test(question)) return 'maximum';
	if (/\b(combien de|nombre|count)\b/i.test(question)) return 'count';
	return 'sum';
}

export function aggregateMoney(question: string, chunks: SearchHit[]): AggregateResult {
	const candidates = chunks.flatMap((chunk) =>
		extractMoneyCandidates(chunk.text).map((candidate) => ({
			...candidate,
			documentId: chunk.documentId,
			documentName: chunk.documentName,
			chunkId: chunk.chunkId,
			page: chunk.page,
			headingPath: chunk.headingPath,
			text: chunk.text
		}))
	);
	return aggregateMoneyFacts(question, candidates);
}

export function aggregateMoneyFacts(
	question: string,
	candidates: DocumentMoneyFact[]
): AggregateResult {
	const requested = requestedMoneyKind(question);
	const operation = operationFromQuestion(question);
	const byDocument = new Map<string, DocumentMoneyFact[]>();
	for (const candidate of candidates) {
		const list = byDocument.get(candidate.documentId) ?? [];
		list.push(candidate);
		byDocument.set(candidate.documentId, list);
	}
	const facts: DocumentMoneyFact[] = [];
	const ambiguousDocuments: string[] = [];
	for (const documentCandidates of byDocument.values()) {
		const desired = requested
			? documentCandidates.filter((candidate) => candidate.kind === requested)
			: (['total_ttc', 'total', 'subtotal']
					.map((kind) => documentCandidates.filter((candidate) => candidate.kind === kind))
					.find((items) => items.length > 0) ?? []);
		const distinct = desired.filter(
			(item, index, all) =>
				all.findIndex(
					(other) => other.valueMinor === item.valueMinor && other.currency === item.currency
				) === index
		);
		if (distinct.length !== 1) {
			ambiguousDocuments.push(documentCandidates[0].documentName);
			continue;
		}
		facts.push(distinct[0]);
	}
	const currencies = new Map<string, number[]>();
	for (const fact of facts) {
		const values = currencies.get(fact.currency) ?? [];
		values.push(fact.valueMinor);
		currencies.set(fact.currency, values);
	}
	const groups = [...currencies].map(([currency, values]) => {
		let valueMinor: number;
		if (operation === 'count') valueMinor = values.length * 100;
		else if (operation === 'average')
			valueMinor = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
		else if (operation === 'minimum') valueMinor = Math.min(...values);
		else if (operation === 'maximum') valueMinor = Math.max(...values);
		else valueMinor = values.reduce((a, b) => a + b, 0);
		return { currency, valueMinor, count: values.length };
	});
	return { operation, facts, ambiguousDocuments, groups };
}

export function isAggregateRoute(route: QuestionRoute): route is 'aggregate' {
	return route === 'aggregate';
}

import { extractFinancialRecords, type FinancialRecordFact } from './financial-records';
import { requestedMoneyKind, type MoneyKind } from './money';
import { analyzeQuestion, type AggregateOperation, type TemporalScope } from './query-router';
import type { QuestionRoute, SearchHit } from '$lib/types';

export const FACT_EXTRACTOR_VERSION = 'money-v2';

export type DocumentMoneyFact = FinancialRecordFact;

export interface AggregateResult {
	operation: AggregateOperation;
	facts: DocumentMoneyFact[];
	ambiguousDocuments: string[];
	ambiguousRecords: string[];
	groups: Array<{ currency: string; valueMinor: number; count: number }>;
	recordsMatched: number;
	count: number;
}

function matchesTemporal(date: string | null, scope: TemporalScope | null): boolean {
	if (!scope) return true;
	if (!date) return false;
	if (scope.start && date < scope.start) return false;
	if (scope.end && date > scope.end) return false;
	const [year, month] = date.split('-').map(Number);
	if (scope.year !== null && year !== scope.year) return false;
	if (scope.month !== null && month !== scope.month) return false;
	return true;
}

function factRecordKey(fact: DocumentMoneyFact): string {
	return fact.recordKey || `${fact.documentId}:${fact.page ?? fact.headingPath ?? fact.chunkId}`;
}

function representative(facts: DocumentMoneyFact[]): DocumentMoneyFact | null {
	for (const kind of [
		'sent',
		'total_ttc',
		'debited',
		'total',
		'amount',
		'received',
		'fee'
	] as MoneyKind[]) {
		const found = facts.find((fact) => fact.kind === kind);
		if (found) return found;
	}
	return facts[0] ?? null;
}

export function aggregateMoney(question: string, chunks: SearchHit[]): AggregateResult {
	return aggregateMoneyFacts(
		question,
		extractFinancialRecords(chunks).flatMap((record) => record.facts)
	);
}

export function aggregateMoneyFacts(
	question: string,
	candidates: DocumentMoneyFact[]
): AggregateResult {
	const analysis = analyzeQuestion(question);
	const requested = analysis.moneyRole ?? requestedMoneyKind(question);
	const operation = analysis.operation ?? 'sum';
	const byRecord = new Map<string, DocumentMoneyFact[]>();
	for (const candidate of candidates) {
		if (!matchesTemporal(candidate.recordDate, analysis.temporal)) continue;
		const key = factRecordKey(candidate);
		const list = byRecord.get(key) ?? [];
		list.push(candidate);
		byRecord.set(key, list);
	}

	const facts: DocumentMoneyFact[] = [];
	const ambiguousRecords: string[] = [];
	const ambiguousDocuments = new Set<string>();
	for (const [recordKey, recordCandidates] of byRecord) {
		if (operation === 'count' && !requested) {
			const selected = representative(recordCandidates);
			if (selected) facts.push(selected);
			continue;
		}
		let desired: DocumentMoneyFact[];
		if (requested) {
			desired = recordCandidates.filter((candidate) => candidate.kind === requested);
		} else {
			desired =
				(['total_ttc', 'total', 'subtotal', 'amount'] as MoneyKind[])
					.map((kind) => recordCandidates.filter((candidate) => candidate.kind === kind))
					.find((items) => items.length > 0) ?? [];
			if (!desired.length) {
				const roles = new Set(recordCandidates.map((candidate) => candidate.kind));
				if (roles.size === 1) desired = recordCandidates;
			}
		}
		const distinct = desired.filter(
			(item, index, all) =>
				all.findIndex(
					(other) =>
						other.valueMinor === item.valueMinor &&
						other.currency === item.currency &&
						other.kind === item.kind
				) === index
		);
		if (distinct.length !== 1) {
			if (desired.length || (!requested && recordCandidates.length > 1)) {
				ambiguousRecords.push(recordKey);
				ambiguousDocuments.add(recordCandidates[0].documentName);
			}
			continue;
		}
		facts.push(distinct[0]);
	}

	const currencies = new Map<string, DocumentMoneyFact[]>();
	for (const fact of facts) {
		const values = currencies.get(fact.currency) ?? [];
		values.push(fact);
		currencies.set(fact.currency, values);
	}
	const groups =
		operation === 'count'
			? []
			: [...currencies].map(([currency, values]) => {
					const amounts = values.map((fact) => fact.valueMinor);
					let valueMinor: number;
					if (operation === 'average')
						valueMinor = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
					else if (operation === 'minimum') valueMinor = Math.min(...amounts);
					else if (operation === 'maximum') valueMinor = Math.max(...amounts);
					else valueMinor = amounts.reduce((a, b) => a + b, 0);
					return { currency, valueMinor, count: values.length };
				});

	return {
		operation,
		facts,
		ambiguousDocuments: [...ambiguousDocuments],
		ambiguousRecords,
		groups,
		recordsMatched: byRecord.size,
		count: facts.length
	};
}

export function isAggregateRoute(route: QuestionRoute): route is 'aggregate' {
	return route === 'aggregate';
}

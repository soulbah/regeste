import { extractMoneyCandidates, type MoneyCandidate, type MoneyKind } from './money';
import { normalizeQuestion } from './query-router';
import type { SearchHit } from '$lib/types';
import { reliableForExactAnalytics } from '$lib/pipeline/ocr-quality';
import {
	parseScheduleRows,
	scheduleInstallmentColumn,
	type ScheduleRow
} from '$lib/pipeline/retrieval';

export interface FinancialRecordFact extends MoneyCandidate {
	documentId: string;
	documentName: string;
	chunkId: number;
	page: number | null;
	headingPath: string | null;
	text: string;
	recordKey: string;
	recordDate: string | null;
	recordId: string | null;
}

/** One cell of a table row, under the column name the header gave it. */
export interface RecordColumn {
	label: string;
	/** As written in the document, for citing. */
	literal: string;
	valueMinor: number;
	currency: string;
}

export interface FinancialRecord {
	key: string;
	documentId: string;
	documentName: string;
	date: string | null;
	id: string | null;
	page: number | null;
	headingPath: string | null;
	facts: FinancialRecordFact[];
	/**
	 * Every named column of this row, when it came from a table whose header was
	 * identified. Kept apart from `facts` on purpose: the aggregate path picks one
	 * representative fact per record, so adding four more facts there would
	 * silently change which column a total sums.
	 */
	columns?: RecordColumn[];
}

/** Split "Intérêts: 18,46 | Capital amorti: 50,93" back into named cells.
 * Cells the layout stage could not name carry no colon and are skipped. */
export function parseLabelledCells(context: string): Array<{ label: string; value: string }> {
	return context.split('|').flatMap((cell) => {
		const match = /^\s*([^:]{1,60}?)\s*:\s*(\S.*?)\s*$/u.exec(cell);
		return match ? [{ label: match[1], value: match[2] }] : [];
	});
}

const AMOUNT_CELL = /^\d[\d\s]*,\d{2}$/u;

function amountMinor(literal: string): number | null {
	const value = Number(literal.replace(/[^\d,]/gu, '').replace(',', ''));
	return Number.isFinite(value) ? value : null;
}

const MONTHS: Record<string, number> = {
	janvier: 1,
	january: 1,
	fevrier: 2,
	february: 2,
	mars: 3,
	march: 3,
	avril: 4,
	april: 4,
	mai: 5,
	may: 5,
	juin: 6,
	june: 6,
	juillet: 7,
	july: 7,
	aout: 8,
	august: 8,
	septembre: 9,
	september: 9,
	octobre: 10,
	october: 10,
	novembre: 11,
	november: 11,
	decembre: 12,
	december: 12
};

function validIso(day: number, month: number, year: number): string | null {
	if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function extractRecordDate(text: string): string | null {
	const q = normalizeQuestion(text);
	const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(q);
	if (numeric) return validIso(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
	for (const [name, month] of Object.entries(MONTHS)) {
		const match = new RegExp(`\\b(\\d{1,2})\\s+${name}\\s+(\\d{4})\\b`).exec(q);
		if (match) return validIso(Number(match[1]), month, Number(match[2]));
	}
	return null;
}

export function extractRecordId(text: string): string | null {
	const labeled =
		/\b(?:n[°o]|no|numero|reference|ref|id)\s*[:#-]?\s*([A-Z]{0,5}-[A-Z0-9-]{4,})\b/i.exec(
			text
		)?.[1];
	if (labeled) return labeled.toUpperCase();
	return /\b(?:T|TX|TRX|INV|FACT|REC)-[A-Z0-9-]{4,}\b/i.exec(text)?.[0].toUpperCase() ?? null;
}

function splitRecordSegments(text: string): string[] {
	const segments = text
		.split(
			/(?=^(?:transaction|transfert|transfer|facture|invoice|re[cç]u|receipt)\b.*(?:[A-Z0-9]|$))/gim
		)
		.map((part) => part.trim())
		.filter(Boolean);
	return segments.length ? segments : [text];
}

function locationKey(hit: SearchHit): string {
	if (hit.page !== null) return `page:${hit.page}`;
	if (hit.headingPath) return `heading:${hit.headingPath}`;
	return `chunk:${hit.chunkId}`;
}

function contextualKind(kind: MoneyKind, context: string): MoneyKind {
	const transfer =
		/\b(expediteur|beneficiaire|transfert|transaction|sender|recipient|beneficiary|exchange rate|taux de change)\b/.test(
			normalizeQuestion(context)
		);
	if (!transfer) return kind;
	if (kind === 'amount') return 'sent';
	if (kind === 'total') return 'debited';
	return kind;
}

/** Amortization-schedule rows as one record per installment. The bare row
 * amounts carry no currency symbol, so the generic money extractor never sees
 * them; the installment column is the one whose value repeats across rows
 * (the same analysis the ordinal answer gate uses). Guarded hard: at least a
 * dozen rows document-wide, a clear repeating column, and a euro mention
 * somewhere in the document — otherwise no records, and the aggregate path
 * behaves exactly as before. */
export function extractScheduleRecords(chunks: SearchHit[]): FinancialRecord[] {
	const byDocument = new Map<string, SearchHit[]>();
	for (const chunk of chunks) {
		if (!reliableForExactAnalytics(chunk)) continue;
		const list = byDocument.get(chunk.documentId) ?? [];
		list.push(chunk);
		byDocument.set(chunk.documentId, list);
	}
	const records: FinancialRecord[] = [];
	for (const documentChunks of byDocument.values()) {
		if (!documentChunks.some((chunk) => /€|\beuros?\b/iu.test(chunk.text))) continue;
		const rows: Array<{ row: ScheduleRow; chunk: SearchHit }> = [];
		for (const chunk of documentChunks) {
			for (const row of parseScheduleRows(chunk.text)) rows.push({ row, chunk });
		}
		if (rows.length < 12) continue;
		const column = scheduleInstallmentColumn(rows.map((entry) => entry.row));
		if (column === null) continue;
		for (const { row, chunk } of rows) {
			const literal = row.amounts[column];
			const valueMinor = Number(literal.replace(/[^\d,]/gu, '').replace(',', ''));
			if (!Number.isFinite(valueMinor)) continue;
			const recordKey = `${chunk.documentId}:schedule:${row.dateIso}`;
			// A chunk can hold several rows, so pair each with the labelled line
			// that carries its own date rather than trusting their order.
			const [year, month, day] = row.dateIso.split('-');
			const written = `${day}.${month}.${year}`;
			const labelled = (chunk.structuralContext ?? '')
				.split('\n')
				.find((line) => line.includes(written));
			const columns: RecordColumn[] = labelled
				? parseLabelledCells(labelled).flatMap((cell) => {
						if (!AMOUNT_CELL.test(cell.value)) return [];
						const minor = amountMinor(cell.value);
						return minor === null
							? []
							: [{ label: cell.label, literal: cell.value, valueMinor: minor, currency: 'EUR' }];
					})
				: [];
			records.push({
				key: recordKey,
				documentId: chunk.documentId,
				documentName: chunk.documentName,
				date: row.dateIso,
				id: null,
				page: chunk.page,
				headingPath: chunk.headingPath,
				facts: [
					{
						kind: 'amount',
						label: 'échéance',
						valueMinor,
						currency: 'EUR',
						confidence: 0.95,
						documentId: chunk.documentId,
						documentName: chunk.documentName,
						chunkId: chunk.chunkId,
						page: chunk.page,
						headingPath: chunk.headingPath,
						text: chunk.text,
						recordKey,
						recordDate: row.dateIso,
						recordId: null
					}
				],
				...(columns.length ? { columns } : {})
			});
		}
	}
	return records;
}

/** Build stable records without relying on provider-specific page templates. */
export function extractFinancialRecords(chunks: SearchHit[]): FinancialRecord[] {
	const locations = new Map<string, SearchHit[]>();
	for (const chunk of chunks) {
		if (!reliableForExactAnalytics(chunk)) continue;
		const key = `${chunk.documentId}:${locationKey(chunk)}`;
		const list = locations.get(key) ?? [];
		list.push(chunk);
		locations.set(key, list);
	}

	const records = new Map<string, FinancialRecord>();
	for (const locationChunks of locations.values()) {
		locationChunks.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
		const combined = locationChunks.map((chunk) => chunk.text).join('\n');
		const combinedDates = [
			...new Set(locationChunks.map((chunk) => extractRecordDate(chunk.text)).filter(Boolean))
		];
		const combinedIds = [
			...new Set(locationChunks.map((chunk) => extractRecordId(chunk.text)).filter(Boolean))
		];
		for (const chunk of locationChunks) {
			const segments = splitRecordSegments(chunk.text);
			for (const [segmentIndex, segment] of segments.entries()) {
				const candidates = extractMoneyCandidates(segment);
				if (!candidates.length) continue;
				const recordDate =
					extractRecordDate(segment) ?? (combinedDates.length === 1 ? combinedDates[0]! : null);
				const recordId =
					extractRecordId(segment) ?? (combinedIds.length === 1 ? combinedIds[0]! : null);
				const fallback = `${chunk.documentId}:${locationKey(chunk)}:${segmentIndex}`;
				const recordKey = recordId
					? `${chunk.documentId}:id:${recordId}`
					: recordDate
						? `${fallback}:date:${recordDate}`
						: fallback;
				const record = records.get(recordKey) ?? {
					key: recordKey,
					documentId: chunk.documentId,
					documentName: chunk.documentName,
					date: recordDate,
					id: recordId,
					page: chunk.page,
					headingPath: chunk.headingPath,
					facts: []
				};
				for (const candidate of candidates) {
					const fact: FinancialRecordFact = {
						...candidate,
						kind: contextualKind(candidate.kind, combined),
						documentId: chunk.documentId,
						documentName: chunk.documentName,
						chunkId: chunk.chunkId,
						page: chunk.page,
						headingPath: chunk.headingPath,
						text: chunk.text,
						recordKey,
						recordDate,
						recordId
					};
					if (
						!record.facts.some(
							(existing) =>
								existing.kind === fact.kind &&
								existing.currency === fact.currency &&
								existing.valueMinor === fact.valueMinor
						)
					) {
						record.facts.push(fact);
					}
				}
				records.set(recordKey, record);
			}
		}
	}
	return [...records.values(), ...extractScheduleRecords(chunks)];
}

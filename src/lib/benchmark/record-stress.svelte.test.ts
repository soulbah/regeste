import { describe, expect, it } from 'vitest';
import { aggregateMoney } from '$lib/analysis/aggregate';
import { extractFinancialRecords } from '$lib/analysis/financial-records';
import { chunkBlocks } from '$lib/pipeline/chunk';
import { parseByName } from '$lib/pipeline/parse';
import type { SearchHit } from '$lib/types';

async function fixtureHits(url: string, name: string, mime: string): Promise<SearchHit[]> {
	const response = await fetch(url);
	const parsed = await parseByName(name, mime, await response.arrayBuffer());
	return chunkBlocks(parsed.blocks, name).map((chunk, index) => ({
		chunkId: index + 1,
		documentId: name,
		documentName: name,
		text: chunk.text,
		seq: chunk.seq,
		page: chunk.page,
		headingPath: chunk.headingPath,
		score: 1
	}));
}

describe('generated record stress documents', () => {
	it.each([
		['/dev/record-stress/repeated-transfers.pdf', 'repeated-transfers.pdf', 'application/pdf'],
		[
			'/dev/record-stress/repeated-transfers.docx',
			'repeated-transfers.docx',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		],
		['/dev/record-stress/repeated-transfers.txt', 'repeated-transfers.txt', 'text/plain']
	])('parses every record and calculates June correctly from %s', async (url, name, mime) => {
		const hits = await fixtureHits(url, name, mime);
		const records = extractFinancialRecords(hits);
		expect(records).toHaveLength(7);
		const result = aggregateMoney('Quelle est la somme totale envoyée en juin ?', hits);
		expect(result.groups).toEqual([{ currency: 'EUR', valueMinor: 32000, count: 3 }]);
		expect(result.facts).toHaveLength(3);
		if (name.endsWith('.pdf')) expect(result.facts.map((fact) => fact.page)).toEqual([1, 2, 3]);
	});
});

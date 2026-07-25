import { describe, expect, it } from 'vitest';
import {
	appendPrivateRunResult,
	buildConsolidatedReport,
	compactPrivateRunResult,
	humanReviewSummary,
	loadGenerationCache,
	loadPrivateRunCheckpoint,
	privateGenerationCacheKey,
	remainingCheckpointCases,
	saveGenerationCache,
	savePrivateRunCheckpoint,
	type PrivateRunCheckpoint
} from './private-run-cache';

function memoryStorage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value)
	};
}

describe('private benchmark run persistence', () => {
	it('invalidates generation cache when evidence or model changes', async () => {
		const base = {
			model: 'model-a',
			documentHash: 'document',
			retrievalVersion: 12,
			question: 'Question?',
			route: 'targeted' as const,
			options: { maxTokens: 160 },
			messages: [{ role: 'user', content: 'Evidence A' }]
		};
		const key = await privateGenerationCacheKey(base);
		expect(await privateGenerationCacheKey(base)).toBe(key);
		expect(await privateGenerationCacheKey({ ...base, model: 'model-b' })).not.toBe(key);
		expect(
			await privateGenerationCacheKey({
				...base,
				messages: [{ role: 'user', content: 'Evidence B' }]
			})
		).not.toBe(key);
	});

	it('persists exact generations and resumable human review', () => {
		const storage = memoryStorage();
		const cache = new Map([['key', 'answer']]);
		saveGenerationCache(storage, cache);
		expect(loadGenerationCache(storage)).toEqual(cache);

		const checkpoint: PrivateRunCheckpoint = {
			version: 1,
			runId: 'run',
			documentName: 'local.pdf',
			documentHash: 'hash',
			retrievalVersion: 12,
			model: 'model',
			total: 1,
			completed: 1,
			startedAt: 1,
			updatedAt: 2,
			results: [
				compactPrivateRunResult({
					id: 'one',
					question: 'Question?',
					expectedOutcome: 'answer',
					route: 'targeted',
					passed: true,
					retrievalPassed: true,
					pageRecallPassed: true,
					answerGroupTriagePassed: true,
					answerPassed: true,
					citationPassed: true,
					answerBearing: true,
					alternateQueries: [],
					retrievedPages: [1],
					retrievedEvidence: [{ page: 1, text: 'evidence' }],
					rawRetrievedPages: [1],
					rawRetrievedEvidence: [{ page: 1, text: 'x'.repeat(900) }],
					citedPages: [1],
					missingPageGroups: [],
					missingAnswerGroups: [],
					unexpectedAnswerGroups: [],
					answer: 'answer [1]',
					answerSource: 'llm',
					generationSkipped: false,
					retrievalMs: 1,
					generationMs: 2
				})
			],
			humanReviews: {
				one: { verdict: 'pass', note: 'checked against source', reviewedAt: 3 }
			}
		};
		expect(checkpoint.results[0].rawRetrievedEvidence[0].text).toHaveLength(700);
		savePrivateRunCheckpoint(storage, checkpoint);
		expect(loadPrivateRunCheckpoint(storage)).toEqual(checkpoint);
		expect(humanReviewSummary(checkpoint)).toEqual({
			reviewed: 1,
			passed: 1,
			failed: 0,
			oracleInvalid: 0,
			complete: true
		});
	});

	it('preserves a human review written while generation is awaiting the next result', () => {
		const base: PrivateRunCheckpoint = {
			version: 1,
			runId: 'run',
			documentName: 'local.pdf',
			documentHash: 'hash',
			retrievalVersion: 12,
			model: 'model',
			total: 2,
			completed: 0,
			startedAt: 1,
			updatedAt: 1,
			results: [],
			humanReviews: {}
		};
		const result = {
			id: 'one',
			question: 'Question?',
			expectedOutcome: 'answer' as const,
			route: 'targeted' as const,
			passed: true,
			retrievalPassed: true,
			pageRecallPassed: true,
			answerGroupTriagePassed: true,
			answerPassed: true,
			citationPassed: true,
			answerBearing: true,
			alternateQueries: [],
			retrievedPages: [1],
			retrievedEvidence: [{ page: 1, text: 'evidence' }],
			rawRetrievedPages: [1],
			rawRetrievedEvidence: [{ page: 1, text: 'evidence' }],
			citedPages: [1],
			missingPageGroups: [],
			missingAnswerGroups: [],
			unexpectedAnswerGroups: [],
			answer: 'answer [1]',
			answerSource: 'llm' as const,
			generationSkipped: false,
			retrievalMs: 1,
			generationMs: 2
		};
		const review = { verdict: 'pass' as const, note: 'source checked', reviewedAt: 2 };
		const next = appendPrivateRunResult(base, result, { prior: review }, 1, 3);
		expect(next.humanReviews).toEqual({ prior: review });
		expect(next.completed).toBe(1);
		expect(next.results.map((item) => item.id)).toEqual(['one']);
	});

	it('resumes only the missing suffix and never re-runs the saved prefix', () => {
		const cases = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
		const checkpoint: PrivateRunCheckpoint = {
			version: 1,
			runId: 'run',
			documentName: 'local.pdf',
			documentHash: 'hash',
			retrievalVersion: 12,
			model: 'model',
			total: 3,
			completed: 2,
			startedAt: 1,
			updatedAt: 2,
			results: [
				{ id: 'one' } as PrivateRunCheckpoint['results'][number],
				{ id: 'two' } as PrivateRunCheckpoint['results'][number]
			],
			humanReviews: {}
		};
		expect(remainingCheckpointCases(cases, checkpoint).map((test) => test.id)).toEqual(['three']);
	});

	it('consolidates automatic gates with explicit human corrections', () => {
		const result = (id: string, passed: boolean) =>
			({
				id,
				question: `${id}?`,
				expectedOutcome: 'answer',
				answer: 'answer [1]',
				passed,
				retrievalPassed: true,
				pageRecallPassed: true,
				answerGroupTriagePassed: true,
				answerPassed: passed,
				citationPassed: true,
				answerBearing: true,
				alternateQueries: [],
				rawRetrievedPages: [1],
				retrievedPages: [1],
				citedPages: [1],
				missingPageGroups: [],
				missingAnswerGroups: [],
				unexpectedAnswerGroups: [],
				rawRetrievedEvidence: [],
				answerSource: 'llm',
				generationSkipped: false,
				retrievalMs: 1,
				generationMs: 1
			}) satisfies PrivateRunCheckpoint['results'][number];
		const checkpoint: PrivateRunCheckpoint = {
			version: 1,
			runId: 'run',
			documentName: 'local.pdf',
			documentHash: 'hash',
			retrievalVersion: 12,
			model: 'model',
			total: 4,
			completed: 4,
			startedAt: 1,
			updatedAt: 2,
			results: [
				result('auto-pass', true),
				result('auto-fail-product', false),
				result('auto-fail-oracle', false),
				result('auto-pass-human-fail', true)
			],
			humanReviews: {
				'auto-fail-oracle': { verdict: 'oracle-invalid', note: 'oracle too strict', reviewedAt: 3 },
				'auto-pass-human-fail': { verdict: 'fail', note: 'wrong rationale', reviewedAt: 3 }
			}
		};
		const report = buildConsolidatedReport(checkpoint);
		expect(report.complete).toBe(true);
		expect(report.automatic.passed).toBe(2);
		// oracle-invalid rescues auto-fail-oracle; human fail overrides auto-pass-human-fail.
		expect(report.humanCorrect.passed).toBe(2);
		expect(report.automaticFailureIds).toEqual(['auto-fail-product', 'auto-fail-oracle']);
		expect(report.humanFailureIds).toEqual(['auto-fail-product', 'auto-pass-human-fail']);
		expect(report.oracleInvalidIds).toEqual(['auto-fail-oracle']);
		expect(report.results[2].humanVerdict).toBe('oracle-invalid');
	});
});

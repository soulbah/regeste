<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import * as Card from '$lib/components/ui/card';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { chatsStore } from '$lib/state/chats.svelte';
	import {
		runIntelligenceBenchmark,
		type IntelligenceBenchmarkReport
	} from '$lib/benchmark/intelligence';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import {
		CROSS_DOCUMENT_CASES,
		CROSS_DOCUMENT_FIXTURES,
		scoreCrossDocumentEvidence
	} from '$lib/benchmark/cross-document-stress';
	import { hasAnswerBearingEvidence, isWeakMatch } from '$lib/pipeline/relevance';
	import { getLocalDb } from '$lib/local-db/client';
	import {
		evaluateRetrieval,
		type RetrievalEvaluation,
		type RetrievalMetrics
	} from '$lib/benchmark/retrieval-metrics';
	import { normalizeForFuzzy } from '$lib/pipeline/fuzzy';
	import { RETRIEVAL_VERSION } from '$lib/pipeline/retrieval-version';
	import {
		runSemanticBenchmark,
		type SemanticBenchmarkReport
	} from '$lib/benchmark/semantic-metrics';
	import publicQa from '../../../../benchmarks/fuzzy-public-qa.json';
	import fuzzyBaseline from '../../../../benchmarks/fuzzy-baseline.json';
	import {
		assertBenchmarkBounds,
		benchmarkAsset,
		validateBenchmarkBytes
	} from '$lib/benchmark/assets';
	import { runMartinAnswerStress, runMartinStress } from '$lib/benchmark/compromis-stress';
	import {
		PUBLIC_ANSWER_STRESS_CASES,
		runPublicAnswerStress
	} from '$lib/benchmark/public-answer-stress';
	import {
		answerMatchesStressOracle,
		assertPrivateDocumentStressPages,
		parsePrivateDocumentStressMatrix,
		runPrivateDocumentRetrievalStress,
		runPrivateDocumentStress
	} from '$lib/benchmark/private-document-stress';
	import { yieldToMain } from '$lib/pipeline/embed-batches';
	import {
		appendPrivateRunResult,
		buildConsolidatedReport,
		humanReviewSummary,
		loadGenerationCache,
		loadPrivateRunCheckpoint,
		privateGenerationCacheKey,
		remainingCheckpointCases,
		saveGenerationCache,
		savePrivateRunCheckpoint,
		sha256Text,
		type PrivateHumanVerdict,
		type PrivateRunCheckpoint
	} from '$lib/benchmark/private-run-cache';
	import type { SearchHit } from '$lib/types';
	import { generationOptionsFor, verificationOptionsFor } from '$lib/private-ai/generation';
	import {
		crossLingualQueryVariants,
		retrieveWithLocalQueryFallback
	} from '$lib/pipeline/query-translation';
	import { resolveQuestion, resolveQuestions } from '$lib/nlu/semantic-resolver';
	import { buildExecutionPlan } from '$lib/nlu/execution-plan';
	import {
		durationValueMentions,
		missingDurationCarrier,
		RETRIEVAL_PIPELINE_VERSION
	} from '$lib/pipeline/retrieval';
	import {
		buildAuditedExtractiveAnswer,
		buildDeterministicExtractiveAnswer
	} from '$lib/private-ai/extractive-answer';
	import {
		buildDurationValuePrompt,
		buildUserPrompt,
		buildVerificationPrompt,
		buildVerificationUserPrompt,
		enforceAnswerInvariants,
		GROUNDED_VERIFICATION_VERSION,
		needsGroundedVerification,
		isDegenerateAnswer,
		stripThink,
		SYSTEM_PROMPT
	} from '$lib/private-ai/prompt';

	type IndexDiagnostic = {
		name: string;
		status: string;
		chunks: number;
		retrievalVersion: number;
	};
	type MemoryPerformance = Performance & {
		measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
	};
	const FUZZY_FIXTURE_NAMES = [
		'malik-profile-study.docx',
		'malik-profile-family.docx',
		'near-identifiers-table.docx',
		'malik-profile-note.txt',
		'http-semantics.md',
		'tatqa-contract-sales.md',
		'finqa-payment-networks.txt',
		'cfr-fiberboard-boxes.pdf',
		'federal-register-two-column.pdf',
		'apollo-flight-planning-report.pdf',
		'rfc9110.txt',
		'rfc9110.pdf',
		'nist-ai-rmf-1.0.pdf',
		'irs-form-1040-2025.pdf',
		'aec-addendum-drawings.pdf'
	];

	let fileInput = $state<HTMLInputElement | null>(null);
	let query = $state('');
	let dragOver = $state(false);
	let benchmarking = $state(false);
	let generationBenchmarking = $state(false);
	let benchmarkReport = $state<IntelligenceBenchmarkReport | null>(null);
	let crossDocumentReport = $state<
		| (ReturnType<typeof scoreCrossDocumentEvidence> & {
				failures: Array<{ query: string; expected: string[]; retrieved: string[] }>;
		  })
		| null
	>(null);
	let indexDiagnostics = $state<IndexDiagnostic[] | null>(null);
	let repairingIndexes = $state(false);
	let fuzzyBenchmarking = $state(false);
	let fuzzyBenchmarkReport = $state<{
		metrics: RetrievalMetrics;
		ablation: Record<'lexical' | 'fuzzy' | 'dense', RetrievalMetrics>;
		ingestMs: number;
		queryRewriteMs: number;
		queryRewriteCount: number;
		bytes: number;
		cases: number;
		failures: string[];
		ablationFailures: Record<'lexical' | 'fuzzy' | 'dense', string[]>;
		baseline: { version: number; regressions: string[] };
		slowest: Array<{ id: string; ms: number }>;
		cost: {
			databaseBytesBefore: number;
			databaseBytesAfter: number;
			databaseDeltaBytes: number;
			browserStorageBytesBefore: number;
			browserStorageBytesAfter: number;
			browserStorageDeltaBytes: number;
			sampledPeakMemoryBytes: number | null;
			chunks: number;
			indexedTextBytes: number;
			embeddingBytes: number;
			pages: number;
			megabytesPerSecond: number;
			pagesPerSecond: number;
		};
	} | null>(null);
	let fuzzyBenchmarkError = $state<string | null>(null);
	let compromisDiagnostic = $state<unknown>(null);
	let compromisReindexReport = $state<unknown>(null);
	let compromisAnswerBenchmarking = $state(false);
	let compromisAnswerProgress = $state({ completed: 0, total: 44 });
	let compromisAnswerReport = $state<unknown>(null);
	let publicAnswerBenchmarking = $state(false);
	let publicAnswerProgress = $state({ completed: 0, total: PUBLIC_ANSWER_STRESS_CASES.length });
	let publicAnswerReport = $state<unknown>(null);
	let queryRewriteDiagnostic = $state<unknown>(null);
	let semanticBenchmarking = $state(false);
	let semanticBenchmarkReport = $state<SemanticBenchmarkReport | null>(null);
	let semanticBenchmarkError = $state<string | null>(null);
	let clipboardImportStatus = $state<string | null>(null);
	let privateDocumentBenchmarking = $state(false);
	let privateChannelBenchmarking = $state(false);
	let privateChannelProgress = $state({ completed: 0, total: 0 });
	let privateChannelReport = $state<unknown>(null);
	let privateDocumentBenchmarkProgress = $state({ completed: 0, total: 0 });
	let privateDocumentBenchmarkStage = $state<'routing' | 'retrieval' | 'generation'>('retrieval');
	let privateDocumentBenchmarkReport = $state<unknown>(null);
	let privateBenchmarkMatrixText = $state('');
	let privateConsolidatedReport = $state<unknown>(null);
	let privateRunCheckpoint = $state<PrivateRunCheckpoint | null>(null);
	let privateReviewIndex = $state(0);
	let privateReviewNote = $state('');
	let privateGenerationCache = new SvelteMap<string, string>();
	function privateBenchmarkStageLabel(stage: 'routing' | 'retrieval' | 'generation'): string {
		if (stage === 'routing') return 'Routing';
		if (stage === 'retrieval') return 'Retrieving';
		return 'Generating';
	}
	let privateReviewResult = $derived(privateRunCheckpoint?.results[privateReviewIndex] ?? null);
	let privateReviewSummary = $derived(
		privateRunCheckpoint ? humanReviewSummary(privateRunCheckpoint) : null
	);
	type PrivateRetrievalCache = Map<
		string,
		Promise<{ hits: SearchHit[]; alternateQueries: string[] }>
	>;
	type PrivateRouteCache = Map<string, Promise<'targeted' | 'synthesis'>>;
	const hotData = import.meta.hot?.data as
		| {
				privateRetrievalCache?: PrivateRetrievalCache;
				privateRouteCache?: PrivateRouteCache;
		  }
		| undefined;
	const privateRetrievalCache: PrivateRetrievalCache =
		hotData?.privateRetrievalCache ?? new SvelteMap();
	const privateRouteCache: PrivateRouteCache = hotData?.privateRouteCache ?? new SvelteMap();
	if (import.meta.hot) {
		import.meta.hot.data.privateRetrievalCache = privateRetrievalCache;
		import.meta.hot.data.privateRouteCache = privateRouteCache;
	}

	onMount(async () => {
		privateGenerationCache = new SvelteMap(loadGenerationCache(localStorage));
		privateRunCheckpoint = loadPrivateRunCheckpoint(localStorage);
		if (privateRunCheckpoint) {
			privateReviewIndex = Math.max(
				0,
				privateRunCheckpoint.results.findIndex(
					(result) => !privateRunCheckpoint?.humanReviews[result.id]
				)
			);
			privateDocumentBenchmarkReport = {
				restoredCheckpoint: true,
				runId: privateRunCheckpoint.runId,
				completed: privateRunCheckpoint.completed,
				total: privateRunCheckpoint.total,
				humanReview: humanReviewSummary(privateRunCheckpoint)
			};
		}
		await documentsStore.init();
		await refreshIndexDiagnostics();
		llmStore.init();
		if (new URLSearchParams(location.search).has('record-stress')) {
			replaceState(resolve('/dev/pipeline'), {});
			await runRecordStressBenchmark();
		}
		if (new URLSearchParams(location.search).has('cross-document-stress')) {
			replaceState(resolve('/dev/pipeline'), {});
			await runCrossDocumentStressBenchmark();
		}
	});

	async function refreshIndexDiagnostics() {
		const { db } = await getLocalDb();
		indexDiagnostics = await Promise.all(
			documentsStore.documents.map(async (document) => ({
				name: document.name,
				status: document.status,
				chunks: await db.countChunks(document.id),
				retrievalVersion: document.retrievalVersion ?? 1
			}))
		);
	}

	async function sampleMemory(): Promise<number | null> {
		try {
			const measure = (performance as MemoryPerformance).measureUserAgentSpecificMemory;
			if (!measure) return null;
			return await Promise.race([
				measure.call(performance).then((result) => result.bytes),
				new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000))
			]);
		} catch {
			return null;
		}
	}

	async function runSemanticRoutingBenchmark() {
		semanticBenchmarking = true;
		semanticBenchmarkReport = null;
		semanticBenchmarkError = null;
		try {
			semanticBenchmarkReport = await runSemanticBenchmark((texts) =>
				documentsStore.embedQueries(texts)
			);
		} catch (error) {
			semanticBenchmarkError = error instanceof Error ? error.message : String(error);
		} finally {
			semanticBenchmarking = false;
		}
	}

	async function resetFuzzyFixtures() {
		for (const document of documentsStore.documents.filter((item) =>
			FUZZY_FIXTURE_NAMES.includes(item.name)
		)) {
			await documentsStore.remove(document.id);
		}
		await refreshIndexDiagnostics();
	}

	async function runIngestUxScenario() {
		const name = 'aec-addendum-drawings.pdf';
		const existing = documentsStore.documents.find((document) => document.name === name);
		if (existing) await documentsStore.remove(existing.id);
		const response = await fetch('/dev/fuzzy-public/aec-addendum-drawings.pdf');
		if (!response.ok) throw new Error(`Fixture request failed (${response.status})`);
		const file = new File([await response.arrayBuffer()], name, { type: 'application/pdf' });
		const chatId = await chatsStore.create('private');
		await chatsStore.open(chatId);
		const [documentId] = await documentsStore.ingestMany([file]);
		await chatsStore.attach(chatId, documentId);
		await goto(resolve(`/chat/${chatId}`));
	}

	async function importPdfFromClipboard() {
		clipboardImportStatus = 'Reading clipboard…';
		try {
			const items = await navigator.clipboard.read();
			const item = items.find((candidate) => candidate.types.includes('application/pdf'));
			if (!item) throw new Error('Clipboard does not contain a PDF');
			const blob = await item.getType('application/pdf');
			const documentId = await documentsStore.ingest(
				new File([blob], 'clipboard-document.pdf', { type: 'application/pdf' })
			);
			clipboardImportStatus = `Import started: ${documentId}`;
		} catch (error) {
			clipboardImportStatus = error instanceof Error ? error.message : String(error);
		}
	}

	function privateRetrievalCacheKey(
		kind: 'primary' | 'production',
		document: { id: string; retrievalVersion?: number },
		question: string,
		route: 'targeted' | 'synthesis'
	) {
		return JSON.stringify([
			kind,
			RETRIEVAL_PIPELINE_VERSION,
			document.id,
			document.retrievalVersion ?? 1,
			question,
			route
		]);
	}

	// Matches the embed worker's measured model batch. Smaller benchmark batches
	// repeatedly under-filled the same serialized inference session; larger jobs
	// are still split safely by the worker and yield between model batches.
	const PRIVATE_RETRIEVAL_BATCH_SIZE = 16;

	async function preparePrivateBenchmarkPrimary(
		questions: string[],
		document: { id: string; retrievalVersion?: number },
		cacheKind: 'primary' | 'production',
		onPreparationProgress?: (
			phase: 'routing' | 'retrieval',
			completed: number,
			total: number
		) => void
	) {
		const diagnosticsByQuestion = new SvelteMap<
			string,
			import('$lib/state/documents.svelte').RetrievalDiagnostic
		>();
		const retrievalBatches: import('$lib/state/documents.svelte').RetrievalBatchTiming[] = [];
		onPreparationProgress?.('routing', 0, questions.length);
		const routeStartedAt = performance.now();
		const routes = await Promise.all(
			questions.map((question) => privateRouteCache.get(question) ?? null)
		);
		const missingRouteIndexes = routes
			.map((route, index) => (route ? -1 : index))
			.filter((index) => index >= 0);
		if (missingRouteIndexes.length) {
			const frames = await resolveQuestions(
				missingRouteIndexes.map((index) => questions[index]),
				(texts) => documentsStore.embedQueries(texts)
			);
			for (let offset = 0; offset < missingRouteIndexes.length; offset++) {
				const index = missingRouteIndexes[offset];
				const route: 'targeted' | 'synthesis' =
					buildExecutionPlan(questions[index], frames[offset]).route === 'synthesis'
						? 'synthesis'
						: 'targeted';
				const pending = Promise.resolve(route);
				privateRouteCache.set(questions[index], pending);
				routes[index] = await pending;
			}
		}
		onPreparationProgress?.('routing', questions.length, questions.length);
		const routeMs = performance.now() - routeStartedAt;
		const retrievalStartedAt = performance.now();
		const cached = await Promise.all(
			questions.map((question, index) => {
				const route = routes[index]!;
				return (
					privateRetrievalCache.get(
						privateRetrievalCacheKey(cacheKind, document, question, route)
					) ?? null
				);
			})
		);
		const missingIndexes = cached
			.map((result, index) => (result ? -1 : index))
			.filter((index) => index >= 0);
		onPreparationProgress?.(
			'retrieval',
			questions.length - missingIndexes.length,
			questions.length
		);
		if (missingIndexes.length) {
			// A single 117-query fan-out monopolizes OPFS/vec0 and freezes progress.
			// Bounded batches keep one model job efficient while yielding UI control.
			for (let offset = 0; offset < missingIndexes.length; offset += PRIVATE_RETRIEVAL_BATCH_SIZE) {
				const indexes = missingIndexes.slice(offset, offset + PRIVATE_RETRIEVAL_BATCH_SIZE);
				const hits = await documentsStore.retrieveMany(
					indexes.map((index) => ({
						query: questions[index],
						documentIds: [document.id],
						refinementQuery: questions[index],
						route: routes[index]!,
						onDiagnostic: (diagnostic) => diagnosticsByQuestion.set(questions[index], diagnostic)
					})),
					(timing) => retrievalBatches.push(timing)
				);
				for (let batchOffset = 0; batchOffset < indexes.length; batchOffset++) {
					const index = indexes[batchOffset];
					const result = Promise.resolve({ hits: hits[batchOffset], alternateQueries: [] });
					privateRetrievalCache.set(
						privateRetrievalCacheKey(cacheKind, document, questions[index], routes[index]!),
						result
					);
					cached[index] = await result;
				}
				onPreparationProgress?.(
					'retrieval',
					questions.length - missingIndexes.length + offset + indexes.length,
					questions.length
				);
				if (offset + indexes.length < missingIndexes.length) await yieldToMain();
			}
		}
		return {
			routeByQuestion: new Map(questions.map((question, index) => [question, routes[index]!])),
			retrievalByQuestion: new Map(questions.map((question, index) => [question, cached[index]!])),
			preparation: {
				routeMs,
				retrievalMs: performance.now() - retrievalStartedAt,
				newRoutes: missingRouteIndexes.length,
				newRetrievals: missingIndexes.length,
				batchSize: PRIVATE_RETRIEVAL_BATCH_SIZE,
				batches: retrievalBatches
			},
			diagnosticsByQuestion
		};
	}

	function compactRetrievalResult(
		result: {
			test: { id: string; question: string };
			route: string;
			hits: SearchHit[];
			rawHits: SearchHit[];
			answerBearing: boolean;
			retrievedPages: Array<number | null>;
			rawRetrievedPages: Array<number | null>;
			missingPageGroups: number[][];
			pageRecallPassed: boolean;
			answerGroupTriagePassed: boolean;
			retrievalPassed: boolean;
			retrievalMs: number;
		},
		includeEvidence = false
	) {
		return {
			id: result.test.id,
			question: result.test.question,
			route: result.route,
			answerBearing: result.answerBearing,
			retrievedPages: result.retrievedPages,
			rawRetrievedPages: result.rawRetrievedPages,
			missingPageGroups: result.missingPageGroups,
			pageRecallPassed: result.pageRecallPassed,
			answerGroupTriagePassed: result.answerGroupTriagePassed,
			retrievalPassed: result.retrievalPassed,
			retrievalMs: result.retrievalMs,
			...(includeEvidence
				? {
						evidence: result.rawHits.map((hit) => ({
							page: hit.page,
							text: hit.text.slice(0, 600)
						}))
					}
				: {})
		};
	}

	async function runClipboardPrivateRetrievalBenchmark() {
		privateDocumentBenchmarking = true;
		privateDocumentBenchmarkStage = 'retrieval';
		privateDocumentBenchmarkReport = null;
		try {
			const startedAt = performance.now();
			const matrix = parsePrivateDocumentStressMatrix(
				JSON.parse(privateBenchmarkMatrixText) as unknown
			);
			const document = documentsStore.documents.find(
				(candidate) => candidate.name === matrix.documentName && candidate.status === 'ready'
			);
			if (!document) throw new Error(`Ready document not found: ${matrix.documentName}`);
			assertPrivateDocumentStressPages(matrix, document.pages);
			privateDocumentBenchmarkProgress = { completed: 0, total: matrix.cases.length };
			const prepared = await preparePrivateBenchmarkPrimary(
				matrix.cases.map((test) => test.question),
				document,
				'primary',
				(phase, completed, total) => {
					privateDocumentBenchmarkStage = phase;
					privateDocumentBenchmarkProgress = { completed, total };
				}
			);
			const report = await runPrivateDocumentRetrievalStress({
				documentId: document.id,
				cases: matrix.cases,
				concurrency: 8,
				retrieve: async (question) => prepared.retrievalByQuestion.get(question)!,
				resolveRoute: async (question) => prepared.routeByQuestion.get(question) ?? 'targeted',
				onProgress: (completed, total) => (privateDocumentBenchmarkProgress = { completed, total })
			});
			privateDocumentBenchmarkReport = {
				metricKind: 'automatic-lexical-triage',
				semanticReviewRequired: true,
				mode: 'retrieval-only-primary',
				total: report.total,
				passed: report.passed,
				pageRecallPassed: report.pageRecallPassed,
				answerGroupTriagePassed: report.answerGroupTriagePassed,
				score: report.score,
				summedRetrievalMs: report.elapsedRetrievalMs,
				preparation: prepared.preparation,
				failures: report.failures.map((result) => ({
					...compactRetrievalResult(result, true),
					diagnostic: prepared.diagnosticsByQuestion.get(result.test.question)
				})),
				results: report.results.map((result) => compactRetrievalResult(result)),
				elapsedMs: performance.now() - startedAt
			};
		} catch (error) {
			privateDocumentBenchmarkReport = {
				error: error instanceof Error ? error.message : String(error)
			};
		} finally {
			privateDocumentBenchmarking = false;
		}
	}

	async function runPrivateChannelDiagnostic() {
		privateChannelBenchmarking = true;
		privateChannelReport = null;
		try {
			const startedAt = performance.now();
			const matrix = parsePrivateDocumentStressMatrix(
				JSON.parse(privateBenchmarkMatrixText) as unknown
			);
			const document = documentsStore.documents.find(
				(candidate) => candidate.name === matrix.documentName && candidate.status === 'ready'
			);
			if (!document) throw new Error(`Ready document not found: ${matrix.documentName}`);
			assertPrivateDocumentStressPages(matrix, document.pages);
			privateChannelProgress = { completed: 0, total: matrix.cases.length };
			const frames = await resolveQuestions(
				matrix.cases.map((test) => test.question),
				(texts) => documentsStore.embedQueries(texts)
			);
			const results = [];
			for (let index = 0; index < matrix.cases.length; index++) {
				const test = matrix.cases[index];
				const route: 'targeted' | 'synthesis' =
					buildExecutionPlan(test.question, frames[index]).route === 'synthesis'
						? 'synthesis'
						: 'targeted';
				const channels = await documentsStore.retrieveChannelCandidates(
					test.question,
					[document.id],
					[],
					route
				);
				results.push({
					id: test.id,
					question: test.question,
					route,
					expectedPageGroups: test.pageGroups,
					channels: Object.fromEntries(
						Object.entries(channels).map(([channel, hits]) => {
							const pages = hits.map((hit) => hit.page);
							return [
								channel,
								{
									answerBearing: hasAnswerBearingEvidence(test.question, hits),
									missingPageGroups: test.pageGroups.filter(
										(group) => !group.some((page) => pages.includes(page))
									),
									hits: hits.map((hit) => ({
										page: hit.page,
										score: hit.score,
										text: hit.text.slice(0, 240)
									}))
								}
							];
						})
					)
				});
				privateChannelProgress = { completed: index + 1, total: matrix.cases.length };
				if (index + 1 < matrix.cases.length) await yieldToMain();
			}
			privateChannelReport = {
				total: results.length,
				results,
				elapsedMs: performance.now() - startedAt
			};
		} catch (error) {
			privateChannelReport = { error: error instanceof Error ? error.message : String(error) };
		} finally {
			privateChannelBenchmarking = false;
		}
	}

	async function verifyBenchmarkAnswer(
		question: string,
		route: 'targeted' | 'synthesis',
		hits: SearchHit[],
		draft: string
	): Promise<string> {
		const options = verificationOptionsFor();
		let answer = draft;
		if (needsGroundedVerification(question, answer)) {
			const verified = stripThink(
				await llmStore.generate(
					[
						{ role: 'system', content: SYSTEM_PROMPT },
						{
							role: 'user',
							content: buildVerificationPrompt(
								question,
								buildVerificationUserPrompt(question, hits),
								answer
							)
						}
					],
					() => {},
					options
				)
			);
			if (verified.trim()) answer = verified;
		}
		// Parity with the app path: a multi-part deadline question answered with
		// fewer distinct durations than it has parts gets one corrective retry
		// naming the missing literal value, adopted only on strict improvement.
		const durationCarrier = missingDurationCarrier(question, answer, hits);
		if (durationCarrier) {
			const statedBefore = durationValueMentions(answer).length;
			const retried = stripThink(
				await llmStore.generate(
					[
						{ role: 'system', content: SYSTEM_PROMPT },
						{
							role: 'user',
							content: `${buildUserPrompt(question, hits, null)}\n\n${buildDurationValuePrompt(question, durationCarrier.literal, durationCarrier.index + 1)}`
						}
					],
					() => {},
					generationOptionsFor(question, 'targeted')
				)
			);
			if (
				retried.trim() &&
				!isDegenerateAnswer(retried) &&
				durationValueMentions(retried).length > statedBefore
			) {
				answer = retried;
			}
		}
		return enforceAnswerInvariants(question, answer);
	}

	async function runClipboardPrivateDocumentBenchmark(resume = false) {
		if (llmStore.status !== 'ready') {
			privateDocumentBenchmarkReport = { error: `Private model is ${llmStore.status}` };
			return;
		}
		privateDocumentBenchmarking = true;
		privateDocumentBenchmarkStage = 'retrieval';
		privateDocumentBenchmarkReport = null;
		try {
			const startedAt = performance.now();
			const matrix = parsePrivateDocumentStressMatrix(
				JSON.parse(privateBenchmarkMatrixText) as unknown
			);
			const document = documentsStore.documents.find(
				(candidate) => candidate.name === matrix.documentName && candidate.status === 'ready'
			);
			if (!document) throw new Error(`Ready document not found: ${matrix.documentName}`);
			assertPrivateDocumentStressPages(matrix, document.pages);
			const model = llmStore.tier!.model;
			const runId = await sha256Text(
				JSON.stringify({
					matrix,
					documentHash: document.hash,
					retrievalVersion: document.retrievalVersion ?? 1,
					retrievalPipelineVersion: RETRIEVAL_PIPELINE_VERSION,
					model
				})
			);
			// Resume continues the saved prefix of the exact same run configuration.
			// Any change to matrix, document, retrieval pipeline or model produces a
			// different runId, so a stale checkpoint can never silently pollute it.
			const saved = privateRunCheckpoint;
			const resumed =
				resume && saved !== null && saved.runId === runId && saved.completed < saved.total;
			if (resume && !resumed) {
				throw new Error(
					saved === null
						? 'No saved checkpoint to resume'
						: saved.runId !== runId
							? 'Saved checkpoint belongs to a different run configuration'
							: 'Saved checkpoint is already complete'
				);
			}
			const previousReviews =
				privateRunCheckpoint?.runId === runId ? privateRunCheckpoint.humanReviews : {};
			let checkpoint: PrivateRunCheckpoint = resumed
				? saved!
				: {
						version: 1,
						runId,
						documentName: document.name,
						documentHash: document.hash,
						retrievalVersion: document.retrievalVersion ?? 1,
						model,
						total: matrix.cases.length,
						completed: 0,
						startedAt: Date.now(),
						updatedAt: Date.now(),
						results: [],
						humanReviews: previousReviews
					};
			const casesToRun = resumed
				? remainingCheckpointCases(matrix.cases, checkpoint)
				: matrix.cases;
			privateRunCheckpoint = checkpoint;
			savePrivateRunCheckpoint(localStorage, checkpoint);
			let generationCacheHits = 0;
			let newGenerations = 0;
			let extractiveAnswers = 0;
			let rewriteQueue: Promise<void> = Promise.resolve();
			const serializedRewrite = (
				messages: Array<{ role: 'system' | 'user'; content: string }>
			): Promise<string> => {
				const pending = rewriteQueue.then(() =>
					llmStore.generate(messages, () => {}, {
						reasoning: 'off',
						maxTokens: 96,
						temperature: 0
					})
				);
				rewriteQueue = pending.then(
					() => undefined,
					() => undefined
				);
				return pending;
			};
			const testByQuestion = new Map(matrix.cases.map((test) => [test.question, test]));
			privateDocumentBenchmarkProgress = { completed: 0, total: casesToRun.length };
			const prepared = await preparePrivateBenchmarkPrimary(
				casesToRun.map((test) => test.question),
				document,
				'primary',
				(phase, completed, total) => {
					privateDocumentBenchmarkStage = phase;
					privateDocumentBenchmarkProgress = { completed, total };
				}
			);
			const report = await runPrivateDocumentStress({
				documentId: document.id,
				cases: casesToRun,
				retrieve: async (question, documentIds, route) => {
					const key = privateRetrievalCacheKey('production', document, question, route);
					let pending = privateRetrievalCache.get(key);
					if (pending) return pending;
					pending = retrieveWithLocalQueryFallback({
						query: question,
						documentLanguages: [document.language],
						rewrite: serializedRewrite,
						retrieve: (alternateQueries) =>
							alternateQueries.length
								? documentsStore.retrieve(
										question,
										documentIds,
										question,
										undefined,
										route,
										alternateQueries
									)
								: Promise.resolve(prepared.retrievalByQuestion.get(question)!.hits)
					});
					privateRetrievalCache.set(key, pending);
					return pending;
				},
				generate: async (messages, question, route, hits) => {
					const extractive = buildAuditedExtractiveAnswer(question, hits);
					if (extractive) {
						extractiveAnswers++;
						return extractive.needsAudit
							? verifyBenchmarkAnswer(question, route, hits, extractive.answer)
							: enforceAnswerInvariants(question, extractive.answer);
					}
					const options = generationOptionsFor(question, route);
					const cacheKey = await privateGenerationCacheKey({
						model,
						documentHash: document.hash,
						retrievalVersion: document.retrievalVersion ?? 1,
						question,
						route,
						options: {
							...options,
							verificationVersion: needsGroundedVerification(question)
								? GROUNDED_VERIFICATION_VERSION
								: 0
						},
						messages
					});
					const cached = privateGenerationCache.get(cacheKey);
					const test = testByQuestion.get(question);
					if (cached !== undefined && test && answerMatchesStressOracle(test, cached)) {
						generationCacheHits++;
						return cached;
					}
					newGenerations++;
					let draft = stripThink(await llmStore.generate(messages, () => {}, options));
					// Parity with the app path (chats.svelte.ts): a reasoning pass that
					// dies inside <think> leaves an empty/dead draft, and the app
					// retries it once directly. Without the same retry here the
					// benchmark measures a raw death rate users never see — eight
					// empty answers in the 2026-07-22 run, each after 99-150 s.
					if (isDegenerateAnswer(draft)) {
						const retried = stripThink(
							await llmStore.generate(messages, () => {}, {
								...options,
								reasoning: 'off',
								maxTokens: 420
							})
						).trim();
						if (retried && (!isDegenerateAnswer(retried) || retried.length > draft.length)) {
							draft = retried;
						}
					}
					const corrected = await verifyBenchmarkAnswer(question, route, hits, draft);
					privateGenerationCache.set(cacheKey, corrected);
					saveGenerationCache(localStorage, privateGenerationCache);
					return corrected;
				},
				resolveRoute: async (question) => prepared.routeByQuestion.get(question) ?? 'targeted',
				retrievalConcurrency: 4,
				skipGenerationOnRetrievalFailure: true,
				onProgress: (completed, total) => (privateDocumentBenchmarkProgress = { completed, total }),
				onGenerationProgress: (completed, total) => {
					privateDocumentBenchmarkStage = 'generation';
					privateDocumentBenchmarkProgress = { completed, total };
				},
				onResult: (result) => {
					const latestReviews =
						privateRunCheckpoint?.runId === checkpoint.runId
							? privateRunCheckpoint.humanReviews
							: {};
					// Count against the whole checkpoint, not this (possibly resumed)
					// sub-run, so the saved prefix is extended rather than overwritten.
					checkpoint = appendPrivateRunResult(
						checkpoint,
						result,
						latestReviews,
						checkpoint.results.length + 1
					);
					privateRunCheckpoint = checkpoint;
					savePrivateRunCheckpoint(localStorage, checkpoint);
				}
			});
			const { db } = await getLocalDb();
			privateConsolidatedReport = buildConsolidatedReport(checkpoint);
			privateDocumentBenchmarkReport = {
				metricKind: 'automatic-lexical-triage',
				semanticReviewRequired: true,
				resumed,
				completedBefore: resumed ? matrix.cases.length - casesToRun.length : 0,
				total: report.total,
				automaticPassed: report.passed,
				retrievalPassed: report.retrievalPassed,
				pageRecallPassed: report.pageRecallPassed,
				answerGroupTriagePassed: report.answerGroupTriagePassed,
				answerPassed: report.answerPassed,
				citationPassed: report.citationPassed,
				automaticScore: report.score,
				failures: report.failures,
				preparation: prepared.preparation,
				generationCache: {
					hits: generationCacheHits,
					misses: newGenerations,
					extractive: extractiveAnswers
				},
				humanReview: humanReviewSummary(checkpoint),
				answers: report.results.map((result) => ({
					id: result.id,
					question: result.question,
					expectedOutcome: result.expectedOutcome,
					answer: result.answer,
					rawRetrievedPages: result.rawRetrievedPages,
					citedPages: result.citedPages,
					retrievedPages: result.retrievedPages,
					passed: result.passed,
					retrievalPassed: result.retrievalPassed,
					pageRecallPassed: result.pageRecallPassed,
					answerGroupTriagePassed: result.answerGroupTriagePassed,
					answerPassed: result.answerPassed,
					citationPassed: result.citationPassed,
					generationMs: result.generationMs
				})),
				document: {
					pages: document.pages,
					chunks: await db.countChunks(document.id),
					retrievalVersion: document.retrievalVersion ?? 1
				},
				elapsedMs: performance.now() - startedAt
			};
		} catch (error) {
			privateDocumentBenchmarkReport = {
				error: error instanceof Error ? error.message : String(error)
			};
		} finally {
			privateDocumentBenchmarking = false;
		}
	}

	/** One machine-readable consolidated report over the complete checkpoint
	 * (saved prefix + resumed suffix + human reviews), shown and downloaded. */
	function exportPrivateConsolidatedReport() {
		if (!privateRunCheckpoint) return;
		const report = buildConsolidatedReport(privateRunCheckpoint);
		privateConsolidatedReport = report;
		const blob = new Blob([JSON.stringify(report, null, '\t')], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `private-benchmark-consolidated-${report.runId.slice(0, 12)}-${report.completed}of${report.total}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	function reviewPrivateResult(verdict: PrivateHumanVerdict) {
		if (!privateRunCheckpoint || !privateReviewResult) return;
		const reviewed = {
			...privateRunCheckpoint,
			updatedAt: Date.now(),
			humanReviews: {
				...privateRunCheckpoint.humanReviews,
				[privateReviewResult.id]: {
					verdict,
					note: privateReviewNote.trim(),
					reviewedAt: Date.now()
				}
			}
		};
		privateRunCheckpoint = reviewed;
		savePrivateRunCheckpoint(localStorage, reviewed);
		privateReviewNote = '';
		const nextUnreviewed = reviewed.results.findIndex(
			(result, index) => index > privateReviewIndex && !reviewed.humanReviews[result.id]
		);
		privateReviewIndex = nextUnreviewed >= 0 ? nextUnreviewed : privateReviewIndex;
	}

	async function repairEmptyIndexes() {
		repairingIndexes = true;
		try {
			const { db } = await getLocalDb();
			for (const document of documentsStore.documents) {
				if ((await db.countChunks(document.id)) === 0) await documentsStore.reindex(document.id);
			}
			await refreshIndexDiagnostics();
		} finally {
			repairingIndexes = false;
		}
	}

	async function waitUntilReady(documentIds: string[]) {
		const deadline = Date.now() + 10 * 60_000;
		while (Date.now() < deadline) {
			await documentsStore.refreshLibrary();
			const rows = documentIds.map((id) => documentsStore.documents.find((doc) => doc.id === id));
			const failed = rows.find((doc) => doc?.status === 'error');
			if (failed) throw new Error(`fuzzy ingest failed: ${failed.name} (${failed.error})`);
			if (
				rows.every(
					(doc) => doc?.status === 'ready' && (doc.retrievalVersion ?? 1) >= RETRIEVAL_VERSION
				)
			)
				return;
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		throw new Error('fuzzy benchmark ingest timed out');
	}

	function containsEvidence(text: string, needle: string): boolean {
		const normalizedText = normalizeForFuzzy(text);
		if (
			normalizedText.includes(needle) ||
			normalizedText.replaceAll(' ', '').includes(needle.replaceAll(' ', ''))
		)
			return true;
		const available = normalizedText.split(' ');
		const expected = needle.split(' ');
		let cursor = -1;
		for (const token of expected) {
			const next = available.findIndex(
				(candidate, index) =>
					index > cursor && (cursor < 0 || index <= cursor + 10) && candidate === token
			);
			if (next < 0) return false;
			cursor = next;
		}
		return true;
	}

	async function runFuzzyBenchmark() {
		fuzzyBenchmarking = true;
		fuzzyBenchmarkReport = null;
		fuzzyBenchmarkError = null;
		try {
			const { db } = await getLocalDb();
			const browserStorageBytesBefore = (await navigator.storage.estimate()).usage ?? 0;
			const databaseBytesBefore = await db.databaseBytes();
			let sampledPeakMemoryBytes = await sampleMemory();
			const fixtures = [
				[
					'/dev/fuzzy-stress/malik-profile-study.docx',
					'malik-profile-study.docx',
					'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
				],
				[
					'/dev/fuzzy-stress/malik-profile-family.docx',
					'malik-profile-family.docx',
					'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
				],
				[
					'/dev/fuzzy-stress/near-identifiers-table.docx',
					'near-identifiers-table.docx',
					'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
				],
				['/dev/fuzzy-stress/malik-profile-note.txt', 'malik-profile-note.txt', 'text/plain'],
				['/dev/fuzzy-stress/http-semantics.md', 'http-semantics.md', 'text/markdown'],
				['/dev/fuzzy-stress/tatqa-contract-sales.md', 'tatqa-contract-sales.md', 'text/markdown'],
				[
					'/dev/fuzzy-stress/finqa-payment-networks.txt',
					'finqa-payment-networks.txt',
					'text/plain'
				],
				[
					'/dev/fuzzy-public/cfr-fiberboard-boxes.pdf',
					'cfr-fiberboard-boxes.pdf',
					'application/pdf'
				],
				[
					'/dev/fuzzy-public/federal-register-two-column.pdf',
					'federal-register-two-column.pdf',
					'application/pdf'
				],
				[
					'/dev/fuzzy-public/apollo-flight-planning-report.pdf',
					'apollo-flight-planning-report.pdf',
					'application/pdf'
				],
				['/dev/fuzzy-public/rfc9110.txt', 'rfc9110.txt', 'text/plain'],
				['/dev/fuzzy-public/rfc9110.pdf', 'rfc9110.pdf', 'application/pdf'],
				['/dev/fuzzy-public/nist-ai-rmf-1.0.pdf', 'nist-ai-rmf-1.0.pdf', 'application/pdf'],
				['/dev/fuzzy-public/irs-form-1040-2025.pdf', 'irs-form-1040-2025.pdf', 'application/pdf'],
				[
					'/dev/fuzzy-public/aec-addendum-drawings.pdf',
					'aec-addendum-drawings.pdf',
					'application/pdf'
				]
			] as const;
			const started = performance.now();
			let bytes = 0;
			const ids = new SvelteMap<string, string>();
			for (const [url, name, mime] of fixtures) {
				const asset = benchmarkAsset(name);
				const reusable = documentsStore.documents.find(
					(document) => document.hash === asset.sha256 && document.status === 'ready'
				);
				if (reusable && (await db.countChunks(reusable.id)) > 0) {
					ids.set(name, reusable.id);
					continue;
				}
				const response = await fetch(url);
				const contentType = response.headers.get('content-type') ?? '';
				if (!response.ok || contentType.includes('text/html')) {
					throw new Error(
						`Missing fuzzy fixture ${name}; generate/download the benchmark assets before running.`
					);
				}
				const data = await response.arrayBuffer();
				await validateBenchmarkBytes(asset, data);
				bytes += data.byteLength;
				ids.set(name, await documentsStore.ingest(new File([data], name, { type: mime })));
			}
			await waitUntilReady([...ids.values()]);
			for (const [name, id] of ids) {
				const document = documentsStore.documents.find((item) => item.id === id);
				assertBenchmarkBounds(benchmarkAsset(name), {
					pages: document?.pages ?? null,
					chunks: await db.countChunks(id)
				});
			}
			const memoryAfter = await sampleMemory();
			if (memoryAfter !== null)
				sampledPeakMemoryBytes = Math.max(sampledPeakMemoryBytes ?? 0, memoryAfter);
			const ingestMs = Math.round(performance.now() - started);
			const browserStorageBytesAfter = (await navigator.storage.estimate()).usage ?? 0;
			const databaseBytesAfter = await db.databaseBytes();
			const indexedChunks = await db.listChunksForDocuments([...ids.values()]);
			const indexedTextBytes = indexedChunks.reduce(
				(sum, chunk) => sum + new TextEncoder().encode(chunk.text).byteLength,
				0
			);
			const pages = [...ids.values()].reduce(
				(sum, id) =>
					sum + (documentsStore.documents.find((document) => document.id === id)?.pages ?? 0),
				0
			);
			const cases = [
				{
					id: 'malik-multi-source',
					query: 'Que sait-on du statut et des activités de Malk Ouedragoo ?',
					documents: [
						'malik-profile-study.docx',
						'malik-profile-family.docx',
						'malik-profile-note.txt'
					],
					evidence: ['Étudiant', 'Marié', 'violoncelle'],
					answerable: true,
					locator: null
				},
				{
					id: 'table-bx77',
					query: 'Quelle est la capcité de BX-77 ?',
					documents: ['near-identifiers-table.docx'],
					evidence: ['42 kg'],
					answerable: true,
					locator: null
				},
				{
					id: 'table-8x77',
					query: 'Quelle est la capacité de 8X-77 ?',
					documents: ['near-identifiers-table.docx'],
					evidence: ['7 kg'],
					answerable: true,
					locator: null
				},
				{
					id: 'table-near-negative',
					query: 'Quelle est la capacité de BX-72 ?',
					documents: [],
					evidence: [],
					answerable: false,
					locator: null
				},
				{
					id: 'tatqa-total-sales-2019',
					query: 'Quel est le total des ventes en 2019 ?',
					documents: ['tatqa-contract-sales.md'],
					evidence: ['Total sales $1,496.5'],
					answerable: true,
					locator: null
				},
				{
					id: 'tatqa-other-change',
					query: 'Quelle est la variation de Other entre 2018 et 2019 ?',
					documents: ['tatqa-contract-sales.md'],
					evidence: ['Other 44.1 56.7'],
					answerable: true,
					locator: null
				},
				{
					id: 'finqa-american-express-average',
					query: 'Quel volume de paiement moyen par transaction a American Express ?',
					documents: ['finqa-payment-networks.txt'],
					evidence: ['American Express 637 647 5.0 86'],
					answerable: true,
					locator: null
				},
				{
					id: 'financial-two-document-evidence',
					query:
						'Donne le total des ventes 2019 et les données American Express nécessaires au volume moyen par transaction.',
					documents: ['tatqa-contract-sales.md', 'finqa-payment-networks.txt'],
					evidence: ['Total sales $1,496.5', 'American Express 637 647 5.0'],
					answerable: true,
					locator: null
				},
				{
					id: 'financial-table-negative',
					query: 'Quel est le nom du PDG de Discover dans ce tableau ?',
					documents: [],
					evidence: [],
					answerable: false,
					locator: null
				},
				...publicQa.cases.map((item) => ({
					id: item.id,
					query: item.noisyQuery,
					documents: item.document?.split('+') ?? [],
					evidence: item.evidenceContains
						? Array.isArray(item.evidenceContains)
							? item.evidenceContains
							: [item.evidenceContains]
						: [],
					answerable: item.answerable,
					locator: item.locator
				}))
			];
			const evaluations: RetrievalEvaluation[] = [];
			const ablationEvaluations: Record<'lexical' | 'fuzzy' | 'dense', RetrievalEvaluation[]> = {
				lexical: [],
				fuzzy: [],
				dense: []
			};
			const failures: string[] = [];
			const ablationFailures: Record<'lexical' | 'fuzzy' | 'dense', string[]> = {
				lexical: [],
				fuzzy: [],
				dense: []
			};
			const timings: Array<{ id: string; ms: number }> = [];
			let queryRewriteMs = 0;
			let queryRewriteCount = 0;
			for (const test of cases) {
				const rewriteStarted = performance.now();
				const alternateQueries =
					llmStore.status === 'ready'
						? await crossLingualQueryVariants(
								test.query,
								[...ids.values()].map(
									(id) =>
										documentsStore.documents.find((document) => document.id === id)?.language ??
										null
								),
								(messages) =>
									llmStore.generate(messages, () => {}, {
										reasoning: 'off',
										maxTokens: 96,
										temperature: 0
									})
							)
						: [];
				if (alternateQueries.length) {
					queryRewriteMs += performance.now() - rewriteStarted;
					queryRewriteCount++;
				}
				const t0 = performance.now();
				const hits = await documentsStore.retrieve(
					test.query,
					[...ids.values()],
					test.query,
					undefined,
					undefined,
					alternateQueries
				);
				const latencyMs = performance.now() - t0;
				timings.push({ id: test.id, ms: Math.round(latencyMs) });
				const answerBearing =
					!isWeakMatch(hits) && hasAnswerBearingEvidence(test.query, hits, alternateQueries);
				const normalizedEvidence = test.evidence.map(normalizeForFuzzy);
				const matchedEvidence = normalizedEvidence.filter((needle) =>
					hits.some((hit) => containsEvidence(`${hit.headingPath ?? ''}\n${hit.text}`, needle))
				);
				const canonicalRfcId = ids.get('rfc9110.txt')!;
				const canonicalize = (id: string) =>
					test.id !== 'cross-format-rfc' &&
					(id === ids.get('rfc9110.txt') || id === ids.get('rfc9110.pdf'))
						? canonicalRfcId
						: id;
				const expectedIds = [
					...new Set(
						test.documents.flatMap((name) => (ids.has(name) ? [canonicalize(ids.get(name)!)] : []))
					)
				];
				const retrievedIds = answerBearing
					? [...new Set(hits.map((hit) => canonicalize(hit.documentId)))]
					: [];
				const page =
					typeof test.locator === 'string' ? /page (\d+)/i.exec(test.locator)?.[1] : null;
				const citationValid =
					!test.answerable ||
					(matchedEvidence.length === normalizedEvidence.length &&
						(!page ||
							hits.some(
								(hit) =>
									hit.page === Number(page) && expectedIds.includes(canonicalize(hit.documentId))
							)));
				const channels = await documentsStore.retrieveChannelCandidates(
					test.query,
					[...ids.values()],
					alternateQueries
				);
				for (const [channel, channelHits] of Object.entries(channels) as Array<
					['lexical' | 'fuzzy' | 'dense', typeof hits]
				>) {
					// Raw one-channel RRF peaks below production's two-channel weak-score
					// threshold. Ablation measures evidence retrieval, not fused refusal calibration.
					const channelAnswerBearing = hasAnswerBearingEvidence(
						test.query,
						channelHits,
						alternateQueries
					);
					const channelEvidence = normalizedEvidence.filter((needle) =>
						channelHits.some((hit) =>
							containsEvidence(`${hit.headingPath ?? ''}\n${hit.text}`, needle)
						)
					);
					const channelIds = channelAnswerBearing
						? [...new Set(channelHits.map((hit) => canonicalize(hit.documentId)))]
						: [];
					ablationEvaluations[channel].push({
						expectedIds,
						retrievedIds: channelIds,
						answerable: test.answerable,
						expectedEvidence: normalizedEvidence,
						retrievedEvidence: channelEvidence,
						citationValid:
							!test.answerable ||
							(channelEvidence.length === normalizedEvidence.length &&
								(!page ||
									channelHits.some(
										(hit) =>
											hit.page === Number(page) &&
											expectedIds.includes(canonicalize(hit.documentId))
									)))
					});
					const channelRecall = expectedIds.every((id) => channelIds.slice(0, 5).includes(id));
					const channelCitation =
						!test.answerable ||
						(channelEvidence.length === normalizedEvidence.length &&
							(!page ||
								channelHits.some(
									(hit) =>
										hit.page === Number(page) && expectedIds.includes(canonicalize(hit.documentId))
								)));
					if (
						(test.answerable && (!channelRecall || !channelCitation)) ||
						(!test.answerable && channelIds.length)
					) {
						ablationFailures[channel].push(
							`${test.id}: answerBearing=${channelAnswerBearing} recall5=${channelRecall} evidence=${channelEvidence.length}/${normalizedEvidence.length} citation=${channelCitation} top=${channelHits
								.slice(0, 5)
								.map(
									(hit) =>
										`${hit.documentName}@${hit.page ?? hit.headingPath ?? '-'}:${normalizeForFuzzy(hit.text).slice(0, 90)}`
								)
								.join(' | ')}`
						);
					}
				}
				evaluations.push({
					expectedIds,
					retrievedIds,
					answerable: test.answerable,
					expectedEvidence: normalizedEvidence,
					retrievedEvidence: matchedEvidence,
					citationValid,
					latencyMs
				});
				if (
					(test.answerable &&
						(!expectedIds.every((id) => retrievedIds.slice(0, 5).includes(id)) ||
							!citationValid)) ||
					(!test.answerable && retrievedIds.length)
				)
					failures.push(
						`${test.id}: answerBearing=${answerBearing} recall5=${expectedIds.every((id) => retrievedIds.slice(0, 5).includes(id))} evidence=${matchedEvidence.length}/${normalizedEvidence.length} citation=${citationValid} top=${hits
							.slice(0, 5)
							.map(
								(hit) =>
									`${hit.documentName}@${hit.page ?? hit.headingPath ?? '-'}:${normalizeForFuzzy(hit.text).slice(0, 80)}`
							)
							.join(' | ')}`
					);
			}
			const metrics = evaluateRetrieval(evaluations);
			const ablation = {
				lexical: evaluateRetrieval(ablationEvaluations.lexical),
				fuzzy: evaluateRetrieval(ablationEvaluations.fuzzy),
				dense: evaluateRetrieval(ablationEvaluations.dense)
			};
			const profiles = { fused: metrics, ...ablation };
			const baselineRegressions = Object.entries(fuzzyBaseline.minimum).flatMap(
				([profile, minimums]) =>
					Object.entries(minimums).flatMap(([metric, minimum]) =>
						profiles[profile as keyof typeof profiles][metric as keyof RetrievalMetrics] < minimum
							? [`${profile}.${metric}`]
							: []
					)
			);
			if (metrics.p95LatencyMs > fuzzyBaseline.maximum.fusedP95LatencyMs)
				baselineRegressions.push('fused.p95LatencyMs');
			fuzzyBenchmarkReport = {
				metrics,
				ablation,
				ingestMs,
				queryRewriteMs: Math.round(queryRewriteMs),
				queryRewriteCount,
				bytes,
				cases: cases.length,
				failures,
				ablationFailures,
				baseline: { version: fuzzyBaseline.version, regressions: baselineRegressions },
				slowest: timings.sort((left, right) => right.ms - left.ms).slice(0, 5),
				cost: {
					databaseBytesBefore,
					databaseBytesAfter,
					databaseDeltaBytes: databaseBytesAfter - databaseBytesBefore,
					browserStorageBytesBefore,
					browserStorageBytesAfter,
					browserStorageDeltaBytes: browserStorageBytesAfter - browserStorageBytesBefore,
					sampledPeakMemoryBytes,
					chunks: indexedChunks.length,
					indexedTextBytes,
					embeddingBytes: indexedChunks.length * (documentsStore.embeddingProfile?.dims ?? 0) * 4,
					pages,
					megabytesPerSecond: bytes / 1_048_576 / Math.max(ingestMs / 1000, 0.001),
					pagesPerSecond: pages / Math.max(ingestMs / 1000, 0.001)
				}
			};
			await refreshIndexDiagnostics();
		} catch (error) {
			fuzzyBenchmarkError = error instanceof Error ? error.message : String(error);
		} finally {
			fuzzyBenchmarking = false;
		}
	}

	async function runMartinDiagnostic() {
		const document = documentsStore.documents.find((item) => /compromis compromis/i.test(item.name));
		if (!document) {
			compromisDiagnostic = { error: 'Martin document not found' };
			return;
		}
		compromisDiagnostic = await runMartinStress({
			documentId: document.id,
			retrieve: (question, documentIds) => documentsStore.retrieve(question, documentIds)
		});
	}

	async function runMartinReindexDiagnostic() {
		const document = documentsStore.documents.find((item) => /compromis compromis/i.test(item.name));
		if (!document) {
			compromisReindexReport = { error: 'Martin document not found' };
			return;
		}
		await documentsStore.reindex(document.id);
		compromisReindexReport = documentsStore.ingests[document.id] ?? { error: 'No ingest state' };
		await refreshIndexDiagnostics();
	}

	async function runAssuranceReindexDiagnostic() {
		const document = documentsStore.documents.find((item) =>
			/assurance habitation devis/i.test(item.name)
		);
		if (!document) {
			compromisReindexReport = { error: 'Assurance document not found' };
			return;
		}
		await documentsStore.reindex(document.id);
		privateRetrievalCache.clear();
		compromisReindexReport = documentsStore.ingests[document.id] ?? { error: 'No ingest state' };
		await refreshIndexDiagnostics();
	}

	async function runMartinAnswerBenchmark() {
		const document = documentsStore.documents.find((item) => /compromis compromis/i.test(item.name));
		if (!document || llmStore.status !== 'ready') {
			compromisAnswerReport = {
				error: !document ? 'Martin document not found' : `Private model is ${llmStore.status}`
			};
			return;
		}
		compromisAnswerBenchmarking = true;
		compromisAnswerProgress = { completed: 0, total: 44 };
		compromisAnswerReport = null;
		try {
			compromisAnswerReport = await runMartinAnswerStress({
				documentId: document.id,
				retrieve: (question, documentIds) => documentsStore.retrieve(question, documentIds),
				generate: async (messages, question, hits) => {
					const extractive = buildDeterministicExtractiveAnswer(question, hits);
					if (extractive) return enforceAnswerInvariants(question, extractive);
					const options = generationOptionsFor(question, 'targeted');
					const draft = stripThink(await llmStore.generate(messages, () => {}, options));
					return verifyBenchmarkAnswer(question, 'targeted', hits, draft);
				},
				onProgress: (completed, total) => (compromisAnswerProgress = { completed, total })
			});
		} finally {
			compromisAnswerBenchmarking = false;
		}
	}

	async function runPublicAnswerBenchmark(caseIds: string[] | null = null) {
		if (llmStore.status !== 'ready') {
			publicAnswerReport = { error: `Private model is ${llmStore.status}` };
			return;
		}
		const names = new Set(FUZZY_FIXTURE_NAMES);
		const documents = documentsStore.documents.filter(
			(document) => names.has(document.name) && document.status === 'ready'
		);
		if (documents.length !== FUZZY_FIXTURE_NAMES.length) {
			publicAnswerReport = {
				error: `Expected ${FUZZY_FIXTURE_NAMES.length} ready fixtures, found ${documents.length}`
			};
			return;
		}
		publicAnswerBenchmarking = true;
		const cases = caseIds
			? PUBLIC_ANSWER_STRESS_CASES.filter((item) => caseIds.includes(item.id))
			: PUBLIC_ANSWER_STRESS_CASES;
		publicAnswerProgress = { completed: 0, total: cases.length };
		publicAnswerReport = null;
		try {
			publicAnswerReport = await runPublicAnswerStress({
				cases,
				documentIds: documents.map((document) => document.id),
				retrieve: async (question, documentIds) => {
					const alternateQueries = await crossLingualQueryVariants(
						question,
						documents.map((document) => document.language),
						(messages) =>
							llmStore.generate(messages, () => {}, {
								reasoning: 'off',
								maxTokens: 96,
								temperature: 0
							})
					);
					const hits = await documentsStore.retrieve(
						question,
						documentIds,
						question,
						undefined,
						undefined,
						alternateQueries
					);
					return { hits, alternateQueries };
				},
				generate: async (messages, question, route, hits) => {
					const extractive = buildDeterministicExtractiveAnswer(question, hits);
					if (extractive) return enforceAnswerInvariants(question, extractive);
					const options = generationOptionsFor(question, route);
					const draft = stripThink(await llmStore.generate(messages, () => {}, options));
					return verifyBenchmarkAnswer(question, route, hits, draft);
				},
				resolveRoute: async (question) => {
					const frame = await resolveQuestion(question, (texts) =>
						documentsStore.embedQueries(texts)
					);
					return buildExecutionPlan(question, frame).route === 'synthesis'
						? 'synthesis'
						: 'targeted';
				},
				onProgress: (completed, total) => (publicAnswerProgress = { completed, total })
			});
		} finally {
			publicAnswerBenchmarking = false;
		}
	}

	async function runQueryRewriteDiagnostic() {
		const questions = [
			'Le cadre est il obligatoir et propre a un sectuer ?',
			'A quelle ligen du 1040 calcule t on le revneu total ?',
			'Quelles lignes distinguent le remboursemnt demande du montant du ?'
		];
		const documents = documentsStore.documents.filter(
			(document) => FUZZY_FIXTURE_NAMES.includes(document.name) && document.status === 'ready'
		);
		const results = [];
		for (const question of questions) {
			const alternateQueries = await crossLingualQueryVariants(
				question,
				documents.map((document) => document.language),
				(messages) =>
					llmStore.generate(messages, () => {}, {
						reasoning: 'off',
						maxTokens: 96,
						temperature: 0
					})
			);
			const hits = await documentsStore.retrieve(
				question,
				documents.map((document) => document.id),
				question,
				undefined,
				undefined,
				alternateQueries
			);
			results.push({
				question,
				alternateQueries,
				answerBearing: hasAnswerBearingEvidence(question, hits, alternateQueries),
				hits: hits.map((hit) => ({
					document: hit.documentName,
					page: hit.page,
					text: hit.text.slice(0, 360)
				}))
			});
		}
		queryRewriteDiagnostic = results;
	}

	async function handleFiles(files: FileList | null) {
		if (!files) return;
		for (const file of Array.from(files)) {
			await documentsStore.ingest(file);
		}
	}

	function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (status === 'ready') return 'default';
		if (status === 'error') return 'destructive';
		return 'secondary';
	}

	async function runInvoiceBenchmark() {
		benchmarking = true;
		benchmarkReport = null;
		try {
			const count = 25;
			const documentIds: string[] = [];
			for (let number = 1; number <= count; number++) {
				const amount = `${number},25`;
				const file = new File(
					[`FACTURE BENCH-${number}\nClient Benchmark ${number}\nTotal TTC ${amount} EUR\n`],
					`benchmark-invoice-${number}.txt`,
					{ type: 'text/plain' }
				);
				documentIds.push(await documentsStore.ingest(file));
			}
			const retrievalCases = [];
			for (let number = 1; number <= 10; number++) {
				const query = `benchmark-invoice-${number}`;
				const scoped = await documentsStore.retrieve(query, [documentIds[number - 1]]);
				retrievalCases.push({
					query,
					documentIds,
					relevantChunkIds: scoped.map((hit) => hit.chunkId)
				});
			}
			benchmarkReport = await runIntelligenceBenchmark({
				retrievalCases,
				aggregateCases: [
					{
						query: 'Quelle est la somme TTC de toutes les factures ?',
						documentIds,
						expected: [
							{ currency: 'EUR', valueMinor: (100 * count * (count + 1)) / 2 + 25 * count, count }
						]
					}
				],
				retrieve: (query, ids) => documentsStore.retrieve(query, ids),
				aggregate: (query, ids) => documentsStore.aggregate(query, ids),
				generationMetrics:
					llmStore.lastMetrics === null ? undefined : async () => llmStore.lastMetrics!
			});
		} finally {
			benchmarking = false;
		}
	}

	async function runRecordStressBenchmark() {
		benchmarking = true;
		benchmarkReport = null;
		try {
			const fixtures = [
				['/dev/record-stress/repeated-transfers.pdf', 'record-stress-v3.pdf', 'application/pdf'],
				[
					'/dev/record-stress/repeated-transfers.docx',
					'record-stress-v3.docx',
					'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
				],
				['/dev/record-stress/repeated-transfers.txt', 'record-stress-v3.txt', 'text/plain']
			] as const;
			const documentIds: string[] = [];
			for (const [url, name, mime] of fixtures) {
				const bytes = await fetch(url).then((response) => response.arrayBuffer());
				documentIds.push(await documentsStore.ingest(new File([bytes], name, { type: mime })));
			}
			const deadline = Date.now() + 120_000;
			while (Date.now() < deadline) {
				await documentsStore.refreshLibrary();
				const rows = documentIds.map((id) => documentsStore.documents.find((doc) => doc.id === id));
				const failed = rows.find((doc) => doc?.status === 'error');
				if (failed)
					throw new Error(`record-stress ingest failed: ${failed.name} (${failed.error})`);
				if (rows.every((doc) => doc?.status === 'ready')) break;
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			if (
				documentIds.some(
					(id) => documentsStore.documents.find((doc) => doc.id === id)?.status !== 'ready'
				)
			) {
				throw new Error('record-stress ingest timed out');
			}
			const sentFacts = [
				{ currency: 'EUR', valueMinor: 12000, recordId: 'TX-ALPHA-001' },
				{ currency: 'EUR', valueMinor: 8000, recordId: 'TX-BRAVO-002' },
				{ currency: 'EUR', valueMinor: 12000, recordId: 'TX-CHARLIE-003' }
			];
			benchmarkReport = await runIntelligenceBenchmark({
				retrievalCases: [],
				aggregateCases: documentIds.map((documentId) => ({
					query: 'Quelle est la somme totale envoyée en juin ?',
					documentIds: [documentId],
					expected: [{ currency: 'EUR', valueMinor: 32000, count: 3 }],
					expectedFacts: sentFacts
				})),
				retrieve: (query, ids) => documentsStore.retrieve(query, ids),
				aggregate: (query, ids) => documentsStore.aggregate(query, ids)
			});
		} finally {
			benchmarking = false;
		}
	}

	async function runCrossDocumentStressBenchmark() {
		benchmarking = true;
		crossDocumentReport = null;
		try {
			const documentIds: string[] = [];
			for (const fixture of CROSS_DOCUMENT_FIXTURES) {
				documentIds.push(
					await documentsStore.ingest(
						new File([fixture.content], fixture.name, { type: fixture.mime })
					)
				);
			}
			const deadline = Date.now() + 120_000;
			while (Date.now() < deadline) {
				await documentsStore.refreshLibrary();
				const rows = documentIds.map((id) => documentsStore.documents.find((doc) => doc.id === id));
				const failed = rows.find((doc) => doc?.status === 'error');
				if (failed)
					throw new Error(`cross-document ingest failed: ${failed.name} (${failed.error})`);
				if (rows.every((doc) => doc?.status === 'ready')) break;
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			const retrievedNames: string[][] = [];
			for (const test of CROSS_DOCUMENT_CASES) {
				const hits = await documentsStore.retrieve(test.query, documentIds);
				retrievedNames.push(
					isWeakMatch(hits) || !hasAnswerBearingEvidence(test.query, hits)
						? []
						: [...new Set(hits.slice(0, 5).map((hit) => hit.documentName))]
				);
			}
			crossDocumentReport = {
				...scoreCrossDocumentEvidence(CROSS_DOCUMENT_CASES, retrievedNames),
				failures: CROSS_DOCUMENT_CASES.flatMap((test, index) => {
					const retrieved = retrievedNames[index] ?? [];
					return test.relevantDocuments.every((name) => retrieved.includes(name)) &&
						(test.relevantDocuments.length > 0 || retrieved.length === 0)
						? []
						: [{ query: test.query, expected: test.relevantDocuments, retrieved }];
				})
			};
		} finally {
			benchmarking = false;
		}
	}

	async function runGenerationBenchmark() {
		generationBenchmarking = true;
		try {
			if (llmStore.status === 'needs-download') await llmStore.prepare();
			if (llmStore.status !== 'ready') return;
			await llmStore.generate(
				[
					{ role: 'system', content: 'Answer directly and briefly.' },
					{ role: 'user', content: 'Write one sentence explaining why exact arithmetic matters.' }
				],
				() => {},
				{ reasoning: 'off', maxTokens: 160 }
			);
		} finally {
			generationBenchmarking = false;
		}
	}
</script>

<svelte:head><title>Regeste · dev pipeline</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6 p-8">
	<div>
		<h1 class="font-display text-2xl tracking-tight">Pipeline harness</h1>
		<p class="text-muted-foreground text-sm">
			Dev-only page exercising the local database and document pipeline (spec 002).
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Intelligence benchmark</Card.Title>
			<Card.Description>25 synthetic invoices, entirely on this device.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3">
			<div class="flex flex-wrap gap-2">
				<Button onclick={runInvoiceBenchmark} disabled={benchmarking}>
					{benchmarking ? 'Running benchmark…' : 'Run invoice benchmark'}
				</Button>
				<Button
					variant="outline"
					onclick={runGenerationBenchmark}
					disabled={generationBenchmarking}
				>
					{generationBenchmarking ? 'Measuring generation…' : 'Run generation benchmark'}
				</Button>
				<Button
					variant="outline"
					onclick={() =>
						runPublicAnswerBenchmark([
							'irs-total-income',
							'irs-refund-owed',
							'tatqa-change',
							'cross-document-arithmetic'
						])}
					disabled={publicAnswerBenchmarking}
				>
					Run public answer regressions
				</Button>
				<Button
					variant="outline"
					onclick={() => runPublicAnswerBenchmark()}
					disabled={publicAnswerBenchmarking}
				>
					{publicAnswerBenchmarking
						? `Answering public ${publicAnswerProgress.completed}/${publicAnswerProgress.total}…`
						: 'Run public answer benchmark'}
				</Button>
				<Button variant="outline" onclick={runCrossDocumentStressBenchmark} disabled={benchmarking}>
					Run cross-document benchmark
				</Button>
				<Button variant="outline" onclick={repairEmptyIndexes} disabled={repairingIndexes}>
					{repairingIndexes ? 'Repairing empty indexes…' : 'Repair empty indexes'}
				</Button>
				<Button variant="outline" onclick={runFuzzyBenchmark} disabled={fuzzyBenchmarking}>
					{fuzzyBenchmarking ? 'Running fuzzy benchmark…' : 'Run fuzzy benchmark'}
				</Button>
				<Button variant="outline" onclick={runMartinDiagnostic}>Run Martin diagnostic</Button>
				<Button variant="outline" onclick={runMartinReindexDiagnostic}>Re-index Martin</Button>
				<Button variant="outline" onclick={runAssuranceReindexDiagnostic}>Re-index Assurance</Button
				>
				<Button
					variant="outline"
					onclick={runMartinAnswerBenchmark}
					disabled={compromisAnswerBenchmarking}
				>
					{compromisAnswerBenchmarking
						? `Answering ${compromisAnswerProgress.completed}/${compromisAnswerProgress.total}…`
						: 'Run Martin answer benchmark'}
				</Button>
				<Button
					variant="outline"
					onclick={runSemanticRoutingBenchmark}
					disabled={semanticBenchmarking}
				>
					{semanticBenchmarking ? 'Running semantic benchmark…' : 'Run semantic benchmark'}
				</Button>
				<Button variant="outline" onclick={resetFuzzyFixtures}>Reset fuzzy fixtures</Button>
				<Button variant="outline" onclick={runIngestUxScenario}>Run ingest UX scenario</Button>
				<Button variant="outline" onclick={runQueryRewriteDiagnostic}>Run rewrite diagnostic</Button
				>
				<Button variant="outline" onclick={importPdfFromClipboard}>Import clipboard PDF</Button>
				<Textarea
					aria-label="Private document benchmark JSON"
					placeholder="Paste private document benchmark JSON…"
					class="min-h-20 min-w-80 font-mono text-xs"
					bind:value={privateBenchmarkMatrixText}
				/>
				<Button
					variant="outline"
					onclick={runClipboardPrivateRetrievalBenchmark}
					disabled={privateDocumentBenchmarking ||
						privateChannelBenchmarking ||
						!privateBenchmarkMatrixText.trim()}
				>
					{privateDocumentBenchmarking
						? `${privateBenchmarkStageLabel(privateDocumentBenchmarkStage)} ${privateDocumentBenchmarkProgress.completed}/${privateDocumentBenchmarkProgress.total}…`
						: 'Run fast retrieval gate'}
				</Button>
				<Button
					variant="outline"
					onclick={runPrivateChannelDiagnostic}
					disabled={privateDocumentBenchmarking ||
						privateChannelBenchmarking ||
						!privateBenchmarkMatrixText.trim()}
				>
					{privateChannelBenchmarking
						? `Comparing ${privateChannelProgress.completed}/${privateChannelProgress.total}…`
						: 'Compare retrieval channels'}
				</Button>
				<Button
					variant="outline"
					onclick={() => runClipboardPrivateDocumentBenchmark(false)}
					disabled={privateDocumentBenchmarking ||
						privateChannelBenchmarking ||
						llmStore.status !== 'ready' ||
						!privateBenchmarkMatrixText.trim()}
				>
					{privateDocumentBenchmarking
						? `${privateBenchmarkStageLabel(privateDocumentBenchmarkStage)} ${privateDocumentBenchmarkProgress.completed}/${privateDocumentBenchmarkProgress.total}…`
						: llmStore.status === 'ready'
							? 'Run private document benchmark'
							: 'Private model loading…'}
				</Button>
				<Button
					variant="outline"
					onclick={() => runClipboardPrivateDocumentBenchmark(true)}
					disabled={privateDocumentBenchmarking ||
						privateChannelBenchmarking ||
						llmStore.status !== 'ready' ||
						!privateBenchmarkMatrixText.trim() ||
						!privateRunCheckpoint ||
						privateRunCheckpoint.completed >= privateRunCheckpoint.total}
				>
					{privateRunCheckpoint && privateRunCheckpoint.completed < privateRunCheckpoint.total
						? `Resume private benchmark (${privateRunCheckpoint.completed}/${privateRunCheckpoint.total})`
						: 'Resume private benchmark'}
				</Button>
				<Button
					variant="outline"
					onclick={exportPrivateConsolidatedReport}
					disabled={privateDocumentBenchmarking || !privateRunCheckpoint}
				>
					Export consolidated report
				</Button>
			</div>
			{#if clipboardImportStatus}
				<p class="text-muted-foreground font-mono text-xs">{clipboardImportStatus}</p>
			{/if}
			{#if llmStore.lastMetrics}
				<pre class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						llmStore.lastMetrics,
						null,
						2
					)}</pre>
			{/if}
			{#if benchmarkReport}
				<pre class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						benchmarkReport,
						null,
						2
					)}</pre>
			{/if}
			{#if crossDocumentReport}
				<pre class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						crossDocumentReport,
						null,
						2
					)}</pre>
			{/if}
			{#if fuzzyBenchmarkReport}
				<pre class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						fuzzyBenchmarkReport,
						null,
						2
					)}</pre>
			{/if}
			{#if fuzzyBenchmarkError}
				<p class="text-destructive text-sm">{fuzzyBenchmarkError}</p>
			{/if}
			{#if compromisDiagnostic}
				<pre
					data-testid="compromis-stress-report"
					class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						compromisDiagnostic,
						null,
						2
					)}</pre>
			{/if}
			{#if compromisReindexReport}
				<pre
					data-testid="compromis-reindex-report"
					class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						compromisReindexReport,
						null,
						2
					)}</pre>
			{/if}
			{#if compromisAnswerReport}
				<pre
					data-testid="compromis-answer-report"
					class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						compromisAnswerReport,
						null,
						2
					)}</pre>
			{/if}
			{#if publicAnswerReport}
				<pre
					data-testid="public-answer-report"
					class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						publicAnswerReport,
						null,
						2
					)}</pre>
			{/if}
			{#if queryRewriteDiagnostic}
				<pre
					data-testid="query-rewrite-report"
					class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						queryRewriteDiagnostic,
						null,
						2
					)}</pre>
			{/if}
			{#if semanticBenchmarkReport}
				<pre
					data-testid="semantic-benchmark-report"
					class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						semanticBenchmarkReport,
						null,
						2
					)}</pre>
			{/if}
			{#if semanticBenchmarkError}
				<p data-testid="semantic-benchmark-error" class="text-destructive text-sm">
					{semanticBenchmarkError}
				</p>
			{/if}
			{#if privateDocumentBenchmarkReport}
				<pre
					data-testid="private-document-benchmark-report"
					class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						privateDocumentBenchmarkReport,
						null,
						2
					)}</pre>
			{/if}
			{#if privateChannelReport}
				<pre
					data-testid="private-channel-report"
					class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						privateChannelReport,
						null,
						2
					)}</pre>
			{/if}
			{#if privateConsolidatedReport}
				<pre
					data-testid="private-consolidated-report"
					class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						privateConsolidatedReport,
						null,
						2
					)}</pre>
			{/if}
			{#if privateRunCheckpoint && privateReviewResult && privateReviewSummary}
				<div data-testid="private-human-review" class="space-y-3 rounded-md border p-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div>
							<p class="font-medium">Human source review</p>
							<p class="text-muted-foreground text-xs">
								{privateReviewSummary.reviewed}/{privateRunCheckpoint.total} reviewed ·
								{privateReviewSummary.passed} pass · {privateReviewSummary.failed} product fail ·
								{privateReviewSummary.oracleInvalid} oracle issue
							</p>
						</div>
						<div class="flex gap-2">
							<Button
								variant="outline"
								disabled={privateReviewIndex === 0}
								onclick={() => (privateReviewIndex = Math.max(0, privateReviewIndex - 1))}
								>Previous</Button
							>
							<Button
								variant="outline"
								disabled={privateReviewIndex >= privateRunCheckpoint.results.length - 1}
								onclick={() =>
									(privateReviewIndex = Math.min(
										privateRunCheckpoint!.results.length - 1,
										privateReviewIndex + 1
									))}>Next</Button
							>
						</div>
					</div>
					<p class="text-sm font-medium">
						{privateReviewIndex + 1}. {privateReviewResult.question}
					</p>
					<p class="text-sm">{privateReviewResult.answer}</p>
					<pre class="bg-muted max-h-72 overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
							{
								automatic: {
									passed: privateReviewResult.passed,
									retrieval: privateReviewResult.retrievalPassed,
									answer: privateReviewResult.answerPassed,
									citation: privateReviewResult.citationPassed
								},
								retrievedPages: privateReviewResult.retrievedPages,
								citedPages: privateReviewResult.citedPages,
								evidence: privateReviewResult.rawRetrievedEvidence
							},
							null,
							2
						)}</pre>
					<Textarea
						aria-label="Human review note"
						placeholder="Source-based review note…"
						bind:value={privateReviewNote}
					/>
					<div class="flex flex-wrap gap-2">
						<Button onclick={() => reviewPrivateResult('pass')}>Human pass</Button>
						<Button variant="destructive" onclick={() => reviewPrivateResult('fail')}
							>Product fail</Button
						>
						<Button variant="outline" onclick={() => reviewPrivateResult('oracle-invalid')}
							>Oracle issue</Button
						>
					</div>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if documentsStore.dbError}
		<Card.Root class="border-destructive">
			<Card.Content class="text-destructive text-sm">{documentsStore.dbError}</Card.Content>
		</Card.Root>
	{:else if documentsStore.dbInfo}
		<p class="text-muted-foreground font-mono text-xs tracking-wide uppercase">
			sqlite {documentsStore.dbInfo.sqliteVersion} · vec {documentsStore.dbInfo.vecVersion} · fts5
			{documentsStore.dbInfo.fts5 ? 'on' : 'off'} · {documentsStore.dbInfo.vfs} · schema v{documentsStore
				.dbInfo.schemaVersion}
		</p>
	{:else}
		<p class="text-muted-foreground text-sm">Opening local database…</p>
	{/if}
	{#if indexDiagnostics}
		<pre class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
				{
					documents: indexDiagnostics.length,
					chunks: indexDiagnostics.reduce((sum, row) => sum + row.chunks, 0),
					empty: indexDiagnostics
						.filter((row) => row.status === 'ready' && row.chunks === 0)
						.map((row) => row.name),
					stale: indexDiagnostics
						.filter((row) => row.status === 'ready' && row.retrievalVersion < RETRIEVAL_VERSION)
						.map((row) => row.name),
					compromis: indexDiagnostics.filter((row) => /compromis/i.test(row.name)),
					ingests: documentsStore.ingests
				},
				null,
				2
			)}</pre>
	{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="rounded-lg border border-dashed p-8 text-center transition-colors {dragOver
			? 'border-primary bg-accent'
			: 'border-border'}"
		ondragover={(e) => {
			e.preventDefault();
			dragOver = true;
		}}
		ondragleave={() => (dragOver = false)}
		ondrop={(e) => {
			e.preventDefault();
			dragOver = false;
			handleFiles(e.dataTransfer?.files ?? null);
		}}
	>
		<p class="text-muted-foreground mb-3 text-sm">Drop PDF / DOCX / Markdown / TXT here, or</p>
		<Button onclick={() => fileInput?.click()}>Choose files</Button>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			accept=".pdf,.docx,.md,.markdown,.txt"
			class="hidden"
			onchange={(e) => handleFiles(e.currentTarget.files)}
		/>
	</div>

	<div class="space-y-2">
		{#each documentsStore.documents as doc (doc.id)}
			{@const ingest = documentsStore.ingests[doc.id]}
			<Card.Root>
				<Card.Content class="flex items-center gap-4 py-3">
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{doc.name}</p>
						<p class="text-muted-foreground font-mono text-xs">
							{(doc.size / 1024).toFixed(0)} KB{doc.pages ? ` · ${doc.pages} pages` : ''}
						</p>
						{#if ingest && doc.status === 'embedding'}
							<Progress value={ingest.phaseProgress * 100} class="mt-2 h-1" />
						{/if}
					</div>
					{#if ingest?.dedup}
						<Badge variant="outline">already indexed</Badge>
					{/if}
					<Badge variant={statusVariant(ingest?.status ?? doc.status)}
						>{ingest?.error ?? ingest?.status ?? doc.error ?? doc.status}</Badge
					>
					<Button variant="ghost" size="sm" onclick={() => documentsStore.remove(doc.id)}>
						Delete
					</Button>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<form
		class="flex gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			documentsStore.search(query);
		}}
	>
		<Input bind:value={query} placeholder="Search your documents…" />
		<Button type="submit" disabled={documentsStore.searching}>
			{documentsStore.searching ? 'Searching…' : 'Search'}
		</Button>
	</form>

	{#if documentsStore.lastSearchMs !== null}
		<p class="text-muted-foreground font-mono text-xs tracking-wide uppercase">
			{documentsStore.results.length} passages · {documentsStore.lastSearchMs} ms (embed + hybrid search)
		</p>
	{/if}

	<div class="space-y-2">
		{#each documentsStore.results as hit (hit.chunkId)}
			<Card.Root>
				<Card.Content class="py-3">
					<p class="text-muted-foreground mb-1 font-mono text-xs">
						{hit.documentName}{hit.page ? ` · page ${hit.page}` : ''}{hit.headingPath
							? ` · ${hit.headingPath}`
							: ''} · score {hit.score.toFixed(4)}
					</p>
					<p class="text-sm">{hit.text.slice(0, 400)}{hit.text.length > 400 ? '…' : ''}</p>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
</div>

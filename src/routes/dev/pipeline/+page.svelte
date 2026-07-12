<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import * as Card from '$lib/components/ui/card';
	import { documentsStore } from '$lib/state/documents.svelte';
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
		'cfr-fiberboard-boxes.pdf',
		'federal-register-two-column.pdf',
		'apollo-flight-planning-report.pdf',
		'rfc9110.txt',
		'rfc9110.pdf'
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
		bytes: number;
		cases: number;
		failures: string[];
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
	let semanticBenchmarking = $state(false);
	let semanticBenchmarkReport = $state<SemanticBenchmarkReport | null>(null);
	let semanticBenchmarkError = $state<string | null>(null);

	onMount(async () => {
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
				['/dev/fuzzy-public/rfc9110.pdf', 'rfc9110.pdf', 'application/pdf']
			] as const;
			const started = performance.now();
			let bytes = 0;
			const ids = new SvelteMap<string, string>();
			for (const [url, name, mime] of fixtures) {
				const reusable = documentsStore.documents
					.filter((document) => document.name === name && document.status === 'ready')
					.sort((left, right) => right.size - left.size)[0];
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
				bytes += data.byteLength;
				ids.set(name, await documentsStore.ingest(new File([data], name, { type: mime })));
			}
			await waitUntilReady([...ids.values()]);
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
				...publicQa.cases.map((item) => ({
					id: item.id,
					query: item.noisyQuery,
					documents: item.document?.split('+') ?? [],
					evidence: item.evidenceContains ? [item.evidenceContains] : [],
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
			const timings: Array<{ id: string; ms: number }> = [];
			for (const test of cases) {
				const t0 = performance.now();
				const hits = await documentsStore.retrieve(test.query, [...ids.values()]);
				const latencyMs = performance.now() - t0;
				timings.push({ id: test.id, ms: Math.round(latencyMs) });
				const answerBearing = !isWeakMatch(hits) && hasAnswerBearingEvidence(test.query, hits);
				const normalizedEvidence = test.evidence.map(normalizeForFuzzy);
				const matchedEvidence = normalizedEvidence.filter((needle) =>
					hits.some((hit) => containsEvidence(hit.text, needle))
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
				const channels = await documentsStore.retrieveChannelCandidates(test.query, [
					...ids.values()
				]);
				for (const [channel, channelHits] of Object.entries(channels) as Array<
					['lexical' | 'fuzzy' | 'dense', typeof hits]
				>) {
					const channelAnswerBearing =
						!isWeakMatch(channelHits) && hasAnswerBearingEvidence(test.query, channelHits);
					const channelEvidence = normalizedEvidence.filter((needle) =>
						channelHits.some((hit) => containsEvidence(hit.text, needle))
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
			fuzzyBenchmarkReport = {
				metrics: evaluateRetrieval(evaluations),
				ablation: {
					lexical: evaluateRetrieval(ablationEvaluations.lexical),
					fuzzy: evaluateRetrieval(ablationEvaluations.fuzzy),
					dense: evaluateRetrieval(ablationEvaluations.dense)
				},
				ingestMs,
				bytes,
				cases: cases.length,
				failures,
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
		const query = 'Quel est le prxi de vnete exct du bien Cpelle ?';
		const hits = await documentsStore.retrieve(query, [document.id]);
		compromisDiagnostic = {
			answerBearing: hasAnswerBearingEvidence(query, hits),
			hits: hits.map((hit) => ({
				page: hit.page,
				score: hit.score,
				text: hit.text.slice(0, 180)
			}))
		};
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

<svelte:head><title>Folio · dev pipeline</title></svelte:head>

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
				<Button
					variant="outline"
					onclick={runSemanticRoutingBenchmark}
					disabled={semanticBenchmarking}
				>
					{semanticBenchmarking ? 'Running semantic benchmark…' : 'Run semantic benchmark'}
				</Button>
				<Button variant="outline" onclick={resetFuzzyFixtures}>Reset fuzzy fixtures</Button>
			</div>
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
				<pre class="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(
						compromisDiagnostic,
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
					compromis: indexDiagnostics.filter((row) => /compromis/i.test(row.name))
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

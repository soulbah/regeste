<script lang="ts">
	import { onMount } from 'svelte';
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

	let fileInput = $state<HTMLInputElement | null>(null);
	let query = $state('');
	let dragOver = $state(false);
	let benchmarking = $state(false);
	let generationBenchmarking = $state(false);
	let benchmarkReport = $state<IntelligenceBenchmarkReport | null>(null);

	onMount(() => {
		documentsStore.init();
		llmStore.init();
	});

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
					<Badge variant={statusVariant(doc.status)}>{doc.error ?? doc.status}</Badge>
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

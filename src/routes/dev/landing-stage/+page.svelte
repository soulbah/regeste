<script lang="ts">
	// The landing's capture stage: the REAL components in the REAL geometry.
	//
	// Nothing here is a replica. PanelShell draws the two rooms exactly as the
	// chat does; the composer is the app's composer with its mode dropdown; the
	// panels are the app's panels fed through their own stores. Playwright
	// element-screenshots #stage per scene × language × scheme, and those files
	// are what the landing shows. Dev-only (see ../+layout.ts).
	//
	// ?scene=hero|cite|review|wais  ?lang=fr|en  ?theme=light|dark
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { setMode } from 'mode-watcher';
	import PanelShell from '$lib/components/panel-shell.svelte';
	import PrivateTurn from '$lib/components/private-turn.svelte';
	import PresendPanel from '$lib/components/presend-panel.svelte';
	import WhatAiSawPanel from '$lib/components/what-ai-saw-panel.svelte';
	import WorkLedger from '$lib/components/work-ledger.svelte';
	import ViewerPanel from '$lib/components/viewer-panel.svelte';
	import DocumentsPanel from '$lib/components/documents-panel.svelte';
	import ChatHeader from '$lib/components/chat-header.svelte';
	import Composer from '$lib/components/composer.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { sessionStore } from '$lib/state/session.svelte';
	import { viewerStore } from '$lib/state/viewer.svelte';
	import { documentsStore } from '$lib/state/documents.svelte';
	import { getLocalDb } from '$lib/local-db/client';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import BrandMark from '$lib/components/brand-mark.svelte';
	import { toast } from 'svelte-sonner';
	import { LANDING_FIXTURE } from '$lib/landing-fixture';
	import type { SearchHit } from '$lib/types';

	const scene = $derived(page.url.searchParams.get('scene') ?? 'hero');
	const lang = $derived(page.url.searchParams.get('lang') === 'en' ? 'en' : 'fr');
	const theme = $derived(page.url.searchParams.get('theme') === 'dark' ? 'dark' : 'light');
	const endcard = $derived(page.url.searchParams.get('endcard') === '1');
	const slowmo = $derived(Number(page.url.searchParams.get('slowmo') ?? '1') || 1);
	const fix = $derived(LANDING_FIXTURE[lang]);

	$effect(() => {
		// The store's async init can land after us; keep forcing the request.
		if (i18n.locale !== lang) i18n.locale = lang;
	});

	// ——— Store seeding per scene, real stores, real panels. ———
	// onMount, not $effect: seeding writes stores the panels also react to and
	// write back, and any tracked read here can chain into an effect loop. The
	// stage is a capture surface; one deterministic pass is exactly right.
	onMount(() => {
		setMode(theme);
		// The root layout's async store init lands after us and restores persisted
		// values; re-seeding is idempotent and simply wins the race.
		seed(fix);
		const again = [800, 1800, 3200].map((ms) => setTimeout(() => seed(fix), ms));
		if (scene === 'cite') void openLease();
		if (scene === 'film')
			void prepareFilm().then(() => {
				filmTimers.push(setTimeout(() => filmToast(), 900 * slowmo));
			});
		return () => {
			again.forEach(clearTimeout);
			filmTimers.forEach(clearTimeout);
		};
	});

	function seed(fixNow: (typeof LANDING_FIXTURE)['fr']) {
		const fix = fixNow;
		// Readiness, in memory only: the composer pill must show the chosen mode
		// as it does in a working app, not the setup state of a blank profile.
		llmStore.status = 'ready';
		sessionStore.user = { id: 'stage', email: 'stage@example.org', name: 'Stage' };
		settingsStore.modeChosen = true;
		// The real header reads the chat: title, document count, egress pill.
		const title = scene === 'review' || scene === 'wais' ? fix.presendQ : fix.question;
		chatsStore.activeChat = {
			id: 'stage',
			title,
			mode: scene === 'review' || scene === 'wais' ? 'assisted' : 'private',
			privateOnly: false,
			reviewSend: null
		} as typeof chatsStore.activeChat;
		chatsStore.chatEgress = null;
		if (scene !== 'film' && chatsStore.chatDocuments.length === 0) {
			chatsStore.chatDocuments = [
				{ id: 'stage-doc', name: fix.doc, status: 'ready', enabled: true }
			] as typeof chatsStore.chatDocuments;
			chatsStore.chatDocumentsLoaded = true;
		}
		if (scene === 'review') {
			settingsStore.assistedConsented = true;
			chatsStore.pendingAssisted = {
				chatId: 'stage',
				question: fix.presendQ,
				hits: fix.presendHits.map((h, index): SearchHit => ({
					chunkId: index + 1,
					documentId: 'stage-doc',
					documentName: fix.doc,
					text: h.text,
					page: h.page,
					headingPath: h.heading,
					score: 0.036 - index * 0.012
				})),
				conversationContext: null,
				route: 'targeted'
			};
		}
		if (scene === 'wais') {
			chatsStore.messages = [
				{ id: 'u1', role: 'user', mode: null, content: fix.presendQ, createdAt: 0 },
				{ id: 'a1', role: 'assistant', mode: 'assisted', content: fix.subletAnswer, createdAt: 1 }
			] as typeof chatsStore.messages;
			chatsStore.excerptsByMessage = {
				a1: fix.presendHits.map((h, index) => ({
					messageId: 'a1',
					chunkId: null,
					sent: index !== 2,
					excluded: index === 2,
					snippet: h.text,
					documentName: fix.doc,
					locator: `p. ${h.page}`
				}))
			};
			chatsStore.privacyByMessage = {
				a1: {
					messageId: 'a1',
					mode: 'assisted',
					destination: 'cloud',
					excerptCount: 2,
					bytesSent: 843
				}
			};
			chatsStore.waisMessageId = 'a1';
		}
	}

	// ——— The film: one continuous take over the real components. ———
	// Playwright types the question into the real composer and presses Enter;
	// everything after that runs on this timeline. 'loading' hides the
	// ingestion behind a cover so the recording can be trimmed to the action.
	type FilmPhase = 'loading' | 'ready' | 'working' | 'answered' | 'viewer' | 'endcard';
	let filmPhase = $state<FilmPhase>('loading');
	let filmSteps = $state<import('$lib/types').WorkStep[]>([]);
	let filmChunkId: number | null = null;
	let filmTimers: ReturnType<typeof setTimeout>[] = [];

	function filmToast() {
		const name = lang === 'fr' ? 'etat-des-lieux.pdf' : 'inventory-report.pdf';
		toast.success(t('toast.added', { name }), { description: t('toast.addedDesc') });
	}

	function filmSend() {
		filmPhase = 'working';
		filmSteps = [{ id: 'search', status: 'active', count: 3 }];
		const at = (ms: number, run: () => void) => filmTimers.push(setTimeout(run, ms * slowmo));
		at(750, () => {
			filmSteps = [
				{ id: 'search', status: 'done', count: 3, elapsedMs: 238 },
				{ id: 'inspect', status: 'active', count: 3 }
			];
		});
		at(1550, () => {
			filmSteps = [
				{ id: 'search', status: 'done', count: 3, elapsedMs: 238 },
				{ id: 'inspect', status: 'done', count: 3 },
				{ id: 'write', status: 'active' }
			];
		});
		at(2700, () => (filmPhase = 'answered'));
		at(4300, () => {
			filmPhase = 'viewer';
			if (filmChunkId !== null) void viewerStore.openChunkId(filmChunkId);
		});
		if (endcard) at(8600, () => (filmPhase = 'endcard'));
	}

	const panelOpen = $derived(
		scene === 'review' || scene === 'wais' || scene === 'cite' || scene === 'film'
	);

	// The cite scene is fully real: the fixture lease PDF goes through the
	// ingest pipeline, then the viewer opens on the deposit clause chunk. The
	// film runs the same ingestion up front and keeps the chunk for its cue.
	async function ingestLease(): Promise<number | null> {
		const needle =
			lang === 'fr' ? 'dépôt de garantie de 1 380 euros' : 'security deposit of 1,380 euros';
		const docName = fix.doc;
		const res = await fetch(`/dev/landing/${docName}`);
		const file = new File([await res.blob()], docName, { type: 'application/pdf' });
		const existing = documentsStore.library.find((d) => d.name === docName);
		const ids = existing ? [existing.id] : await documentsStore.ingestMany([file]);
		for (let i = 0; i < 120; i++) {
			await new Promise((r) => setTimeout(r, 500));
			const doc = documentsStore.library.find((d) => d.id === ids[0]);
			if (doc?.status === 'ready') break;
		}
		const { db } = await getLocalDb();
		const chunks = await db.listChunksForDocuments(ids);
		const hit = chunks.find((c) => c.text.includes(needle)) ?? chunks[0];
		return hit ? hit.chunkId : null;
	}

	async function openLease() {
		const chunkId = await ingestLease();
		if (chunkId !== null) await viewerStore.openChunkId(chunkId);
	}

	async function prepareFilm() {
		filmChunkId = await ingestLease();
		const second = lang === 'fr' ? 'etat-des-lieux.pdf' : 'inventory-report.pdf';
		const res = await fetch(`/dev/landing/${second}`);
		const file = new File([await res.blob()], second, { type: 'application/pdf' });
		if (!documentsStore.library.find((d) => d.name === second))
			await documentsStore.ingestMany([file]);
		for (let i = 0; i < 120; i++) {
			await new Promise((r) => setTimeout(r, 400));
			if (documentsStore.library.every((d) => d.status === 'ready')) break;
		}
		// The panel reads the chat's documents; the film chat is the library.
		chatsStore.chatDocuments = documentsStore.library.map((d) => ({ ...d, enabled: true }));
		chatsStore.chatDocumentsLoaded = true;
		filmPhase = 'ready';
	}
</script>

{#snippet thread()}
	<div class="flex h-full flex-col">
		<ChatHeader panelOpen={true} sidebarTrigger={false} />
		<div class="flex flex-1 flex-col justify-end space-y-6 overflow-hidden px-6 pt-6 pb-2">
			<div class="mx-auto w-full max-w-3xl space-y-6">
				<!-- The conversation already under way: the workspace is lived-in and
				     the tail clips above, the way a real chat does. -->
				<div class="flex justify-end">
					<div class="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
						{fix.presendQ}
					</div>
				</div>
				<PrivateTurn
					content={fix.subletAnswer}
					citations={fix.subletCitations}
					excerpts={fix.subletCitations.map((c) => ({
						messageId: 'prior-1',
						chunkId: c.chunkId,
						sent: false,
						excluded: false,
						snippet: c.snippet,
						documentName: c.documentName,
						locator: c.locator
					}))}
					messageId="prior-1"
					mode="private"
				/>
				<div class="flex justify-end">
					<div class="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
						{fix.meterQ}
					</div>
				</div>
				<PrivateTurn
					content={fix.meterAnswer}
					citations={fix.meterCitations}
					excerpts={fix.meterCitations.map((c) => ({
						messageId: 'prior-2',
						chunkId: c.chunkId,
						sent: false,
						excluded: false,
						snippet: c.snippet,
						documentName: c.documentName,
						locator: c.locator
					}))}
					messageId="prior-2"
					mode="private"
				/>
				{#if scene !== 'film' || filmPhase === 'working' || filmPhase === 'answered' || filmPhase === 'viewer' || filmPhase === 'endcard'}
					<div class="flex justify-end">
						<div class="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
							{fix.question}
						</div>
					</div>
				{/if}
				{#if scene === 'hero' || scene === 'cite'}
					<PrivateTurn
						content={fix.answer}
						citations={fix.citations}
						excerpts={fix.excerpts}
						messageId="stage-answer"
						mode="private"
					/>
				{:else if scene === 'review'}
					<WorkLedger
						steps={[
							{ id: 'search', status: 'done', count: 3, elapsedMs: 240 },
							{ id: 'inspect', status: 'done', count: 3 },
							{ id: 'write', status: 'waiting' }
						]}
					/>
				{:else if scene === 'wais'}
					<PrivateTurn
						content={fix.subletAnswer}
						citations={fix.subletCitations}
						messageId="a1"
						mode="assisted"
					/>
				{:else if scene === 'film' && filmPhase === 'working'}
					<WorkLedger steps={filmSteps} />
				{:else if scene === 'film' && (filmPhase === 'answered' || filmPhase === 'viewer' || filmPhase === 'endcard')}
					<div class="film-answer">
						<PrivateTurn
							content={fix.answer}
							citations={fix.citations}
							excerpts={fix.excerpts}
							messageId="stage-answer"
							mode="private"
						/>
					</div>
				{/if}
			</div>
		</div>
		<div class="px-6 pb-6">
			<div class="mx-auto max-w-3xl">
				<Composer
					mode={scene === 'wais' || scene === 'review' ? 'assisted' : 'private'}
					followUp={true}
					hasReadyDocs={true}
					libraryEmpty={false}
					onsend={() => (scene === 'film' ? filmSend() : void 0)}
					onmodeselect={() => {}}
					onupload={() => {}}
					onattach={() => {}}
				/>
			</div>
		</div>
	</div>
{/snippet}

{#snippet panel()}
	{#if scene === 'review'}
		<PresendPanel />
	{:else if scene === 'wais'}
		<WhatAiSawPanel />
	{:else if scene === 'cite'}
		<ViewerPanel />
	{:else if scene === 'film'}
		{#if filmPhase === 'viewer' || filmPhase === 'endcard'}
			<ViewerPanel />
		{:else}
			<DocumentsPanel chatId="stage" />
		{/if}
	{/if}
{/snippet}

<Tooltip.Provider delayDuration={300}>
	<div class="bg-background min-h-svh {scene === 'film' ? 'p-0' : 'p-8'}">
		{#if scene === 'film'}
			<!-- The film frame: larger type via zoom for a supersampled recording,
			     a cover over the ingestion, the end card over everything. The
			     data-ready flag is the recorder's cue to start typing. -->
			<div class="film-zoom mx-auto w-[1600px]">
				<div
					id="stage"
					class="bg-background relative h-[900px] w-[1600px] overflow-hidden"
					data-ready={filmPhase === 'loading' ? undefined : '1'}
					data-question={fix.question}
				>
					<PanelShell open={panelOpen} main={thread} {panel} autoSaveId="landing-film" />
					{#if filmPhase === 'loading'}
						<div class="bg-background absolute inset-0 z-40"></div>
					{/if}
					{#if filmPhase === 'endcard'}
						<div
							class="film-endcard bg-background absolute inset-0 z-50 flex flex-col items-center justify-center gap-8"
						>
							<BrandMark size={88} />
							<p class="font-display text-5xl tracking-tight">{t('landing.hero.title')}</p>
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div id="stage" class="mx-auto w-[1240px] {panelOpen ? 'h-[600px]' : 'h-[520px]'}">
				<PanelShell open={panelOpen} main={thread} {panel} autoSaveId="landing-stage" />
			</div>
		{/if}
	</div>
</Tooltip.Provider>

<style>
	/* The film is rendered at 2560×1440 real pixels (1600×900 stage at 1.6×).
	   A retina visitor's layout demands ~2460 device pixels for the hero, so
	   anything smaller ships a blurry upscale; this clears it, and LinkedIn's
	   1080p master gets a clean 1.33× supersample on top. */
	.film-zoom {
		zoom: 1.6;
	}

	.film-endcard {
		animation: film-fade 700ms ease-out both;
	}

	:global(.film-answer) {
		animation: film-fade 500ms ease-out both;
	}

	@keyframes film-fade {
		from {
			opacity: 0;
		}
	}
</style>

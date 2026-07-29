<script lang="ts">
	// The hero demo, rendered live instead of filmed.
	//
	// Every reference site measured (Linear, Attio, Vercel, Raycast, Stripe)
	// animates its hero in the DOM or a canvas — not one ships a <video>. The
	// reason is mechanical: browsers resample <video> with cheap GPU filtering
	// and decode it through 4:2:0 chroma subsampling, which shreds antialiased
	// text; our own encode measured SSIM 0.9995 against its lossless source and
	// still looked soft on screen, because the file was never the problem.
	// Rendered as DOM, the demo is sharp at every pixel density, weighs nothing,
	// and is the real product rather than a recording of it.
	//
	// The components are the app's own. Only in-memory stores are seeded — the
	// landing must never open the local database (single-owner OPFS lock), and
	// none of these components touch it outside event handlers, which cannot
	// fire here: the whole thing is inert.
	import { onMount } from 'svelte';
	import ChatHeader from '$lib/components/chat-header.svelte';
	import PrivateTurn from '$lib/components/private-turn.svelte';
	import WorkLedger from '$lib/components/work-ledger.svelte';
	import Composer from '$lib/components/composer.svelte';
	import DocumentsPanel from '$lib/components/documents-panel.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { chatsStore } from '$lib/state/chats.svelte';
	import { settingsStore } from '$lib/state/settings.svelte';
	import { sessionStore } from '$lib/state/session.svelte';
	import { llmStore } from '$lib/private-ai/llm.svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { LANDING_FIXTURE } from '$lib/landing-fixture';
	import type { WorkStep } from '$lib/types';

	const fix = $derived(LANDING_FIXTURE[i18n.locale]);

	type Phase = 'idle' | 'typing' | 'working' | 'answered';
	let phase = $state<Phase>('idle');
	let steps = $state<WorkStep[]>([]);
	let root = $state<HTMLElement | null>(null);
	let timers: ReturnType<typeof setTimeout>[] = [];

	const excerptsOf = (rows: typeof fix.citations, id: string) =>
		rows.map((c) => ({
			messageId: id,
			chunkId: c.chunkId,
			sent: false,
			excluded: false,
			snippet: c.snippet,
			documentName: c.documentName,
			locator: c.locator
		}));

	/** In-memory only: the header, the panel and the composer read these. */
	function seed() {
		llmStore.status = 'ready';
		sessionStore.user = { id: 'landing', email: 'demo@example.org', name: 'Demo' };
		settingsStore.modeChosen = true;
		chatsStore.activeChat = {
			id: 'landing',
			title: fix.question,
			mode: 'private',
			privateOnly: false,
			reviewSend: null
		} as typeof chatsStore.activeChat;
		chatsStore.chatEgress = null;
		chatsStore.chatDocuments = [
			{ id: 'doc-1', name: fix.doc2, status: 'ready', mime: 'application/pdf', enabled: true },
			{ id: 'doc-2', name: fix.doc, status: 'ready', mime: 'application/pdf', enabled: true }
		] as typeof chatsStore.chatDocuments;
		chatsStore.chatDocumentsLoaded = true;
	}

	/** Type into the app's real textarea, character by character, the way a
	 * person does — no replica input, no faked caret. */
	function type(text: string, done: () => void) {
		const field = root?.querySelector('textarea');
		if (!field) return done();
		let i = 0;
		const tick = () => {
			field.value = text.slice(0, ++i);
			field.dispatchEvent(new Event('input', { bubbles: true }));
			if (i < text.length) timers.push(setTimeout(tick, 26));
			else timers.push(setTimeout(done, 420));
		};
		tick();
	}

	function run() {
		const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
		phase = 'typing';
		type(fix.question, () => {
			const field = root?.querySelector('textarea');
			if (field) {
				field.value = '';
				field.dispatchEvent(new Event('input', { bubbles: true }));
			}
			phase = 'working';
			steps = [{ id: 'search', status: 'active', count: 3 }];
			at(700, () => {
				steps = [
					{ id: 'search', status: 'done', count: 3, elapsedMs: 238 },
					{ id: 'inspect', status: 'active', count: 3 }
				];
			});
			at(1450, () => {
				steps = [
					{ id: 'search', status: 'done', count: 3, elapsedMs: 238 },
					{ id: 'inspect', status: 'done', count: 3 },
					{ id: 'write', status: 'active' }
				];
			});
			at(2500, () => (phase = 'answered'));
		});
	}

	// The page applies ?lang= after we mount, and the header reads the chat's
	// title: re-seed whenever the fixture's language changes.
	let seeded = '';
	$effect(() => {
		const key = i18n.locale;
		if (seeded === key) return;
		seeded = key;
		seed();
	});

	onMount(() => {
		seed();
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced) {
			// No motion: land straight on the finished state, which is the frame
			// worth seeing anyway.
			phase = 'answered';
			return;
		}
		// Start when it is actually on screen, so a visitor landing mid-page does
		// not arrive after the demo has already played.
		const io = new IntersectionObserver(
			(entries) => {
				if (!entries.some((e) => e.isIntersecting)) return;
				io.disconnect();
				timers.push(setTimeout(run, 900));
			},
			{ threshold: 0.3 }
		);
		if (root) io.observe(root);
		return () => {
			io.disconnect();
			timers.forEach(clearTimeout);
		};
	});
</script>

<!-- Inert: a demo, not a control surface. Nothing here is focusable and no
     handler can fire, which is what keeps the app's stores untouched. The
     provider is required because the app's own controls carry tooltips. -->
<Tooltip.Provider delayDuration={300}>
	<div bind:this={root} class="h-[600px] lg:h-[720px]" aria-hidden="true" inert>
		<div class="grid h-full gap-2 lg:grid-cols-[1fr_380px]">
			<div
				class="border-border bg-background flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border shadow-sm"
			>
				<ChatHeader panelOpen={true} sidebarTrigger={false} />
				<div class="flex min-h-0 flex-1 flex-col justify-end gap-6 overflow-hidden px-6 pt-6 pb-2">
					<div class="mx-auto w-full max-w-2xl space-y-6">
						<div class="flex justify-end">
							<div class="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
								{fix.presendQ}
							</div>
						</div>
						<PrivateTurn
							content={fix.subletAnswer}
							citations={fix.subletCitations}
							excerpts={excerptsOf(fix.subletCitations, 'prior-1')}
							messageId="prior-1"
							mode="private"
						/>
						{#if phase !== 'idle' && phase !== 'typing'}
							<div class="demo-in flex justify-end">
								<div class="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
									{fix.question}
								</div>
							</div>
						{/if}
						{#if phase === 'working'}
							<div class="demo-in"><WorkLedger {steps} /></div>
						{:else if phase === 'answered'}
							<div class="demo-in">
								<PrivateTurn
									content={fix.answer}
									citations={fix.citations}
									excerpts={excerptsOf(fix.citations, 'live')}
									messageId="live"
									mode="private"
								/>
							</div>
						{/if}
					</div>
				</div>
				<div class="shrink-0 px-6 pb-6">
					<div class="mx-auto w-full max-w-2xl">
						<Composer
							mode="private"
							followUp={true}
							hasReadyDocs={true}
							libraryEmpty={false}
							onsend={() => {}}
							onmodeselect={() => {}}
							onupload={() => {}}
							onattach={() => {}}
						/>
					</div>
				</div>
			</div>
			<div
				class="border-border bg-background h-full min-h-0 min-w-0 overflow-hidden rounded-xl border shadow-sm max-lg:hidden"
			>
				<DocumentsPanel chatId="landing" />
			</div>
		</div>
	</div>
</Tooltip.Provider>

<style>
	/* Each beat arrives the way the app's own turns do; nothing loops. */
	.demo-in {
		animation: demo-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes demo-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.demo-in {
			animation: none;
		}
	}
</style>

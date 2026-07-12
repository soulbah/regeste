// Chat state: list, active chat, messages, and the transitional
// retrieval-only "answer" (real generation lands in specs 004/005).

import { t } from '$lib/i18n/index.svelte';
import { getLocalDb } from '$lib/local-db/client';
import type { CitationRow, MessageExcerptRow, MessagePrivacyRow } from '$lib/local-db/worker';
import { documentsStore } from './documents.svelte';
import { guardedFetch, OfflineError } from '$lib/net';
import { myaiStore, endpointHost, type ChatMessage } from './myai.svelte';
import { llmStore } from '$lib/private-ai/llm.svelte';
import { generationOptionsFor } from '$lib/private-ai/generation';
import { buildRetrievalContext } from '$lib/retrieval-context';
import { assistedPayloadBytes } from '$lib/assisted-payload';
import { questionLocale, routeQuestion } from '$lib/analysis/query-router';
import { formatAggregateResult } from '$lib/analysis/format-aggregate';
import { hasAnswerBearingEvidence } from '$lib/pipeline/relevance';
import {
	SYSTEM_PROMPT,
	buildUserPrompt,
	isThinking,
	resolveCitations,
	resolveTargetedCitations,
	stripThink
} from '$lib/private-ai/prompt';
import type {
	ChatDocument,
	ChatMode,
	LocalChat,
	LocalMessage,
	MethodSummary,
	QuestionRoute,
	SearchHit,
	WorkStep
} from '$lib/types';

/** First user message → chat title, cut at a word boundary. Pure (unit-tested). */
export function titleFromMessage(text: string, max = 40): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	if (clean.length <= max) return clean || 'New chat';
	const cut = clean.slice(0, max);
	const lastSpace = cut.lastIndexOf(' ');
	return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut) + '…';
}

class ChatsStore {
	chats = $state<LocalChat[]>([]);
	activeChatId = $state<string | null>(null);
	messages = $state<LocalMessage[]>([]);
	chatDocuments = $state<ChatDocument[]>([]);
	/** False until the active chat's documents have loaded once, so the panel
	 *  shows skeletons instead of flashing "no documents" over a populated chat. */
	chatDocumentsLoaded = $state(false);
	citations = $state<Record<string, CitationRow[]>>({});
	privacyByMessage = $state<Record<string, MessagePrivacyRow>>({});
	sending = $state(false);
	/** Non-null while a Private answer streams in. */
	streamingText = $state<string | null>(null);
	/** Assisted send awaiting review in the right panel (FEATURES 5ter). */
	pendingAssisted = $state<{
		chatId: string;
		question: string;
		hits: SearchHit[];
		conversationContext: string | null;
	} | null>(null);
	/** P2 — active chat's egress state (cloud requests + bytes). */
	chatEgress = $state<{ cloudRequests: number; bytes: number } | null>(null);
	/** Spec 012 — per-message passage snapshots (what the AI actually saw). */
	excerptsByMessage = $state<Record<string, MessageExcerptRow[]>>({});
	/** Spec 012 — message whose "What AI saw" panel is open. */
	waisMessageId = $state<string | null>(null);
	/** Spec 020 — follow-up questions under the LAST answer only. */
	related = $state<{ chatId: string; messageId: string; questions: string[] } | null>(null);
	/** Spec 020 — answer versions per version group (oldest first). */
	versionsByGroup = $state<Record<string, string[]>>({});
	methodByMessage = $state<Record<string, MethodSummary>>({});
	workSteps = $state<WorkStep[]>([]);
	private workStepStartedAt = 0;

	activeChat = $derived(this.chats.find((c) => c.id === this.activeChatId) ?? null);

	async refresh(): Promise<void> {
		const { db } = await getLocalDb();
		this.chats = await db.listChats();
	}

	async open(chatId: string): Promise<void> {
		this.activeChatId = chatId;
		if (this.related?.chatId !== chatId) this.related = null;
		this.chatDocumentsLoaded = false;
		try {
			const { db } = await getLocalDb();
			this.messages = await db.listMessages(chatId);
			this.chatDocuments = await db.listChatDocuments(chatId);
			await this.loadCitations(chatId);
		} finally {
			// End the panel's loading state whether the read succeeded, returned
			// nothing, or the database failed to open — never hang on skeletons.
			this.chatDocumentsLoaded = true;
		}
	}

	private async loadCitations(chatId: string): Promise<void> {
		const { db } = await getLocalDb();
		const rows = await db.listChatCitations(chatId);
		const byMessage: Record<string, CitationRow[]> = {};
		for (const row of rows) (byMessage[row.messageId] ??= []).push(row);
		this.citations = byMessage;
		const events = await db.listChatPrivacyEvents(chatId);
		this.privacyByMessage = Object.fromEntries(events.map((e) => [e.messageId, e]));
		this.chatEgress = await db.chatPrivacySummary(chatId);
		const excerpts = await db.listChatMessageExcerpts(chatId);
		const byMsg: Record<string, MessageExcerptRow[]> = {};
		for (const row of excerpts) (byMsg[row.messageId] ??= []).push(row);
		this.excerptsByMessage = byMsg;
		const versions = await db.listChatMessageVersions(chatId);
		const byGroup: Record<string, string[]> = {};
		for (const v of versions) (byGroup[v.versionGroup] ??= []).push(v.id);
		this.versionsByGroup = byGroup;
		const methods = await db.listChatMessageMethods(chatId);
		this.methodByMessage = Object.fromEntries(methods.map((row) => [row.messageId, row.summary]));
	}

	private startWork(route: QuestionRoute, documentCount: number): void {
		this.workStepStartedAt = performance.now();
		this.workSteps = [
			{ id: 'search', status: 'active', count: documentCount },
			{ id: 'inspect', status: 'pending' },
			...(route === 'aggregate' ? [{ id: 'calculate' as const, status: 'pending' as const }] : []),
			{ id: 'write', status: 'pending' }
		];
	}

	private advanceWork(id: WorkStep['id'], count?: number): void {
		const now = performance.now();
		this.workSteps = this.workSteps.map((step) =>
			step.id === id
				? { ...step, status: 'active', ...(count === undefined ? {} : { count }) }
				: step.status === 'active'
					? {
							...step,
							status: 'done',
							elapsedMs: Math.max(1, Math.round(now - this.workStepStartedAt))
						}
					: step
		);
		this.workStepStartedAt = now;
	}

	private setWorkCount(id: WorkStep['id'], count: number): void {
		this.workSteps = this.workSteps.map((step) => (step.id === id ? { ...step, count } : step));
	}

	/** Spec 020 — display another version of a turn (‹ n/N › nav). */
	async switchVersion(chatId: string, versionGroup: string, messageId: string): Promise<void> {
		const { db } = await getLocalDb();
		await db.activateMessageVersion(versionGroup, messageId);
		this.messages = await db.listMessages(chatId);
		await this.loadCitations(chatId);
	}

	/**
	 * Spec 020 — related questions, with the arbitrated guardrails: generated
	 * AFTER the answer (never blocking it), last answer only, max 3, silent
	 * absence on failure or slowness. Private uses the on-device model;
	 * My AI reuses the user's own endpoint (the same trust boundary as the
	 * answer, egress logged). Assisted never gets a second cloud call.
	 */
	private async generateRelated(chatId: string): Promise<void> {
		try {
			const chat = this.chats.find((c) => c.id === chatId);
			const last = this.messages[this.messages.length - 1];
			if (!chat || !last || last.role !== 'assistant') return;
			if (last.mode !== 'private' && last.mode !== 'myai') return;
			if (this.methodByMessage[last.id]?.kind === 'aggregate') return;
			const question = [...this.messages].reverse().find((m) => m.role === 'user')?.content;
			if (!question) return;

			const prompt = [
				{
					role: 'system' as const,
					content:
						'You suggest follow-up questions about documents. Reply with up to 3 short follow-up questions, one per line, no numbering and no other text, in the same language as the conversation.'
				},
				{
					role: 'user' as const,
					content: `Question: ${question}\n\nAnswer: ${last.content.slice(0, 1500)}`
				}
			];

			let raw = '';
			if (last.mode === 'private' && llmStore.status === 'ready') {
				raw = await llmStore.generate(prompt, () => {});
			} else if (last.mode === 'myai' && myaiStore.baseUrl) {
				const model = chat.myaiModel ?? myaiStore.defaultModel;
				if (!model) return;
				await myaiStore.generate(model, prompt, (delta) => {
					raw += delta;
				});
				// Honest egress: the follow-up call is a real second request.
				const { db } = await getLocalDb();
				await db.insertPrivacyEvent({
					chatId,
					messageId: null,
					mode: 'myai',
					destination: myaiStore.host ?? 'endpoint',
					excerptCount: 0,
					bytesSent: prompt.reduce((n, m) => n + new TextEncoder().encode(m.content).length, 0)
				});
				this.chatEgress = await db.chatPrivacySummary(chatId);
			} else {
				return;
			}

			const questions = stripThink(raw)
				.split('\n')
				.map((l) => l.replace(/^[\s\-*\d.)]+/, '').trim())
				.filter((l) => l.length > 8 && l.length < 160)
				.slice(0, 3);
			if (questions.length && this.activeChatId === chatId) {
				this.related = { chatId, messageId: last.id, questions };
			}
		} catch {
			// Silent absence by design (spec 020): no spinner, no error state.
		}
	}

	openWhatAiSaw(messageId: string): void {
		this.waisMessageId = messageId;
	}

	closeWhatAiSaw(): void {
		this.waisMessageId = null;
	}

	/** Snapshot rows for message_excerpts from retrieval hits. */
	private static excerptRows(hits: SearchHit[], sent: boolean, excludedIds: Set<number>) {
		return hits.map((h) => ({
			chunkId: h.chunkId,
			sent: sent && !excludedIds.has(h.chunkId),
			excluded: excludedIds.has(h.chunkId),
			snippet: h.text.slice(0, 240),
			documentName: h.documentName,
			locator: h.page ? `page ${h.page}` : (h.headingPath ?? null)
		}));
	}

	async setPrivateOnly(chatId: string, on: boolean): Promise<void> {
		const { db } = await getLocalDb();
		await db.setChatPrivateOnly(chatId, on);
		// A locked chat can't stay on a cloud mode.
		const chat = this.chats.find((c) => c.id === chatId);
		if (on && chat && chat.mode !== 'private') await db.setChatMode(chatId, 'private');
		await this.refresh();
	}

	close(): void {
		this.activeChatId = null;
		this.messages = [];
		this.chatDocuments = [];
		this.chatDocumentsLoaded = false;
	}

	/** Lazy creation: called on first message or first attach from the empty state. */
	async create(mode: ChatMode = 'private'): Promise<string> {
		const { db } = await getLocalDb();
		const id = crypto.randomUUID();
		await db.createChat({ id, title: 'New chat', mode });
		await this.refresh();
		return id;
	}

	async rename(chatId: string, title: string): Promise<void> {
		const { db } = await getLocalDb();
		await db.renameChat(chatId, title.trim() || 'New chat');
		await this.refresh();
	}

	async remove(chatId: string): Promise<void> {
		const { db } = await getLocalDb();
		await db.deleteChat(chatId);
		if (this.activeChatId === chatId) this.close();
		await this.refresh();
	}

	async setMode(chatId: string, mode: ChatMode): Promise<void> {
		const { db } = await getLocalDb();
		await db.setChatMode(chatId, mode);
		await this.refresh();
	}

	async setPinned(chatId: string, pinned: boolean): Promise<void> {
		const { db } = await getLocalDb();
		await db.setChatPinned(chatId, pinned);
		await this.refresh();
	}

	/** C2 — replace the last answer: same question, fresh retrieval + generation. */
	async regenerate(chatId: string): Promise<void> {
		if (this.sending) return;
		const last = this.messages[this.messages.length - 1];
		const question = [...this.messages].reverse().find((m) => m.role === 'user')?.content;
		if (!last || last.role !== 'assistant' || !question) return;
		this.sending = true;
		this.related = null;
		try {
			const { db } = await getLocalDb();
			// Spec 020 — Try again keeps the previous answer as an inactive version.
			const versionGroup = last.versionGroup ?? last.id;
			await db.retireMessage(last.id, versionGroup);
			this.messages = await db.listMessages(chatId);
			const context = buildRetrievalContext(this.messages, question);
			const enabledDocs = this.chatDocuments.filter((d) => d.enabled && d.status === 'ready');
			const analysisQuestion = context?.analysisQuery ?? question;
			const route = routeQuestion(analysisQuestion);
			this.startWork(route, enabledDocs.length);
			if (route === 'aggregate') {
				await this.generateAggregate(
					chatId,
					analysisQuestion,
					enabledDocs.map((d) => d.id),
					versionGroup
				);
				await db.touchChat(chatId);
				this.messages = await db.listMessages(chatId);
				await this.refresh();
				await this.loadCitations(chatId);
				return;
			}
			const hits = enabledDocs.length
				? await documentsStore.retrieve(
						context?.searchQuery ?? question,
						enabledDocs.map((d) => d.id),
						question,
						() => this.advanceWork('inspect')
					)
				: [];
			if (enabledDocs.length) this.setWorkCount('inspect', hits.length);
			else this.advanceWork('inspect', 0);
			await this.answer(
				chatId,
				question,
				hits,
				enabledDocs.length,
				versionGroup,
				route,
				context?.promptContext ?? null
			);
			await db.touchChat(chatId);
			this.messages = await db.listMessages(chatId);
			await this.refresh();
			await this.loadCitations(chatId);
		} finally {
			this.sending = false;
			this.streamingText = null;
			this.workSteps = [];
		}
		void this.generateRelated(chatId);
	}

	/** C2 — edit the last question: the old exchange is replaced entirely. */
	async editLast(chatId: string, newText: string): Promise<void> {
		if (this.sending || !newText.trim()) return;
		const { db } = await getLocalDb();
		const lastUser = [...this.messages].reverse().find((m) => m.role === 'user');
		if (!lastUser) return;
		for (const m of [...this.messages].reverse()) {
			await db.deleteMessage(m.id);
			if (m.id === lastUser.id) break;
		}
		this.messages = await db.listMessages(chatId);
		await this.send(chatId, newText);
	}

	/** C4 — the chat as a portable Markdown document. */
	async exportMarkdown(chatId: string): Promise<string> {
		const { db } = await getLocalDb();
		const chat = this.chats.find((c) => c.id === chatId);
		const messages = await db.listMessages(chatId);
		const rows = await db.listChatCitations(chatId);
		const citationsByMessage: Record<string, CitationRow[]> = {};
		for (const row of rows) (citationsByMessage[row.messageId] ??= []).push(row);

		const lines: string[] = [`# ${chat?.title ?? 'Chat'}`, ''];
		for (const m of messages) {
			if (m.mode === 'retrieval') continue;
			lines.push(m.role === 'user' ? `## You` : `## Folio`);
			lines.push('');
			lines.push(m.content);
			const cites = citationsByMessage[m.id];
			if (cites?.length) {
				lines.push('');
				lines.push('Sources:');
				for (const c of cites) {
					lines.push(`- ${c.documentName}${c.locator ? ` · ${c.locator}` : ''}`);
				}
			}
			lines.push('');
		}
		return lines.join('\n');
	}

	async attach(chatId: string, documentId: string): Promise<void> {
		const { db } = await getLocalDb();
		await db.attachDocument(chatId, documentId);
		await db.touchChat(chatId);
		if (this.activeChatId === chatId) this.chatDocuments = await db.listChatDocuments(chatId);
		await documentsStore.refreshLibrary();
	}

	/** Attach several library documents to a chat in one go (picker multi-select). */
	async attachMany(chatId: string, documentIds: string[]): Promise<void> {
		if (!documentIds.length) return;
		const { db } = await getLocalDb();
		for (const id of documentIds) await db.attachDocument(chatId, id);
		await db.touchChat(chatId);
		if (this.activeChatId === chatId) this.chatDocuments = await db.listChatDocuments(chatId);
		await documentsStore.refreshLibrary();
	}

	async detach(chatId: string, documentId: string): Promise<void> {
		const { db } = await getLocalDb();
		await db.detachDocument(chatId, documentId);
		if (this.activeChatId === chatId) this.chatDocuments = await db.listChatDocuments(chatId);
		await documentsStore.refreshLibrary();
	}

	async toggleDocument(chatId: string, documentId: string, enabled: boolean): Promise<void> {
		const { db } = await getLocalDb();
		await db.setDocumentEnabled(chatId, documentId, enabled);
		if (this.activeChatId === chatId) this.chatDocuments = await db.listChatDocuments(chatId);
	}

	async refreshChatDocuments(): Promise<void> {
		if (!this.activeChatId) return;
		const { db } = await getLocalDb();
		this.chatDocuments = await db.listChatDocuments(this.activeChatId);
	}

	/**
	 * Store the user message, then answer. Private mode (engine ready) →
	 * on-device generation with validated citations; anything else → a
	 * retrieval-only preview turn (Assisted/My AI land in spec 005).
	 */
	async send(chatId: string, text: string): Promise<void> {
		const question = text.trim();
		if (!question || this.sending) return;
		this.sending = true;
		this.related = null;
		try {
			const { db } = await getLocalDb();
			const chat = this.chats.find((c) => c.id === chatId);
			if (chat && chat.title === 'New chat' && this.messages.length === 0) {
				await db.renameChat(chatId, titleFromMessage(question));
			}
			await db.insertMessage({
				id: crypto.randomUUID(),
				chatId,
				role: 'user',
				content: question,
				mode: null
			});
			this.messages = await db.listMessages(chatId);
			const context = buildRetrievalContext(this.messages, question);

			const enabledDocs = this.chatDocuments.filter((d) => d.enabled && d.status === 'ready');
			const analysisQuestion = context?.analysisQuery ?? question;
			const route = routeQuestion(analysisQuestion);
			this.startWork(route, enabledDocs.length);
			if (route === 'aggregate') {
				await this.generateAggregate(
					chatId,
					analysisQuestion,
					enabledDocs.map((d) => d.id)
				);
			} else {
				let hits: SearchHit[] = [];
				if (enabledDocs.length) {
					hits = await documentsStore.retrieve(
						context?.searchQuery ?? question,
						enabledDocs.map((d) => d.id),
						question,
						() => this.advanceWork('inspect')
					);
					if (!hasAnswerBearingEvidence(question, hits)) hits = [];
				}

				if (enabledDocs.length) this.setWorkCount('inspect', hits.length);
				else this.advanceWork('inspect', 0);
				await this.answer(
					chatId,
					question,
					hits,
					enabledDocs.length,
					null,
					route,
					context?.promptContext ?? null
				);
			}
			await db.touchChat(chatId);
			this.messages = await db.listMessages(chatId);
			await this.refresh();
		} finally {
			this.sending = false;
			this.streamingText = null;
			this.workSteps = [];
		}
		void this.generateRelated(chatId);
	}

	/** Route a question to the chat's mode (shared by send/regenerate). */
	private async answer(
		chatId: string,
		question: string,
		hits: SearchHit[],
		documentCount: number,
		versionGroup: string | null = null,
		route: QuestionRoute = 'targeted',
		conversationContext: string | null = null
	): Promise<void> {
		const { db } = await getLocalDb();
		const chat = this.chats.find((c) => c.id === chatId);
		if (chat?.mode === 'private' && llmStore.status === 'ready') {
			await this.generatePrivate(
				chatId,
				question,
				hits,
				documentCount,
				versionGroup,
				route,
				conversationContext
			);
		} else if (
			chat?.mode === 'myai' &&
			!chat.privateOnly &&
			myaiStore.baseUrl &&
			(chat.myaiModel || myaiStore.defaultModel)
		) {
			await this.generateMyAi(
				chat,
				question,
				hits,
				documentCount,
				versionGroup,
				conversationContext
			);
		} else {
			await db.insertMessage({
				id: crypto.randomUUID(),
				chatId,
				role: 'assistant',
				content: JSON.stringify({ hits, documentCount }),
				mode: 'retrieval',
				versionGroup
			});
		}
	}

	private async generatePrivate(
		chatId: string,
		question: string,
		hits: SearchHit[],
		documentCount: number,
		versionGroup: string | null = null,
		route: QuestionRoute = 'targeted',
		conversationContext: string | null = null
	): Promise<void> {
		const { db } = await getLocalDb();
		this.streamingText = '';
		const grounded = documentCount > 0;
		const messages = grounded
			? [
					{ role: 'system' as const, content: SYSTEM_PROMPT },
					{
						role: 'user' as const,
						content: buildUserPrompt(question, hits, conversationContext)
					}
				]
			: [
					{
						role: 'system' as const,
						content:
							'You are a concise assistant. The user attached no documents: answer from general knowledge and say so briefly.'
					},
					{ role: 'user' as const, content: question }
				];

		// Stream display filters reasoning blocks: the user sees "Thinking…"
		// (empty streamingText) until the actual answer starts.
		let streamRaw = '';
		let raw: string;
		this.advanceWork('write');
		try {
			raw = await llmStore.generate(
				messages,
				(delta) => {
					streamRaw += delta;
					this.streamingText = isThinking(streamRaw) ? '' : stripThink(streamRaw);
				},
				generationOptionsFor(question, route === 'synthesis' ? 'synthesis' : 'targeted')
			);
		} catch (err) {
			console.error('[folio] private generation failed:', err);
			raw = streamRaw;
		}
		raw = stripThink(raw! || streamRaw);
		// Aborted or failed with nothing produced → an honest system notice.
		const stopped = !raw.trim();

		const { text: cleaned, citations } =
			grounded && !stopped
				? route === 'targeted'
					? resolveTargetedCitations(raw, hits, question)
					: resolveCitations(raw, hits)
				: { text: raw, citations: [] };

		const messageId = crypto.randomUUID();
		await db.insertMessage({
			id: messageId,
			chatId,
			role: 'assistant',
			content: stopped ? t('notice.stopped') : cleaned,
			mode: stopped ? 'notice' : 'private',
			versionGroup
		});
		if (citations.length) {
			await db.insertCitations(
				messageId,
				citations.map((c) => ({
					chunkId: c.hit.chunkId,
					snippet: c.hit.text.slice(0, 240),
					documentName: c.hit.documentName,
					locator: c.hit.page ? `page ${c.hit.page}` : (c.hit.headingPath ?? null)
				}))
			);
		}
		await db.insertPrivacyEvent({
			chatId,
			messageId,
			mode: 'private',
			destination: 'device',
			excerptCount: hits.length,
			bytesSent: 0
		});
		if (grounded && hits.length) {
			await db.insertMessageExcerpts(messageId, ChatsStore.excerptRows(hits, false, new Set()));
		}
		await db.insertMessageMethod(messageId, {
			kind: route,
			documentCount,
			passageCount: hits.length,
			reasoningUsed: route === 'synthesis'
		});
		await this.loadCitations(chatId);
	}

	private async generateAggregate(
		chatId: string,
		question: string,
		documentIds: string[],
		versionGroup: string | null = null
	): Promise<void> {
		const { db } = await getLocalDb();
		this.advanceWork('inspect');
		const result = await documentsStore.aggregate(question, documentIds);
		this.advanceWork('calculate', result.facts.length);
		const locale = questionLocale(question);
		const formatted = formatAggregateResult(result, locale);
		this.advanceWork('write');
		const messageId = crypto.randomUUID();
		await db.insertMessage({
			id: messageId,
			chatId,
			role: 'assistant',
			content: formatted.text,
			mode: 'private',
			versionGroup
		});
		if (result.facts.length) {
			await db.insertCitations(
				messageId,
				result.facts.map((fact) => ({
					chunkId: fact.chunkId,
					snippet: fact.text.slice(0, 240),
					documentName: fact.documentName,
					locator: fact.page ? `page ${fact.page}` : fact.headingPath
				}))
			);
			await db.insertMessageExcerpts(
				messageId,
				result.facts.map((fact) => ({
					chunkId: fact.chunkId,
					sent: false,
					excluded: false,
					snippet: fact.text.slice(0, 240),
					documentName: fact.documentName,
					locator: fact.page ? `page ${fact.page}` : fact.headingPath
				}))
			);
		}
		await db.insertPrivacyEvent({
			chatId,
			messageId,
			mode: 'private',
			destination: 'device',
			excerptCount: result.facts.length,
			bytesSent: 0
		});
		await db.insertMessageMethod(messageId, {
			kind: 'aggregate',
			documentCount: documentIds.length,
			passageCount: result.facts.length,
			reasoningUsed: false,
			calculation: formatted.calculation
		});
		await this.loadCitations(chatId);
	}

	/**
	 * My AI send: user content leaves the device toward the USER'S OWN endpoint
	 * — same grounded prompt as Private, egress logged with the real destination.
	 */
	private async generateMyAi(
		chat: LocalChat,
		question: string,
		hits: SearchHit[],
		documentCount: number,
		versionGroup: string | null = null,
		conversationContext: string | null = null
	): Promise<void> {
		const { db } = await getLocalDb();
		const model = chat.myaiModel ?? myaiStore.defaultModel!;
		// First My AI message in this chat pins the model on the chat (5bis).
		if (!chat.myaiModel) await db.setChatMyaiModel(chat.id, model);

		this.streamingText = '';
		const grounded = documentCount > 0;
		const messages: ChatMessage[] = grounded
			? [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: buildUserPrompt(question, hits, conversationContext) }
				]
			: [
					{
						role: 'system',
						content:
							'You are a concise assistant. The user attached no documents: answer from general knowledge and say so briefly.'
					},
					{ role: 'user', content: question }
				];
		const bytesSent = messages.reduce((n, m) => n + new TextEncoder().encode(m.content).length, 0);

		let streamRaw = '';
		let failed: string | null = null;
		try {
			await myaiStore.generate(model, messages, (delta) => {
				streamRaw += delta;
				this.streamingText = isThinking(streamRaw) ? '' : stripThink(streamRaw);
			});
		} catch (err) {
			if (!(err instanceof OfflineError)) console.error('[folio] my-ai generation failed:', err);
			if (!streamRaw.trim()) {
				failed = err instanceof OfflineError ? err.message : t('notice.myaiUnreachable');
			}
		}
		const raw = stripThink(streamRaw);
		const stopped = !failed && !raw.trim();
		const isNotice = !!failed || stopped;

		const { text: cleaned, citations } = isNotice
			? { text: failed ?? t('notice.stopped'), citations: [] }
			: grounded
				? resolveCitations(raw.trim(), hits)
				: { text: raw.trim(), citations: [] };

		const messageId = crypto.randomUUID();
		await db.insertMessage({
			id: messageId,
			chatId: chat.id,
			role: 'assistant',
			content: cleaned,
			mode: isNotice ? 'notice' : 'myai',
			versionGroup
		});
		if (citations.length) {
			await db.insertCitations(
				messageId,
				citations.map((c) => ({
					chunkId: c.hit.chunkId,
					snippet: c.hit.text.slice(0, 240),
					documentName: c.hit.documentName,
					locator: c.hit.page ? `page ${c.hit.page}` : (c.hit.headingPath ?? null)
				}))
			);
		}
		if (!failed) {
			await db.insertPrivacyEvent({
				chatId: chat.id,
				messageId,
				mode: 'myai',
				destination: endpointHost(myaiStore.baseUrl!),
				excerptCount: grounded ? hits.length : 0,
				bytesSent
			});
			if (grounded && hits.length && !isNotice) {
				await db.insertMessageExcerpts(messageId, ChatsStore.excerptRows(hits, true, new Set()));
			}
		}
		await this.loadCitations(chat.id);
	}

	async stopGeneration(): Promise<void> {
		myaiStore.stop();
		await llmStore.stop();
	}

	/** Retrieval over the active chat's enabled documents (assisted preview). */
	async retrieveForActive(query: string, refinementQuery = query): Promise<SearchHit[]> {
		const enabledDocs = this.chatDocuments.filter((d) => d.enabled && d.status === 'ready');
		if (!enabledDocs.length) return [];
		return documentsStore.retrieve(
			query,
			enabledDocs.map((d) => d.id),
			refinementQuery
		);
	}

	/** Stage an assisted send for review in the right panel. */
	async stageAssisted(chatId: string, question: string): Promise<'staged' | 'no-excerpts'> {
		const context = buildRetrievalContext(this.messages, question);
		const hits = await this.retrieveForActive(context?.searchQuery ?? question, question);
		if (!hits.length) return 'no-excerpts';
		this.pendingAssisted = {
			chatId,
			question,
			hits,
			conversationContext: context?.promptContext ?? null
		};
		return 'staged';
	}

	async confirmAssisted(selected: SearchHit[]): Promise<void> {
		const pending = this.pendingAssisted;
		if (!pending) return;
		this.pendingAssisted = null;
		const selectedIds = new Set(selected.map((h) => h.chunkId));
		const excluded = pending.hits.filter((h) => !selectedIds.has(h.chunkId));
		await this.sendAssisted(
			pending.chatId,
			pending.question,
			selected,
			excluded,
			pending.conversationContext
		);
	}

	cancelAssisted(): void {
		this.pendingAssisted = null;
	}

	/**
	 * Assisted send: the ONLY code path where user content leaves the device —
	 * the question plus the excerpts the user confirmed in the preview.
	 */
	async sendAssisted(
		chatId: string,
		question: string,
		selected: SearchHit[],
		excluded: SearchHit[] = [],
		conversationContext: string | null = null
	): Promise<void> {
		if (this.sending) return;
		this.sending = true;
		try {
			const { db } = await getLocalDb();
			const chat = this.chats.find((c) => c.id === chatId);
			if (chat && chat.title === 'New chat' && this.messages.length === 0) {
				await db.renameChat(chatId, titleFromMessage(question));
			}
			await db.insertMessage({
				id: crypto.randomUUID(),
				chatId,
				role: 'user',
				content: question,
				mode: null
			});
			this.messages = await db.listMessages(chatId);
			this.streamingText = '';

			const excerpts = selected.map((h) => ({
				text: h.text,
				label: `${h.documentName}${h.page ? ` · page ${h.page}` : h.headingPath ? ` · ${h.headingPath}` : ''}`
			}));
			const bytesSent = assistedPayloadBytes(question, excerpts, conversationContext);

			let raw = '';
			let failed: string | null = null;
			try {
				const res = await guardedFetch('/api/assisted', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ question, excerpts, context: conversationContext ?? undefined })
				});
				if (!res.ok) {
					failed =
						res.status === 429
							? t('notice.quota')
							: res.status === 401
								? t('notice.signIn')
								: t('notice.assistedDown');
				} else {
					raw = ((await res.json()) as { answer: string }).answer;
				}
			} catch (err) {
				failed = err instanceof OfflineError ? err.message : t('notice.assistedUnreachable');
			}

			const { text: cleaned, citations } = failed
				? { text: failed, citations: [] }
				: resolveCitations(stripThink(raw).trim() || t('notice.stopped'), selected);

			const messageId = crypto.randomUUID();
			await db.insertMessage({
				id: messageId,
				chatId,
				role: 'assistant',
				content: cleaned,
				mode: failed ? 'notice' : 'assisted'
			});
			if (citations.length) {
				await db.insertCitations(
					messageId,
					citations.map((c) => ({
						chunkId: c.hit.chunkId,
						snippet: c.hit.text.slice(0, 240),
						documentName: c.hit.documentName,
						locator: c.hit.page ? `page ${c.hit.page}` : (c.hit.headingPath ?? null)
					}))
				);
			}
			if (!failed) {
				await db.insertPrivacyEvent({
					chatId,
					messageId,
					mode: 'assisted',
					destination: 'cloud',
					excerptCount: excerpts.length,
					bytesSent
				});
				const all = [...selected, ...excluded];
				if (all.length) {
					const excludedIds = new Set(excluded.map((h) => h.chunkId));
					await db.insertMessageExcerpts(messageId, ChatsStore.excerptRows(all, true, excludedIds));
				}
			}
			await db.touchChat(chatId);
			this.messages = await db.listMessages(chatId);
			await this.loadCitations(chatId);
			await this.refresh();
		} finally {
			this.sending = false;
			this.streamingText = null;
		}
	}

	/** Parse a Workers AI SSE stream, accumulating deltas into streamingText. */
	private async consumeSse(body: ReadableStream<Uint8Array>): Promise<string> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let full = '';
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.startsWith('data:')) continue;
				const payload = line.slice(5).trim();
				if (!payload || payload === '[DONE]') continue;
				try {
					const obj = JSON.parse(payload);
					const delta: string = obj.response ?? obj.choices?.[0]?.delta?.content ?? '';
					if (delta) {
						full += delta;
						this.streamingText = isThinking(full) ? '' : stripThink(full);
					}
				} catch {
					// partial JSON split across chunks — ignored, next line completes it
				}
			}
		}
		return full;
	}
}

export const chatsStore = new ChatsStore();

// Chat state: list, active chat, messages, and the transitional
// retrieval-only "answer" (real generation lands in specs 004/005).

import { t, translate } from '$lib/i18n/index.svelte';
import { getLocalDb } from '$lib/local-db/client';
import type { CitationRow, MessageExcerptRow, MessagePrivacyRow } from '$lib/local-db/worker';
import { documentsStore } from './documents.svelte';
import { guardedFetch, OfflineError } from '$lib/net';
import { myaiStore, endpointHost, type ChatMessage } from './myai.svelte';
import { llmStore } from '$lib/private-ai/llm.svelte';
import { generationOptionsFor, verificationOptionsFor } from '$lib/private-ai/generation';
import {
	buildClarificationContext,
	buildRetrievalContext,
	isContestation,
	type RetrievalContext
} from '$lib/retrieval-context';
import {
	contactAnswerEvidenceCoverage,
	contactAnswerValues,
	durationValueMentions,
	missingDurationCarrier,
	ordinalScheduleValue
} from '$lib/pipeline/retrieval';
import { assistedPayloadBytes, buildAssistedExcerpts } from '$lib/assisted-payload';
import { questionLocale } from '$lib/analysis/query-router';
import { resolveQuestion, type EmbedQuestions } from '$lib/nlu/semantic-resolver';
import { buildExecutionPlan } from '$lib/nlu/execution-plan';
import { contextualClarification } from '$lib/nlu/clarification';
import {
	analyzeQuestion,
	type ClarificationKind,
	type SemanticFrame
} from '$lib/nlu/semantic-frame';
import { formatAggregateResult } from '$lib/analysis/format-aggregate';
import { formatColumnAnswer } from '$lib/analysis/format-column';
import { groundedOrRefused } from '$lib/private-ai/grounding';
import { answerRecordColumn, type ColumnAnswer } from '$lib/analysis/record-columns';
import { parseRelatedQuestions } from '$lib/related-questions';
import { hasAnswerBearingEvidence } from '$lib/pipeline/relevance';
import { retrieveWithLocalQueryFallback } from '$lib/pipeline/query-translation';
import { buildAuditedExtractiveAnswer } from '$lib/private-ai/extractive-answer';
import { generateWithContextFit } from '$lib/private-ai/context-fit';
import {
	SYSTEM_PROMPT,
	buildContactValuePrompt,
	buildDurationValuePrompt,
	buildScheduleValuePrompt,
	buildUserPrompt,
	buildVerificationPrompt,
	buildVerificationUserPrompt,
	enforceAnswerInvariants,
	extractThink,
	fitEvidenceToContext,
	groundedRefusal,
	isDegenerateAnswer,
	isThinking,
	needsGroundedVerification,
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
	/** Live <think> trace while the answer is being written (draft notes). */
	streamingThinking = $state<string | null>(null);
	/** Assisted send awaiting review in the right panel (FEATURES 5ter). */
	pendingAssisted = $state<{
		chatId: string;
		question: string;
		hits: SearchHit[];
		conversationContext: string | null;
		route: QuestionRoute;
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
	private readonly embedQuestions: EmbedQuestions = (texts) => documentsStore.embedQueries(texts);

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

	/** The ledger starts with the send itself — before question analysis, so
	 * feedback is immediate. Aggregates gain their extra step here, once the
	 * route is known, without resetting statuses or the step timer. */
	private ensureCalculateStep(): void {
		if (this.workSteps.some((step) => step.id === 'calculate')) return;
		this.workSteps = this.workSteps.flatMap((step) =>
			step.id === 'write'
				? [{ id: 'calculate' as const, status: 'pending' as const }, step]
				: [step]
		);
	}

	private retrievalContext(question: string) {
		const clarificationIds = new Set(
			Object.entries(this.methodByMessage)
				.filter(([, summary]) => summary.kind === 'clarification')
				.map(([messageId]) => messageId)
		);
		// Clarification prompts are control messages: they must never be read
		// back as the "previous answer" of a follow-up. A contestation forces the
		// context even without a pronoun: the disputed answer IS its subject.
		return (
			buildClarificationContext(this.messages, question, clarificationIds) ??
			buildRetrievalContext(this.messages, question, isContestation(question), clarificationIds)
		);
	}

	/** Kind of the clarification the assistant just asked, if the immediately
	 * preceding assistant turn was one. */
	private pendingClarificationKind(): ClarificationKind | null {
		const last = [...this.messages].reverse().find((m) => m.role === 'assistant');
		if (!last) return null;
		const method = this.methodByMessage[last.id];
		return method?.kind === 'clarification' ? (method.clarification ?? null) : null;
	}

	/** Ambiguity checks judge the current turn only: a follow-up context glues
	 * two complete questions into analysisQuery, which must not read as a
	 * multi-part question. A repeat of the clarification the assistant just
	 * asked is suppressed — re-asking verbatim loops forever, answering
	 * best-effort is the way out. */
	private clarificationFor(
		question: string,
		context: RetrievalContext | null,
		frame: SemanticFrame,
		documentCount: number
	): ClarificationKind | null {
		const query = context?.clarificationQuery ?? question;
		const clarification = contextualClarification(query, context ? analyzeQuestion(query) : frame, {
			hasConversationContext: !!context,
			documentCount
		});
		return clarification && clarification !== this.pendingClarificationKind()
			? clarification
			: null;
	}

	private async retrieveWithSearchFallback(
		query: string,
		documents: ChatDocument[],
		mode: ChatMode | null,
		refinementQuery: string,
		route: QuestionRoute,
		onInspect?: () => void
	): Promise<{ hits: SearchHit[]; alternateQueries: string[] }> {
		const retrieve = (alternateQueries: string[]) =>
			documentsStore.retrieve(
				query,
				documents.map((document) => document.id),
				refinementQuery,
				onInspect,
				route,
				alternateQueries
			);
		if (mode !== 'private' || llmStore.status !== 'ready') {
			return { hits: await retrieve([]), alternateQueries: [] };
		}
		return retrieveWithLocalQueryFallback({
			query,
			refinementQuery,
			documentLanguages: documents.map((document) => document.language),
			rewrite: (messages) =>
				llmStore.generate(messages, () => {}, {
					reasoning: 'off',
					maxTokens: 96,
					temperature: 0
				}),
			retrieve
		});
	}

	private async insertClarification(
		chatId: string,
		kind: ClarificationKind,
		locale: 'fr' | 'en',
		versionGroup: string | null = null
	): Promise<void> {
		const { db } = await getLocalDb();
		const key = {
			scope: 'clarification.scope',
			financial_role: 'clarification.financialRole',
			intent: 'clarification.intent',
			time: 'clarification.time',
			entity: 'clarification.entity',
			document: 'clarification.document',
			unit_currency: 'clarification.unitCurrency',
			multi_part: 'clarification.multiPart'
		} as const;
		const messageId = crypto.randomUUID();
		await db.insertMessage({
			id: messageId,
			chatId,
			role: 'assistant',
			content: translate(locale, key[kind]),
			mode: 'private',
			versionGroup
		});
		await db.insertMessageMethod(messageId, {
			kind: 'clarification',
			documentCount: 0,
			passageCount: 0,
			reasoningUsed: false,
			clarification: kind
		});
		await this.loadCitations(chatId);
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

			const questions = parseRelatedQuestions(raw);
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
		this.startWork(
			'targeted',
			this.chatDocuments.filter((d) => d.enabled && d.status === 'ready').length
		);
		try {
			const { db } = await getLocalDb();
			// Spec 020 — Try again keeps the previous answer as an inactive version.
			const versionGroup = last.versionGroup ?? last.id;
			await db.retireMessage(last.id, versionGroup);
			this.messages = await db.listMessages(chatId);
			const context = this.retrievalContext(question);
			const enabledDocs = this.chatDocuments.filter((d) => d.enabled && d.status === 'ready');
			const analysisQuestion = context?.analysisQuery ?? question;
			const frame = await resolveQuestion(analysisQuestion, this.embedQuestions);
			const clarification = this.clarificationFor(question, context, frame, enabledDocs.length);
			if (clarification) {
				await this.insertClarification(chatId, clarification, frame.locale, versionGroup);
				this.messages = await db.listMessages(chatId);
				return;
			}
			const route = buildExecutionPlan(analysisQuestion, frame).route;
			if (
				route === 'aggregate' ||
				(await this.scheduleAggregateApplies(analysisQuestion, frame, enabledDocs))
			) {
				this.ensureCalculateStep();
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
			// One named cell of a table row is a lookup, not a passage to interpret.
			const columnAnswer = await this.scheduleColumnAnswer(analysisQuestion, enabledDocs);
			if (columnAnswer) {
				this.ensureCalculateStep();
				await this.generateColumnAnswer(chatId, columnAnswer, frame.locale, versionGroup);
				await db.touchChat(chatId);
				this.messages = await db.listMessages(chatId);
				await this.refresh();
				return;
			}
			const hits = enabledDocs.length
				? (
						await this.retrieveWithSearchFallback(
							context?.searchQuery ?? question,
							enabledDocs,
							this.chats.find((item) => item.id === chatId)?.mode ?? null,
							question,
							route,
							() => this.advanceWork('inspect')
						)
					).hits
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
			this.streamingThinking = null;
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
			lines.push(m.role === 'user' ? `## You` : `## Regeste`);
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
		// Immediate feedback: the ledger appears with the send, not after the
		// question analysis (embedding) that precedes retrieval.
		this.startWork(
			'targeted',
			this.chatDocuments.filter((d) => d.enabled && d.status === 'ready').length
		);
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
			const context = this.retrievalContext(question);

			const enabledDocs = this.chatDocuments.filter((d) => d.enabled && d.status === 'ready');
			const analysisQuestion = context?.analysisQuery ?? question;
			const frame = await resolveQuestion(analysisQuestion, this.embedQuestions);
			const clarification = this.clarificationFor(question, context, frame, enabledDocs.length);
			if (clarification) {
				await this.insertClarification(chatId, clarification, frame.locale);
				await db.touchChat(chatId);
				this.messages = await db.listMessages(chatId);
				await this.refresh();
				return;
			}
			const route = buildExecutionPlan(analysisQuestion, frame).route;
			const columnAnswer =
				route === 'aggregate'
					? null
					: await this.scheduleColumnAnswer(analysisQuestion, enabledDocs);
			if (
				route === 'aggregate' ||
				(await this.scheduleAggregateApplies(analysisQuestion, frame, enabledDocs))
			) {
				this.ensureCalculateStep();
				await this.generateAggregate(
					chatId,
					analysisQuestion,
					enabledDocs.map((d) => d.id)
				);
			} else if (columnAnswer) {
				// One named cell of a table row is a lookup, not a passage to interpret.
				this.ensureCalculateStep();
				await this.generateColumnAnswer(chatId, columnAnswer, frame.locale);
			} else {
				let hits: SearchHit[] = [];
				let rejected: SearchHit[] = [];
				if (enabledDocs.length) {
					const retrieved = await this.retrieveWithSearchFallback(
						context?.searchQuery ?? question,
						enabledDocs,
						chat?.mode ?? null,
						question,
						route,
						() => this.advanceWork('inspect')
					);
					hits = retrieved.hits;
					if (!hasAnswerBearingEvidence(question, hits, retrieved.alternateQueries)) {
						// Kept out of generation on purpose, kept here so a refusal can
						// still show what was looked at.
						rejected = hits;
						hits = [];
					}
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
					context?.promptContext ?? null,
					rejected
				);
			}
			await db.touchChat(chatId);
			this.messages = await db.listMessages(chatId);
			await this.refresh();
		} finally {
			this.sending = false;
			this.streamingText = null;
			this.streamingThinking = null;
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
		conversationContext: string | null = null,
		/** Retrieved but judged too weak to answer from — shown with the refusal. */
		rejected: SearchHit[] = []
	): Promise<void> {
		const { db } = await getLocalDb();
		const chat = this.chats.find((c) => c.id === chatId);
		if (documentCount > 0 && hits.length === 0) {
			await this.insertGroundedRefusal(
				chatId,
				question,
				documentCount,
				route,
				versionGroup,
				rejected
			);
			return;
		}
		// The engine is briefly 'generating' after every answer (related questions
		// run on-device once sending is already false) and 'loading' for ~2s on a
		// warm start. A strict readiness check here turned both windows into a
		// permanent retrieval-only turn — the stored turn is a fossil of a race,
		// and regenerate() even retires the real answer to make room for it. Wait
		// out the short states; fall through honestly only if the engine never
		// becomes ready (cold 2.4 GB download, error, unavailable).
		if (
			chat?.mode === 'private' &&
			(llmStore.status === 'generating' || llmStore.status === 'loading')
		) {
			const deadline = performance.now() + 20_000;
			while (
				performance.now() < deadline &&
				(llmStore.status === 'generating' || llmStore.status === 'loading')
			) {
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
		}
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
				conversationContext,
				route
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

	private async insertGroundedRefusal(
		chatId: string,
		question: string,
		documentCount: number,
		route: QuestionRoute,
		versionGroup: string | null = null,
		rejected: SearchHit[] = []
	): Promise<void> {
		const { db } = await getLocalDb();
		const messageId = crypto.randomUUID();
		// A grounded refusal is an ANSWER, not a system notice: it is one version
		// of the turn, and the passages that were looked at and judged too weak
		// are exactly what makes the refusal auditable. Recording them here gives
		// it the same closest-sources list, "what the AI received" panel and
		// version navigation as any other answer.
		await db.insertMessage({
			id: messageId,
			chatId,
			role: 'assistant',
			content: groundedRefusal(question),
			mode: 'private',
			versionGroup
		});
		if (rejected.length) {
			await db.insertMessageExcerpts(messageId, ChatsStore.excerptRows(rejected, false, new Set()));
		}
		await db.insertPrivacyEvent({
			chatId,
			messageId,
			mode: 'private',
			destination: 'device',
			excerptCount: rejected.length,
			bytesSent: 0
		});
		await db.insertMessageMethod(messageId, {
			kind: route,
			documentCount,
			passageCount: rejected.length,
			reasoningUsed: false
		});
		await this.loadCitations(chatId);
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
		// Trim BEFORE anything numbers the excerpts: prompt, citations and the
		// what-AI-saw record must all see the same list (see fitEvidenceToContext).
		if (grounded) hits = fitEvidenceToContext(question, hits, conversationContext);
		let groundedPrompt = grounded ? buildUserPrompt(question, hits, conversationContext) : '';
		const buildMessages = (state: { hits: SearchHit[]; conversationContext: string | null }) => {
			if (!grounded)
				return [
					{
						role: 'system' as const,
						content:
							'You are a concise assistant. The user attached no documents: answer from general knowledge and say so briefly.'
					},
					{ role: 'user' as const, content: question }
				];
			groundedPrompt = buildUserPrompt(question, state.hits, state.conversationContext);
			return [
				{ role: 'system' as const, content: SYSTEM_PROMPT },
				{ role: 'user' as const, content: groundedPrompt }
			];
		};
		let messages = buildMessages({ hits, conversationContext });

		// Stream display filters reasoning blocks: the user sees "Thinking…"
		// (empty streamingText) until the actual answer starts.
		let streamRaw = '';
		let raw: string;
		// Draft notes: the <think> trace of whichever pass produced the answer.
		let reasoning = '';
		let reasoningMs: number | null = null;
		// A contested turn re-weighs evidence; a deterministic extract would just
		// repeat whichever clause matches and cannot concede or confirm.
		const contested = conversationContext !== null && isContestation(question);
		const extractive = grounded && !contested ? buildAuditedExtractiveAnswer(question, hits) : null;
		this.advanceWork('write');
		if (extractive) {
			raw = extractive.answer;
			this.streamingText = raw;
		} else {
			this.stopRequested = false;
			const options = generationOptionsFor(
				question,
				route === 'synthesis' ? 'synthesis' : 'targeted'
			);
			const onDelta = (delta: string) => {
				streamRaw += delta;
				this.streamingText = isThinking(streamRaw) ? '' : stripThink(streamRaw);
				this.streamingThinking = extractThink(streamRaw) || null;
			};
			const writeStartedAt = performance.now();
			try {
				// The chars/3 clamp above is an estimate; the engine's overflow
				// error is exact. Shrink tail excerpts (then the conversation
				// context) and replay until the prompt fits — the surviving
				// excerpts keep their numbers, so citations stay positional.
				const fitted = await generateWithContextFit(
					{ hits, conversationContext },
					(state) => {
						streamRaw = '';
						messages = buildMessages(state);
						return llmStore.generate(messages, onDelta, options);
					},
					(state) =>
						console.warn(
							`[regeste] prompt over context window, retrying with ${state.hits.length} excerpts` +
								(state.conversationContext === null ? ' and no conversation context' : '')
						)
				);
				raw = fitted.text;
				// Citations, retry prompts, verification and the what-AI-saw record
				// must all describe the list the model actually saw.
				hits = fitted.state.hits;
				conversationContext = fitted.state.conversationContext;
			} catch (err) {
				console.error('[regeste] private generation failed:', err);
				raw = streamRaw;
			}
			reasoning = extractThink(raw || streamRaw);
			reasoningMs = Math.round(performance.now() - writeStartedAt);
			// A reasoning pass can die around its <think> block: EOS inside it, EOS
			// a few words into the answer, or budget truncation. The cause varies
			// by build; the failure is always the same — no usable answer after
			// thinking. Judge the result: retry once directly, and drop the
			// dead-pass notes since they explain nothing that is shown.
			// Threshold calibrated on observed failures ("", "1. **Garantie…" ≈ 13
			// chars); a legitimate single-fact answer already runs ~60-110 chars
			// and must not trigger the retry (it would discard its notes).
			const visibleAnswer = stripThink(raw || streamRaw).trim();
			if (options.reasoning === 'on' && visibleAnswer.length < 40 && !this.stopRequested) {
				this.streamingThinking = null;
				streamRaw = '';
				try {
					raw = await llmStore.generate(messages, onDelta, {
						...options,
						reasoning: 'off',
						maxTokens: 420
					});
				} catch (err) {
					console.error('[regeste] direct retry after reasoning failed:', err);
					raw = streamRaw;
				}
				// The thinking-pass notes stay: they are what actually happened
				// during this turn, and the direct retry answered the same prompt.
			} else if (
				options.reasoning !== 'on' &&
				isDegenerateAnswer(visibleAnswer) &&
				!this.stopRequested
			) {
				// The same early-death failure exists on the direct path, where the
				// gate above could structurally never fire: a worker that dies after
				// one decoded token leaves "1" as the whole answer, and nothing
				// downstream judged it. Retry once; adopt the retry only when it is
				// an actual improvement, so this can never make an answer worse.
				streamRaw = '';
				try {
					const retried = stripThink(
						await llmStore.generate(messages, onDelta, { ...options, maxTokens: 420 })
					).trim();
					if (retried && (!isDegenerateAnswer(retried) || retried.length > visibleAnswer.length)) {
						raw = retried;
					}
				} catch (err) {
					console.error('[regeste] direct retry after degenerate answer failed:', err);
				}
			}
		}
		raw = stripThink(raw || streamRaw);
		// Selection extracts are drafts like any other: they can bind the
		// right-looking clause to the wrong subject, and grounded verification is
		// what audits slot completeness. Exact-copy extracts are never paraphrased.
		if (
			(!extractive || extractive.needsAudit) &&
			grounded &&
			hits.length &&
			raw.trim() &&
			needsGroundedVerification(question, raw)
		) {
			try {
				// The verification is a fresh generation; a small/CPU model can spend
				// its whole budget inside <think> and return nothing. Only adopt the
				// verified answer when it is non-empty, otherwise keep the good draft.
				const verificationStartedAt = performance.now();
				const verifiedRaw = await llmStore.generate(
					[
						{ role: 'system', content: SYSTEM_PROMPT },
						{
							role: 'user',
							content: buildVerificationPrompt(
								question,
								buildVerificationUserPrompt(question, hits, conversationContext),
								raw
							)
						}
					],
					() => {},
					verificationOptionsFor()
				);
				const verified = stripThink(verifiedRaw);
				// Non-empty is not enough: the verification pass runs the same engine
				// with the same failure modes, and adopting a "1" that died after one
				// token REPLACES a coherent draft with garbage. A degenerate output
				// means the audit failed, not that the draft was wrong — keep the draft.
				if (verified.trim() && !isDegenerateAnswer(verified)) {
					raw = verified;
					this.streamingText = raw;
					// The displayed answer now comes from the verification pass; its
					// notes are the ones that explain it.
					const verificationThink = extractThink(verifiedRaw);
					if (verificationThink) {
						reasoning = verificationThink;
						reasoningMs = Math.round(performance.now() - verificationStartedAt);
					}
				}
			} catch (err) {
				console.error('[regeste] grounded verification failed:', err);
			}
		}
		// An answer to "which email address" that names no address is not an
		// answer, even when it faithfully renders a passage. The passage that
		// echoes the question's wording maximises every overlap feature, so the
		// draft can land on it while the excerpt carrying the value sits right
		// there. Judge the result the way the reasoning pass above is judged and
		// retry once. Three conditions, all required: the question names a typed
		// atom (otherwise coverage is 0 everywhere and this is inert), an excerpt
		// carries one, and the draft states none. The retry is adopted only when
		// it does state the value, so the answer can improve or stay, never regress.
		// buildUserPrompt numbers excerpts 1..n in hits order, so the carrier's
		// position is its citation number and the correction can point at it.
		const carrierIndex =
			grounded && raw.trim() && contactAnswerEvidenceCoverage(question, raw) === 0
				? hits.findIndex((hit) => contactAnswerEvidenceCoverage(question, hit.text) > 0)
				: -1;
		if (carrierIndex >= 0 && !this.stopRequested && (!extractive || extractive.needsAudit)) {
			try {
				const value = contactAnswerValues(question, hits[carrierIndex].text)[0];
				const retriedRaw = await llmStore.generate(
					[
						{ role: 'system' as const, content: SYSTEM_PROMPT },
						{
							role: 'user' as const,
							content: `${groundedPrompt}\n\n${buildContactValuePrompt(question, value, carrierIndex + 1)}`
						}
					],
					() => {},
					generationOptionsFor(question, 'targeted')
				);
				const retried = stripThink(retriedRaw);
				if (retried.trim() && contactAnswerEvidenceCoverage(question, retried) > 0) {
					raw = retried;
					this.streamingText = raw;
				}
			} catch (err) {
				console.error('[regeste] contact-value retry failed:', err);
			}
		}
		// Same judgment for deadlines: a question asking one delay per part
		// ("within what time does X acknowledge a written complaint and answer
		// it?") is not answered by a draft stating fewer distinct durations than
		// the question has parts, when an excerpt carries the missing value. The
		// retry names the literal value and its excerpt number, and is adopted
		// only when it states strictly more distinct durations — improve or stay,
		// never regress.
		const durationCarrier =
			grounded && raw.trim() && !this.stopRequested && (!extractive || extractive.needsAudit)
				? missingDurationCarrier(question, raw, hits)
				: null;
		if (durationCarrier) {
			try {
				const statedBefore = durationValueMentions(raw).length;
				const retriedRaw = await llmStore.generate(
					[
						{ role: 'system' as const, content: SYSTEM_PROMPT },
						{
							role: 'user' as const,
							content: `${groundedPrompt}\n\n${buildDurationValuePrompt(question, durationCarrier.literal, durationCarrier.index + 1)}`
						}
					],
					() => {},
					generationOptionsFor(question, 'targeted')
				);
				const retried = stripThink(retriedRaw);
				if (
					retried.trim() &&
					!isDegenerateAnswer(retried) &&
					durationValueMentions(retried).length > statedBefore
				) {
					raw = retried;
					this.streamingText = raw;
				}
			} catch (err) {
				console.error('[regeste] duration-value retry failed:', err);
			}
		}
		// Same judgment for schedule tables: "the first installment" answered
		// with the outstanding balance is a wrong-column read the repeating-value
		// analysis resolves deterministically. Retry naming the cell; adopted
		// only when the retry states it.
		const scheduleCell =
			grounded && raw.trim() && !this.stopRequested && (!extractive || extractive.needsAudit)
				? hits
						.slice(0, 3)
						.map((hit, index) => ({ index, value: ordinalScheduleValue(question, hit.text) }))
						.find((entry) => entry.value !== null)
				: undefined;
		if (scheduleCell && !raw.includes(scheduleCell.value!.literal)) {
			try {
				const retriedRaw = await llmStore.generate(
					[
						{ role: 'system' as const, content: SYSTEM_PROMPT },
						{
							role: 'user' as const,
							content: `${groundedPrompt}\n\n${buildScheduleValuePrompt(question, scheduleCell.value!.literal, scheduleCell.index + 1)}`
						}
					],
					() => {},
					generationOptionsFor(question, 'targeted')
				);
				const retried = stripThink(retriedRaw);
				if (retried.trim() && retried.includes(scheduleCell.value!.literal)) {
					raw = retried;
					this.streamingText = raw;
				}
			} catch (err) {
				console.error('[regeste] schedule-value retry failed:', err);
			}
		}
		raw = enforceAnswerInvariants(question, raw);
		// A figure the excerpts do not carry is refused rather than shown under a
		// clean-looking citation: measured across three unrelated documents, a
		// local model will state a subtotal that is off by three thousand, or
		// invent a whole series, and both read as authoritative.
		raw = groundedOrRefused(
			raw,
			hits.map((hit) => hit.text),
			groundedRefusal(question)
		).text;
		// Aborted or failed with nothing produced → an honest system notice.
		const stopped = !raw.trim();

		const { text: cleaned, citations } =
			grounded && !stopped
				? route === 'targeted'
					? resolveTargetedCitations(raw, hits, question)
					: resolveCitations(raw, hits, question)
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
			reasoningUsed: route === 'synthesis',
			// Bounded copy: draft notes are a transparency artifact, not archival.
			reasoning: reasoning ? reasoning.slice(0, 8000) : null,
			reasoningMs
		});
		await this.loadCitations(chatId);
	}

	/** "How much do I pay in total?" over a single amortization notice: the
	 * frame sees a sum with no specific money role — the shape that asks the
	 * scope clarification with several documents, and with one document used
	 * to fall through to generation, where the model approximated a 240-row
	 * sum. When the document's facts are dominated by schedule records (a
	 * dozen-plus dated installments with a repeating column), the exact
	 * aggregate path answers instead. The probe's extraction work is cached
	 * per document, so generateAggregate right after re-reads it for free. */
	private async scheduleAggregateApplies(
		question: string,
		frame: SemanticFrame,
		enabledDocs: ChatDocument[]
	): Promise<boolean> {
		if (frame.operation !== 'sum' || frame.clarification !== 'scope') return false;
		if (!enabledDocs.length) return false;
		try {
			const probe = await documentsStore.aggregate(
				question,
				enabledDocs.map((document) => document.id)
			);
			const scheduleFacts = probe.facts.filter((fact) =>
				fact.recordKey?.includes(':schedule:')
			).length;
			return probe.groups.length === 1 && probe.count >= 12 && scheduleFacts >= probe.count * 0.8;
		} catch {
			return false;
		}
	}

	/**
	 * A question about one named column of a table row, answered in code.
	 *
	 * Runs before generation and only ever declines: no dated rows with named
	 * columns, no row selector, or no single column matching the question all
	 * leave the normal path untouched. What it does catch is the class both a 4B
	 * and a 9B model were measured getting wrong — reading a neighbouring column
	 * of a row that was in front of them.
	 */
	private async scheduleColumnAnswer(
		question: string,
		enabledDocs: ChatDocument[]
	): Promise<ColumnAnswer | null> {
		if (!enabledDocs.length) return null;
		try {
			const records = await documentsStore.scheduleRecords(enabledDocs.map((doc) => doc.id));
			return answerRecordColumn(question, records);
		} catch {
			// An exact path that cannot run must never take the answer down with it.
			return null;
		}
	}

	private async generateColumnAnswer(
		chatId: string,
		answer: ColumnAnswer,
		locale: 'fr' | 'en',
		versionGroup: string | null = null
	): Promise<void> {
		const { db } = await getLocalDb();
		this.advanceWork('inspect');
		this.advanceWork('calculate', answer.considered);
		const formatted = formatColumnAnswer(answer, locale);
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
		const fact = answer.record.facts[0];
		const locator = answer.record.page ? `page ${answer.record.page}` : answer.record.headingPath;
		if (fact) {
			const excerpt = {
				chunkId: fact.chunkId,
				snippet: fact.text.slice(0, 240),
				documentName: answer.record.documentName,
				locator
			};
			await db.insertCitations(messageId, [excerpt]);
			await db.insertMessageExcerpts(messageId, [{ ...excerpt, sent: false, excluded: false }]);
		}
		await db.insertPrivacyEvent({
			chatId,
			messageId,
			mode: 'private',
			destination: 'device',
			excerptCount: fact ? 1 : 0,
			bytesSent: 0
		});
		await db.insertMessageMethod(messageId, {
			kind: 'aggregate',
			documentCount: 1,
			passageCount: fact ? 1 : 0,
			reasoningUsed: false,
			calculation: formatted.calculation
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
		conversationContext: string | null = null,
		route: QuestionRoute = 'targeted'
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
			if (!(err instanceof OfflineError)) console.error('[regeste] my-ai generation failed:', err);
			if (!streamRaw.trim()) {
				failed = err instanceof OfflineError ? err.message : t('notice.myaiUnreachable');
			}
		}
		const raw = stripThink(streamRaw);
		const stopped = !failed && !raw.trim();
		const isNotice = !!failed || stopped;

		// Same guard as the local path, from the same function: My AI runs someone
		// else's model and has no more claim to state an unsupported figure.
		const checked = groundedOrRefused(
			raw.trim(),
			hits.map((hit) => hit.text),
			groundedRefusal(question)
		).text;
		const { text: cleaned, citations } = isNotice
			? { text: failed ?? t('notice.stopped'), citations: [] }
			: grounded
				? resolveCitations(checked, hits, question)
				: { text: checked, citations: [] };

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
		await db.insertMessageMethod(messageId, {
			kind: route,
			documentCount,
			passageCount: hits.length,
			reasoningUsed: route === 'synthesis'
		});
		await this.loadCitations(chat.id);
	}

	private stopRequested = false;

	async stopGeneration(): Promise<void> {
		this.stopRequested = true;
		myaiStore.stop();
		await llmStore.stop();
	}

	/** Retrieval over the active chat's enabled documents (assisted preview). */
	async retrieveForActive(
		query: string,
		refinementQuery = query,
		route?: QuestionRoute
	): Promise<SearchHit[]> {
		const enabledDocs = this.chatDocuments.filter((d) => d.enabled && d.status === 'ready');
		if (!enabledDocs.length) return [];
		return documentsStore.retrieve(
			query,
			enabledDocs.map((d) => d.id),
			refinementQuery,
			undefined,
			route
		);
	}

	/** Stage an assisted send for review in the right panel. */
	async stageAssisted(
		chatId: string,
		question: string
	): Promise<'staged' | 'no-excerpts' | 'handled'> {
		const context = this.retrievalContext(question);
		const frame = await resolveQuestion(context?.analysisQuery ?? question, this.embedQuestions);
		const plan = buildExecutionPlan(context?.analysisQuery ?? question, frame);
		const clarification = this.clarificationFor(
			question,
			context,
			frame,
			this.chatDocuments.filter((document) => document.enabled).length
		);
		if (clarification || plan.route === 'aggregate') {
			await this.send(chatId, question);
			return 'handled';
		}
		const hits = await this.retrieveForActive(
			context?.searchQuery ?? question,
			question,
			plan.route
		);
		if (!hits.length || !hasAnswerBearingEvidence(question, hits)) return 'no-excerpts';
		this.pendingAssisted = {
			chatId,
			question,
			hits,
			conversationContext: context?.promptContext ?? null,
			route: plan.route
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
			pending.conversationContext,
			pending.route
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
		conversationContext: string | null = null,
		route: QuestionRoute = 'targeted'
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
			const enabledDocumentCount = this.chatDocuments.filter(
				(document) => document.enabled && document.status === 'ready'
			).length;
			if (enabledDocumentCount > 0 && selected.length === 0) {
				await this.insertGroundedRefusal(chatId, question, enabledDocumentCount, route);
				this.messages = await db.listMessages(chatId);
				await db.touchChat(chatId);
				await this.refresh();
				return;
			}
			this.streamingText = '';

			const excerpts = buildAssistedExcerpts(selected);
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
			await db.insertMessageMethod(messageId, {
				kind: route,
				documentCount: new Set(selected.map((hit) => hit.documentId)).size,
				passageCount: selected.length,
				reasoningUsed: route === 'synthesis'
			});
			await db.touchChat(chatId);
			this.messages = await db.listMessages(chatId);
			await this.loadCitations(chatId);
			await this.refresh();
		} finally {
			this.sending = false;
			this.streamingText = null;
			this.streamingThinking = null;
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

// Chat state: list, active chat, messages, and the transitional
// retrieval-only "answer" (real generation lands in specs 004/005).

import { getLocalDb } from '$lib/local-db/client';
import type { CitationRow, MessagePrivacyRow } from '$lib/local-db/worker';
import { documentsStore } from './documents.svelte';
import { guardedFetch, OfflineError } from '$lib/net';
import { myaiStore, endpointHost, type ChatMessage } from './myai.svelte';
import { llmStore } from '$lib/private-ai/llm.svelte';
import {
	SYSTEM_PROMPT,
	buildUserPrompt,
	isThinking,
	resolveCitations,
	stripThink
} from '$lib/private-ai/prompt';
import type { ChatDocument, ChatMode, LocalChat, LocalMessage, SearchHit } from '$lib/types';

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
	citations = $state<Record<string, CitationRow[]>>({});
	privacyByMessage = $state<Record<string, MessagePrivacyRow>>({});
	sending = $state(false);
	/** Non-null while a Private answer streams in. */
	streamingText = $state<string | null>(null);
	/** Assisted send awaiting review in the right panel (FEATURES 5ter). */
	pendingAssisted = $state<{ chatId: string; question: string; hits: SearchHit[] } | null>(null);
	/** P2 — active chat's egress state (cloud requests + bytes). */
	chatEgress = $state<{ cloudRequests: number; bytes: number } | null>(null);

	activeChat = $derived(this.chats.find((c) => c.id === this.activeChatId) ?? null);

	async refresh(): Promise<void> {
		const { db } = await getLocalDb();
		this.chats = await db.listChats();
	}

	async open(chatId: string): Promise<void> {
		this.activeChatId = chatId;
		const { db } = await getLocalDb();
		this.messages = await db.listMessages(chatId);
		this.chatDocuments = await db.listChatDocuments(chatId);
		await this.loadCitations(chatId);
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

	async setMyaiModel(chatId: string, model: string): Promise<void> {
		const { db } = await getLocalDb();
		await db.setChatMyaiModel(chatId, model);
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
		try {
			const { db } = await getLocalDb();
			await db.deleteMessage(last.id);
			this.messages = await db.listMessages(chatId);
			const enabledDocs = this.chatDocuments.filter((d) => d.enabled && d.status === 'ready');
			const hits = enabledDocs.length
				? await documentsStore.retrieve(
						question,
						enabledDocs.map((d) => d.id)
					)
				: [];
			await this.answer(chatId, question, hits, enabledDocs.length);
			await db.touchChat(chatId);
			this.messages = await db.listMessages(chatId);
			await this.refresh();
		} finally {
			this.sending = false;
			this.streamingText = null;
		}
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

			const enabledDocs = this.chatDocuments.filter((d) => d.enabled && d.status === 'ready');
			let hits: SearchHit[] = [];
			if (enabledDocs.length) {
				hits = await documentsStore.retrieve(
					question,
					enabledDocs.map((d) => d.id)
				);
			}

			await this.answer(chatId, question, hits, enabledDocs.length);
			await db.touchChat(chatId);
			this.messages = await db.listMessages(chatId);
			await this.refresh();
		} finally {
			this.sending = false;
			this.streamingText = null;
		}
	}

	/** Route a question to the chat's mode (shared by send/regenerate). */
	private async answer(
		chatId: string,
		question: string,
		hits: SearchHit[],
		documentCount: number
	): Promise<void> {
		const { db } = await getLocalDb();
		const chat = this.chats.find((c) => c.id === chatId);
		if (chat?.mode === 'private' && llmStore.status === 'ready') {
			await this.generatePrivate(chatId, question, hits, documentCount);
		} else if (
			chat?.mode === 'myai' &&
			!chat.privateOnly &&
			myaiStore.baseUrl &&
			(chat.myaiModel || myaiStore.defaultModel)
		) {
			await this.generateMyAi(chat, question, hits, documentCount);
		} else {
			await db.insertMessage({
				id: crypto.randomUUID(),
				chatId,
				role: 'assistant',
				content: JSON.stringify({ hits, documentCount }),
				mode: 'retrieval'
			});
		}
	}

	private async generatePrivate(
		chatId: string,
		question: string,
		hits: SearchHit[],
		documentCount: number
	): Promise<void> {
		const { db } = await getLocalDb();
		this.streamingText = '';
		const grounded = documentCount > 0;
		const messages = grounded
			? [
					{ role: 'system' as const, content: SYSTEM_PROMPT },
					{ role: 'user' as const, content: buildUserPrompt(question, hits) }
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
		try {
			raw = await llmStore.generate(messages, (delta) => {
				streamRaw += delta;
				this.streamingText = isThinking(streamRaw) ? '' : stripThink(streamRaw);
			});
		} catch (err) {
			console.error('[folio] private generation failed:', err);
			raw = streamRaw;
		}
		raw = stripThink(raw! || streamRaw);
		// Aborted or failed with nothing produced → keep the thread honest.
		if (!raw.trim()) raw = '(generation stopped)';

		const { text: cleaned, citations } = grounded
			? resolveCitations(raw, hits)
			: { text: raw, citations: [] };

		const messageId = crypto.randomUUID();
		await db.insertMessage({
			id: messageId,
			chatId,
			role: 'assistant',
			content: cleaned,
			mode: 'private'
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
		documentCount: number
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
					{ role: 'user', content: buildUserPrompt(question, hits) }
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
				failed =
					err instanceof OfflineError
						? err.message
						: 'Could not reach your AI endpoint — check that it is running, the URL, and its CORS settings.';
			}
		}
		const raw = stripThink(streamRaw);

		const { text: cleaned, citations } = failed
			? { text: failed, citations: [] }
			: grounded
				? resolveCitations(raw.trim() || '(generation stopped)', hits)
				: { text: raw.trim() || '(generation stopped)', citations: [] };

		const messageId = crypto.randomUUID();
		await db.insertMessage({
			id: messageId,
			chatId: chat.id,
			role: 'assistant',
			content: cleaned,
			mode: 'myai'
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
		}
		await this.loadCitations(chat.id);
	}

	async stopGeneration(): Promise<void> {
		myaiStore.stop();
		await llmStore.stop();
	}

	/** Retrieval over the active chat's enabled documents (assisted preview). */
	async retrieveForActive(question: string): Promise<SearchHit[]> {
		const enabledDocs = this.chatDocuments.filter((d) => d.enabled && d.status === 'ready');
		if (!enabledDocs.length) return [];
		return documentsStore.retrieve(
			question,
			enabledDocs.map((d) => d.id)
		);
	}

	/** Stage an assisted send for review in the right panel. */
	async stageAssisted(chatId: string, question: string): Promise<'staged' | 'no-excerpts'> {
		const hits = await this.retrieveForActive(question);
		if (!hits.length) return 'no-excerpts';
		this.pendingAssisted = { chatId, question, hits };
		return 'staged';
	}

	async confirmAssisted(selected: SearchHit[]): Promise<void> {
		const pending = this.pendingAssisted;
		if (!pending) return;
		this.pendingAssisted = null;
		await this.sendAssisted(pending.chatId, pending.question, selected);
	}

	cancelAssisted(): void {
		this.pendingAssisted = null;
	}

	/**
	 * Assisted send: the ONLY code path where user content leaves the device —
	 * the question plus the excerpts the user confirmed in the preview.
	 */
	async sendAssisted(chatId: string, question: string, selected: SearchHit[]): Promise<void> {
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
			const bytesSent =
				new TextEncoder().encode(question).length +
				excerpts.reduce((n, e) => n + new TextEncoder().encode(e.text).length, 0);

			let raw = '';
			let failed: string | null = null;
			try {
				const res = await guardedFetch('/api/assisted', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ question, excerpts })
				});
				if (!res.ok) {
					failed =
						res.status === 429
							? 'Monthly Assisted quota reached — it resets next month.'
							: res.status === 401
								? 'Sign in to use Assisted mode.'
								: 'The Assisted service is unavailable right now.';
				} else {
					raw = ((await res.json()) as { answer: string }).answer;
				}
			} catch (err) {
				failed =
					err instanceof OfflineError
						? err.message
						: 'Could not reach the Assisted service — check your connection.';
			}

			const { text: cleaned, citations } = failed
				? { text: failed, citations: [] }
				: resolveCitations(stripThink(raw).trim() || '(empty answer)', selected);

			const messageId = crypto.randomUUID();
			await db.insertMessage({
				id: messageId,
				chatId,
				role: 'assistant',
				content: cleaned,
				mode: 'assisted'
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

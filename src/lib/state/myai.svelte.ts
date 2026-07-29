// My AI mode (spec 007): the user's own OpenAI-compatible endpoint (Ollama,
// LM Studio, vLLM…). The browser talks to it DIRECTLY — no Regeste server in
// the path. Config persists in the local DB settings; the model per chat.

import { t, type MessageKey } from '$lib/i18n/index.svelte';
import { getLocalDb } from '$lib/local-db/client';
import { guardedFetch } from '$lib/net';

export interface MyAiPreset {
	id: string;
	label: string;
	baseUrl: string;
	/** Provider-specific CORS help (A1) — the #1 support wall for browser clients. */
	corsHint: MessageKey;
}

export const MYAI_PRESETS: MyAiPreset[] = [
	{
		id: 'ollama',
		label: 'Ollama',
		baseUrl: 'http://localhost:11434/v1',
		corsHint: 'myai.corsHint.ollama'
	},
	{
		id: 'lmstudio',
		label: 'LM Studio',
		baseUrl: 'http://localhost:1234/v1',
		corsHint: 'myai.corsHint.lmstudio'
	},
	{
		id: 'vllm',
		label: 'vLLM',
		baseUrl: 'http://localhost:8000/v1',
		corsHint: 'myai.corsHint.vllm'
	}
];

export function normalizeBaseUrl(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

/** Host shown as the egress destination (A3), e.g. "localhost:11434". */
export function endpointHost(baseUrl: string): string {
	try {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- throwaway parse, not state
		return new URL(baseUrl).host;
	} catch {
		return baseUrl;
	}
}

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

class MyAiStore {
	baseUrl = $state<string | null>(null);
	apiKey = $state<string | null>(null);
	/** Default model for new chats (a chat keeps its own copy once set). */
	defaultModel = $state<string | null>(null);
	models = $state<string[]>([]);
	testStatus = $state<'idle' | 'testing' | 'ok' | 'error'>('idle');
	testError = $state<string | null>(null);
	generating = $state(false);

	private abort: AbortController | null = null;
	private loaded = false;

	get configured(): boolean {
		return !!this.baseUrl && !!this.defaultModel;
	}

	get host(): string | null {
		return this.baseUrl ? endpointHost(this.baseUrl) : null;
	}

	/** Declare the settings already read, so `init()` never opens the database.
	 * The landing renders the app's own composer inert, and the composer's mode
	 * selector calls `init()` on mount: without this the marketing page would
	 * take the single-owner lock and could lock the real app out of another tab.
	 * `llmStore` gets the same treatment there by being pinned to 'ready'. */
	skipPersistence(): void {
		this.loaded = true;
	}

	async init(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		const { db } = await getLocalDb();
		this.baseUrl = await db.getSetting('myai_base_url');
		this.apiKey = await db.getSetting('myai_api_key');
		this.defaultModel = await db.getSetting('myai_model');
	}

	async saveEndpoint(baseUrl: string, apiKey: string): Promise<void> {
		const normalized = normalizeBaseUrl(baseUrl);
		const changed = normalized !== this.baseUrl;
		this.baseUrl = normalized || null;
		this.apiKey = apiKey.trim() || null;
		if (changed) {
			this.models = [];
			this.testStatus = 'idle';
			this.testError = null;
		}
		const { db } = await getLocalDb();
		await db.setSetting('myai_base_url', this.baseUrl);
		await db.setSetting('myai_api_key', this.apiKey);
	}

	async saveDefaultModel(model: string): Promise<void> {
		this.defaultModel = model;
		const { db } = await getLocalDb();
		await db.setSetting('myai_model', model);
	}

	private headers(): Record<string, string> {
		const h: Record<string, string> = { 'content-type': 'application/json' };
		if (this.apiKey) h.authorization = `Bearer ${this.apiKey}`;
		return h;
	}

	/** A2: GET {base}/models — one fetch, honest errors. */
	async testConnection(): Promise<void> {
		if (!this.baseUrl) return;
		this.testStatus = 'testing';
		this.testError = null;
		try {
			const res = await guardedFetch(`${this.baseUrl}/models`, { headers: this.headers() });
			if (!res.ok) {
				this.testStatus = 'error';
				this.testError =
					res.status === 401 || res.status === 403
						? t('myai.error.key')
						: t('myai.error.status', { status: res.status });
				return;
			}
			const body = (await res.json()) as { data?: Array<{ id?: string }> };
			this.models = (body.data ?? []).map((m) => m.id ?? '').filter(Boolean);
			this.testStatus = 'ok';
			if (this.models.length === 1) await this.saveDefaultModel(this.models[0]);
		} catch {
			this.testStatus = 'error';
			this.testError = t('myai.error.unreachable');
		}
	}

	/**
	 * Stream a chat completion from the user's endpoint. Returns the full raw
	 * text; onDelta receives each content delta. Throws on transport/HTTP errors.
	 */
	async generate(
		model: string,
		messages: ChatMessage[],
		onDelta: (delta: string) => void
	): Promise<string> {
		if (!this.baseUrl) throw new Error('My AI is not configured');
		this.abort = new AbortController();
		this.generating = true;
		try {
			const res = await guardedFetch(`${this.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: this.headers(),
				body: JSON.stringify({ model, messages, stream: true }),
				signal: this.abort.signal
			});
			if (!res.ok || !res.body) {
				throw new Error(`endpoint error ${res.status}`);
			}
			const reader = res.body.getReader();
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
						const delta: string = obj.choices?.[0]?.delta?.content ?? '';
						if (delta) {
							full += delta;
							onDelta(delta);
						}
					} catch {
						// partial JSON split across chunks — next line completes it
					}
				}
			}
			return full;
		} catch (err) {
			if ((err as Error).name === 'AbortError') return '';
			throw err;
		} finally {
			this.generating = false;
			this.abort = null;
		}
	}

	stop(): void {
		this.abort?.abort();
	}
}

export const myaiStore = new MyAiStore();

import { describe, expect, it } from 'vitest';
import {
	generateWithContextFit,
	isContextOverflowError,
	shrinkEvidenceStep,
	type ContextFitState
} from './context-fit';
import type { SearchHit } from '$lib/types';

const hit = (chunkId: number): SearchHit => ({
	chunkId,
	documentId: 'doc',
	documentName: 'doc.pdf',
	text: `chunk ${chunkId}`,
	page: 1,
	headingPath: null,
	score: 1
});

// The two engine messages observed live (2026-07-23, friends' session).
const MLC_ERROR = new Error(
	'Prompt tokens exceed context window size: number of prompt tokens: 4166; context window size: 4096\nConsider shortening the prompt, or increase `context_window_size`, or using sliding window via `sliding_window_size`.'
);
const WLLAMA_ERROR = new Error(
	'request (4813 tokens) exceeds the available context size (4096 tokens), try increasing it'
);

describe('isContextOverflowError', () => {
	it('recognizes both engines and nothing else', () => {
		expect(isContextOverflowError(MLC_ERROR)).toBe(true);
		expect(isContextOverflowError(WLLAMA_ERROR)).toBe(true);
		expect(
			isContextOverflowError({ code: 400, type: 'exceed_context_size_error', message: '…' })
		).toBe(true);
		expect(isContextOverflowError(new Error('Failed to fetch'))).toBe(false);
		expect(isContextOverflowError(new Error('WebGPU device lost'))).toBe(false);
	});
});

describe('shrinkEvidenceStep', () => {
	it('drops a fifth of the tail, then the conversation context, then gives up', () => {
		let state: ContextFitState | null = {
			hits: Array.from({ length: 16 }, (_, index) => hit(index + 1)),
			conversationContext: 'previous turns'
		};
		state = shrinkEvidenceStep(state);
		expect(state!.hits.map((item) => item.chunkId)).toEqual(
			Array.from({ length: 12 }, (_, index) => index + 1)
		);
		expect(state!.conversationContext).toBe('previous turns');
		while (state!.hits.length > 1) state = shrinkEvidenceStep(state!);
		expect(state!.conversationContext).toBe('previous turns');
		state = shrinkEvidenceStep(state!);
		expect(state!.hits).toHaveLength(1);
		expect(state!.conversationContext).toBeNull();
		expect(shrinkEvidenceStep(state!)).toBeNull();
	});
});

describe('generateWithContextFit', () => {
	it('replays with shrunken evidence until the engine accepts', async () => {
		const attempts: number[] = [];
		const result = await generateWithContextFit(
			{
				hits: Array.from({ length: 16 }, (_, index) => hit(index + 1)),
				conversationContext: 'ctx'
			},
			async (state) => {
				attempts.push(state.hits.length);
				if (state.hits.length > 10) throw WLLAMA_ERROR;
				return 'answer [1]';
			}
		);
		expect(attempts).toEqual([16, 12, 9]);
		expect(result.text).toBe('answer [1]');
		expect(result.state.hits).toHaveLength(9);
		expect(result.state.conversationContext).toBe('ctx');
	});

	it('propagates non-overflow errors untouched and surfaces overflow when nothing shrinks', async () => {
		await expect(
			generateWithContextFit({ hits: [hit(1)], conversationContext: null }, async () => {
				throw new Error('Failed to fetch');
			})
		).rejects.toThrow('Failed to fetch');
		await expect(
			generateWithContextFit({ hits: [hit(1)], conversationContext: null }, async () => {
				throw MLC_ERROR;
			})
		).rejects.toThrow('context window size');
	});
});

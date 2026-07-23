// Reactive context-window fit. fitEvidenceToContext estimates tokens at
// chars/3 — right for French prose (~3.2 chars/token), measurably wrong for
// number- and table-dense documents (~2.4-2.8 observed live: 4166 and 4813
// real tokens where the clamp estimated ≤3900), and helpless when a long
// conversation context inflates the prompt outside the part it trims. The
// engine is the only exact tokenizer we have, so its overflow error becomes
// the oracle: shrink the prompt and replay. Shrinking only ever drops TAIL
// excerpts (then the conversation context), so the surviving excerpts keep
// their numbers and every citation the model can emit still resolves against
// the original list's prefix.
import type { SearchHit } from '$lib/types';

/** Both engines' context-overflow failures, and nothing else. WebLLM/MLC:
 * "Prompt tokens exceed context window size"; wllama/llama.cpp: "request (…)
 * exceeds the available context size" with type exceed_context_size_error. */
export function isContextOverflowError(err: unknown): boolean {
	const message =
		err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err ?? '');
	return /exceed[s]?[ _](?:the available )?context|context window size|exceed_context_size/iu.test(
		message
	);
}

export interface ContextFitState {
	hits: SearchHit[];
	conversationContext: string | null;
}

/** One shrink step: drop the lowest-ranked fifth of the excerpts (at least
 * one); once a single excerpt remains, drop the conversation context; after
 * that there is nothing left to give up and the caller must surface the
 * error. */
export function shrinkEvidenceStep(state: ContextFitState): ContextFitState | null {
	if (state.hits.length > 1) {
		const dropped = Math.max(1, Math.ceil(state.hits.length * 0.2));
		return {
			hits: state.hits.slice(0, state.hits.length - dropped),
			conversationContext: state.conversationContext
		};
	}
	if (state.conversationContext !== null) {
		return { hits: state.hits, conversationContext: null };
	}
	return null;
}

/** Run a generation, shrinking the prompt on engine context-overflow errors
 * until it fits or nothing shrinkable remains. Returns the text AND the state
 * that produced it, so callers can align citations and records on the list
 * the model actually saw. Any non-overflow error propagates untouched. */
export async function generateWithContextFit(
	initial: ContextFitState,
	generate: (state: ContextFitState) => Promise<string>,
	onShrink?: (state: ContextFitState) => void
): Promise<{ text: string; state: ContextFitState }> {
	let state = initial;
	for (;;) {
		try {
			return { text: await generate(state), state };
		} catch (err) {
			if (!isContextOverflowError(err)) throw err;
			const shrunk = shrinkEvidenceStep(state);
			if (!shrunk) throw err;
			state = shrunk;
			onShrink?.(state);
		}
	}
}

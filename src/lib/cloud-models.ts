// The models the Cloud mode offers, and what each one costs to run.
//
// Prices are Cloudflare's published Workers AI rates, converted to neurons,
// which is the unit the account is actually billed and rate-limited in:
// $0.011 buys 1,000 neurons, and the free allocation is 10,000 neurons a day.
// Keeping the rates here rather than in the endpoint is what lets the picker
// tell someone what a model costs them before they choose it.
//
// Deliberately absent: llama-3.3-70b, which this endpoint used until now. At
// $2.253 per million output tokens it is the most expensive output in the
// catalogue, three times gpt-oss-120b, a larger model. It was picked in spec
// 005 to escape a reasoning model that took two minutes per answer, never
// because it won on quality, so there is nothing to defend by keeping it.

/** Cloudflare bills $0.011 per 1,000 neurons. */
export const NEURONS_PER_DOLLAR = 1000 / 0.011;

export interface CloudModel {
	id: string;
	/** Stable key used in the API contract and the local setting. */
	key: 'balanced' | 'best';
	/** What the model is actually called, shown beside the tier name. The tier
	 * says what to expect; this says what is running, so nobody has to take
	 * "Standard" on faith. Short form: the full id is a path, not a name. */
	name: string;
	neuronsPerMInput: number;
	neuronsPerMOutput: number;
}

// Measured on 20 benchmark cases with retrieval held identical, so the only
// variable is the answer (compare-cloud-models.ts):
//
//   qwen3-30b-a3b   19/20   2924 ms   21 neurons
//   gemma-4-26b     19/20   5209 ms   33 neurons
//   gpt-oss-120b    20/20   1412 ms   89 neurons
//
// Gemma-4 was the intended default and is gone: it ties qwen3 on score while
// being 1.8x slower and 1.6x dearer, which is dominated on every axis. Nothing
// defends a middle rung that loses to the cheap one.
//
// The surprise is gpt-oss-120b being the fastest of the three as well as the
// most accurate, so the two on offer are not a speed trade at all. They are a
// price trade: the same daily budget buys about 140 answers on one and 33 on
// the other. One set of twenty cases cannot separate 19 from 20, so the copy
// claims no accuracy difference either.
export const CLOUD_MODELS: CloudModel[] = [
	{
		// 30B mixture of experts, ~3B active. The default: it answered 19 of 20
		// and costs a quarter of the alternative.
		id: '@cf/qwen/qwen3-30b-a3b-fp8',
		name: 'Qwen3 30B',
		key: 'balanced',
		neuronsPerMInput: 4625,
		neuronsPerMOutput: 30475
	},
	{
		// The 120B class. Fastest and highest scoring of the three measured, for
		// four times the cost per answer.
		id: '@cf/openai/gpt-oss-120b',
		name: 'GPT-OSS 120B',
		key: 'best',
		neuronsPerMInput: 31818,
		neuronsPerMOutput: 68182
	}
];

export type CloudModelKey = CloudModel['key'];

export const DEFAULT_MODEL_KEY: CloudModelKey = 'balanced';

export function modelFor(key: string | null | undefined): CloudModel {
	return CLOUD_MODELS.find((m) => m.key === key) ?? CLOUD_MODELS[0];
}

/**
 * What one answer costs, in neurons.
 *
 * The shape of a grounded answer here is stable enough to price: the prompt is
 * the excerpts the retriever selected, and the answer is a few sentences with
 * citations. Measured across the benchmark corpus, that lands near 2,000 input
 * and 300 output tokens, which is what the picker's estimate is built on.
 */
export const TYPICAL_INPUT_TOKENS = 2000;
export const TYPICAL_OUTPUT_TOKENS = 300;

export function neuronsFor(model: CloudModel, inputTokens: number, outputTokens: number): number {
	return Math.ceil(
		(inputTokens * model.neuronsPerMInput) / 1_000_000 +
			(outputTokens * model.neuronsPerMOutput) / 1_000_000
	);
}

/** Neurons one typical answer costs on this model. */
export function typicalCost(model: CloudModel): number {
	return neuronsFor(model, TYPICAL_INPUT_TOKENS, TYPICAL_OUTPUT_TOKENS);
}

/**
 * Roughly how many more answers a budget buys on this model.
 *
 * Answers rather than credits or cents: a made-up currency has to be learned,
 * and a euro figure on a five-cent operation reads as noise. "About 40 left
 * today" is the fact someone actually wants, and it moves when they pick a
 * cheaper model, which is exactly the trade the picker is offering.
 */
export function answersLeft(remainingNeurons: number, model: CloudModel): number {
	return Math.max(0, Math.floor(remainingNeurons / typicalCost(model)));
}

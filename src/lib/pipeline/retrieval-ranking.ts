import type { QuestionRoute, SearchHit } from '$lib/types';
import {
	expandChannelCandidatesWithNeighbors,
	isNumericAnswerQuestion,
	refineCandidates,
	selectWithNeighbors
} from './retrieval';

export interface InitialRankingInput {
	query: string;
	route: QuestionRoute;
	semantic: SearchHit[];
	lexical: SearchHit[];
	fuzzy: SearchHit[];
	neighbors: SearchHit[];
}

export interface RankedChannels {
	semantic: SearchHit[];
	lexical: SearchHit[];
	fuzzy: SearchHit[];
}

export interface FusionRankingInput extends InitialRankingInput {
	neighbors: SearchHit[];
}

export interface FusionRankingOutput extends RankedChannels {
	coarseRanked: SearchHit[];
}

export interface FinalRankingInput {
	query: string;
	route: QuestionRoute;
	ranked: SearchHit[];
	neighbors: SearchHit[];
	/** How many passages to pack. Defaults to what goes straight to the model.
	 * A reranking turn asks for more, because a cross-encoder can only reorder
	 * what it is handed: measured on a fee agreement, a pool of ten carried no
	 * passage stating a fee at all, where twenty carried three. */
	limit?: number;
}

/** Pure CPU stages used both directly in tests and from the ranking workers. */
export function rankInitialChannels(input: InitialRankingInput): RankedChannels {
	const expand = (hits: SearchHit[]) =>
		expandChannelCandidatesWithNeighbors(hits, input.neighbors, input.query);
	return {
		semantic: refineCandidates(expand(input.semantic), [], input.query, 48, [], input.route),
		lexical: refineCandidates([], expand(input.lexical), input.query, 48, [], input.route),
		fuzzy: refineCandidates([], [], input.query, 48, expand(input.fuzzy), input.route)
	};
}

export function packAndFuseChannels(input: FusionRankingInput): FusionRankingOutput {
	const semantic = selectWithNeighbors(
		input.semantic,
		input.neighbors,
		input.query,
		10,
		input.route
	);
	const lexical = selectWithNeighbors(input.lexical, input.neighbors, input.query, 10, input.route);
	const fuzzy = selectWithNeighbors(input.fuzzy, input.neighbors, input.query, 10, input.route);
	const candidateLimit =
		input.route === 'synthesis' || isNumericAnswerQuestion(input.query) ? 48 : 24;
	return {
		semantic,
		lexical,
		fuzzy,
		coarseRanked: refineCandidates(
			semantic,
			lexical,
			input.query,
			candidateLimit,
			fuzzy,
			input.route
		)
	};
}

export function packFinalEvidence(input: FinalRankingInput): SearchHit[] {
	return selectWithNeighbors(
		input.ranked,
		input.neighbors,
		input.query,
		input.limit ?? 16,
		input.route
	);
}

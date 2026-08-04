// Compatibility exports. Query understanding lives in one typed NLU module.
export {
	analyzeQuestion,
	normalizeQuestion,
	questionReferenceKind,
	questionLocale,
	routeQuestion,
	type AggregateOperation,
	type SemanticFrame,
	type TemporalScope
} from '$lib/nlu/semantic-frame';

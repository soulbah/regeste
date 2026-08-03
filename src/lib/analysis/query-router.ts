// Compatibility exports. Query understanding lives in one typed NLU module.
export {
	analyzeQuestion,
	normalizeQuestion,
	parseTemporalScope,
	questionReferenceKind,
	questionLocale,
	routeQuestion,
	type AggregateOperation,
	type FinancialRole,
	type QuestionAnalysis,
	type ReferenceKind,
	type SemanticFrame,
	type TemporalScope
} from '$lib/nlu/semantic-frame';

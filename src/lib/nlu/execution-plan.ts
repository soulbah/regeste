import type { QuestionRoute } from '$lib/types';
import { normalizeQuestion, type SemanticFrame } from './semantic-frame';

type ExecutionStepKind =
	| 'retrieve-focused'
	| 'retrieve-diverse'
	| 'retrieve-exhaustive'
	| 'filter-scope'
	| 'compare'
	| 'verify-conflicts'
	| 'aggregate'
	| 'list-exhaustive'
	| 'verify-absence'
	| 'answer';

interface ExecutionStep {
	kind: ExecutionStepKind;
	required: boolean;
}

export interface ExecutionPlan {
	version: 1;
	route: QuestionRoute;
	steps: ExecutionStep[];
	exhaustive: boolean;
	clarification: SemanticFrame['clarification'];
}

export function buildExecutionPlan(question: string, frame: SemanticFrame): ExecutionPlan {
	const normalized = normalizeQuestion(question);
	const conflictRequested =
		/\b(?:contradiction|contradictions|conflit|conflits|divergence|conflict|conflicts|disagree)\b/.test(
			normalized
		);
	const absenceRequested =
		/\b(?:absent|absence|aucun|introuvable|non mentionne|not mentioned|missing|no evidence)\b/.test(
			normalized
		);
	const compareRequested =
		conflictRequested ||
		/\b(?:compare|comparaison|difference|differences|versus|vs)\b/.test(normalized);
	const steps: ExecutionStep[] = [];
	if (frame.route === 'aggregate') steps.push({ kind: 'retrieve-exhaustive', required: true });
	else if (frame.route === 'synthesis') steps.push({ kind: 'retrieve-diverse', required: true });
	else steps.push({ kind: 'retrieve-focused', required: true });
	if (
		frame.scope.kind !== 'unspecified' ||
		frame.temporal ||
		frame.moneyRole ||
		frame.identifiers.length
	)
		steps.push({ kind: 'filter-scope', required: true });
	if (compareRequested) steps.push({ kind: 'compare', required: true });
	if (conflictRequested) steps.push({ kind: 'verify-conflicts', required: true });
	if (frame.route === 'aggregate')
		steps.push({
			kind: frame.operation === 'list' ? 'list-exhaustive' : 'aggregate',
			required: true
		});
	if (absenceRequested) steps.push({ kind: 'verify-absence', required: true });
	steps.push({ kind: 'answer', required: true });
	return {
		version: 1,
		route: frame.route,
		steps,
		exhaustive: frame.exhaustive || frame.route === 'aggregate',
		clarification: frame.clarification
	};
}

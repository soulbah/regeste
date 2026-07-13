import { normalizeQuestion, type ClarificationKind, type SemanticFrame } from './semantic-frame';

export interface ClarificationContext {
	hasConversationContext: boolean;
	documentCount: number;
}

export function contextualClarification(
	question: string,
	frame: SemanticFrame,
	context: ClarificationContext
): ClarificationKind | null {
	if (frame.clarification) return frame.clarification;
	const normalized = normalizeQuestion(question);
	if (frame.referencesPrevious && !context.hasConversationContext) return 'entity';
	if (
		!frame.temporal &&
		/\b(?:recemment|dernier mois|derniere periode|recently|latest period|last period)\b/.test(
			normalized
		)
	)
		return 'time';
	if (
		context.documentCount > 1 &&
		/\b(?:derniere version|dernier document|version la plus recente|latest version|latest document)\b/.test(
			normalized
		)
	)
		return 'document';
	if (
		/\b(?:convertis|convertir|conversion|convert|single currency|devise unique)\b/.test(
			normalized
		) &&
		!/\b(?:eur|usd|gbp|chf|gnf|euro|euros|dollar|dollars)\b/.test(normalized)
	)
		return 'unit_currency';
	if ((question.match(/\?/g)?.length ?? 0) > 1) return 'multi_part';
	return null;
}

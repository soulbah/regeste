import { normalizeQuestion, type ClarificationKind, type SemanticFrame } from './semantic-frame';

export interface ClarificationContext {
	hasConversationContext: boolean;
	documentCount: number;
}

// "cette fiche de paie", "ce contrat": the noun names the referent (usually the
// attached document), so there is nothing to clarify. Only bare back-references
// ("Et lui ?", "ce dernier") leave the entity genuinely unresolved.
const DEMONSTRATIVE_WITH_NOUN =
	/\b(?:ce|cet|cette|ces|this|that|these|those)\s+(?!derni|latter)\p{L}{3,}/u;

/** Does the question name a specific thing, rather than only an operation?
 *  Capitalised tokens away from the opening word: RAPO, TA, Sécuriplus, Nantes. */
function namesItsSubject(question: string): boolean {
	const tokens = question.split(/\s+/u).filter(Boolean);
	return tokens
		.slice(1)
		.some((token) => /^[\p{Lu}][\p{Lu}\p{Ll}'’-]{1,}$/u.test(token.replace(/[^\p{L}'’-]/gu, '')));
}

export function contextualClarification(
	question: string,
	frame: SemanticFrame,
	context: ClarificationContext
): ClarificationKind | null {
	// "One record or all selected documents?" has exactly one answer when a
	// single document is attached — asking it reads as a bug, not caution.
	if (frame.clarification === 'scope' && context.documentCount <= 1) return null;
	// It also has an answer when the question already named what to add up.
	// "Quel est le montant total ?" genuinely does not say over what; "le
	// montant total du RAPO, du TA et du référé" says it three times, and asking
	// anyway spends a turn to be told what was already written. A named thing
	// shows up as a capitalised token that is not the first word of the
	// sentence — an acronym, a product, a party — which needs no vocabulary of
	// its own to recognise.
	if (frame.clarification === 'scope' && namesItsSubject(question)) return null;
	if (frame.clarification) return frame.clarification;
	const normalized = normalizeQuestion(question);
	if (
		frame.referencesPrevious &&
		!context.hasConversationContext &&
		!DEMONSTRATIVE_WITH_NOUN.test(normalized)
	)
		return 'entity';
	if ((question.match(/\?/g)?.length ?? 0) > 1) return 'multi_part';
	return null;
}

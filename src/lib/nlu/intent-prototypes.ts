/**
 * What a question asks, decided by similarity to labelled examples.
 *
 * Replaces the hand-written vocabularies this file's callers used to carry (see
 * `.claude/rules/nlp.md`). A word list is a classifier with a hand-written
 * weight vector: unfalsifiable, monolingual in practice, and silently brittle —
 * `requestedNumericKinds` matched `coûte` and not `coute`, so one missing
 * circumflex disabled a whole correction and no test could have found it.
 *
 * The mechanism is nearest-example cosine, not a centroid: a class like
 * `moment` covers "quand expire" and "à quelle date", which sit in different
 * places, and averaging them lands between the two where neither question is.
 *
 * Cost is a dot product per example. The question is already encoded for
 * retrieval and cached, and the examples are encoded once per session, so
 * classifying costs no forward pass at all.
 */

export type Intent =
	| 'amount'
	| 'moment'
	| 'duration'
	| 'count'
	| 'person'
	| 'contact'
	| 'conflict'
	| 'absence'
	| 'comparison';

/**
 * Four to eight examples per class, in both languages the product speaks.
 *
 * More than eight is a smell: a class that needs twenty examples is two
 * classes. They are written as questions a user would actually type, including
 * the shapes that defeat a keyword — an implicit amount ("quel est le tarif"),
 * a possessive ("mon solde"), an English speaker's phrasing.
 */
export const INTENT_EXAMPLES: Record<Intent, readonly string[]> = {
	amount: [
		'Combien coûte un recours ?',
		'Quel est le montant des honoraires ?',
		'Quels sont les frais de dossier ?',
		'À combien revient la cotisation mensuelle ?',
		'Quelle est la cotisation annuelle ?',
		'How much is the deductible?',
		'What is the total price?'
	],
	moment: [
		'Quand expire le contrat ?',
		"Quelle est la date d'effet ?",
		'À quelle date dois-je répondre ?',
		'À quelle heure ouvre le guichet ?',
		'Quel jour la garantie commence-t-elle ?',
		'When does the policy start?',
		'What is the deadline date?'
	],
	duration: [
		'Quelle est la durée du contrat ?',
		'Quel est le délai de rétractation ?',
		'Pendant combien de mois suis-je couvert ?',
		'Quel préavis dois-je respecter ?',
		'How long is the warranty?',
		'What is the notice period?'
	],
	count: [
		'Combien de sinistres puis-je déclarer ?',
		'Combien de documents ai-je envoyés ?',
		"Quel est le nombre d'échéances ?",
		'Combien de personnes sont assurées ?',
		'How many claims are covered?',
		'What is the number of installments?'
	],
	person: [
		'Qui est le responsable du dossier ?',
		'Qui a signé ce document ?',
		"Comment s'appelle mon conseiller ?",
		'Quel est le nom du souscripteur ?',
		'Qui est le représentant légal de la société ?',
		'Who signed this contract?',
		'Who is the account holder?'
	],
	contact: [
		'Quel est le numéro de téléphone du service client ?',
		'À quelle adresse email dois-je écrire ?',
		'Comment puis-je les joindre ?',
		'Quelles sont mes coordonnées bancaires ?',
		'What is the contact phone number?',
		'Where do I send my letter?'
	],
	conflict: [
		'Y a-t-il une contradiction entre ces documents ?',
		'Les deux contrats se contredisent-ils ?',
		'Quelles divergences existent entre les versions ?',
		'Do these documents disagree?',
		'Is there a conflict between the two clauses?'
	],
	absence: [
		'Que manque-t-il dans ce dossier ?',
		'Quelles pièces ne sont pas fournies ?',
		"Qu'est-ce qui n'est pas mentionné ?",
		'What is missing from this file?',
		'Which documents are absent?'
	],
	comparison: [
		'Quelle est la différence entre les deux offres ?',
		'Compare les deux contrats',
		'Quelle formule est la plus avantageuse ?',
		'What is the difference between these plans?',
		'Compare the two quotes'
	]
};

export const INTENTS = Object.keys(INTENT_EXAMPLES) as Intent[];

/** Every example, in a stable order, so a caller can encode them as one batch
 *  and hand the vectors back in the same order. */
export function intentExampleTexts(): string[] {
	return INTENTS.flatMap((intent) => [...INTENT_EXAMPLES[intent]]);
}

export interface IntentPrototypes {
	/** One row per text of `intentExampleTexts()`, L2-normalized. */
	readonly vectors: Float32Array;
	readonly dims: number;
}

export interface IntentVerdict {
	readonly intent: Intent;
	/** Cosine to the nearest example of the winning class. */
	readonly score: number;
	/** How far ahead of the runner-up class it is. */
	readonly margin: number;
}

/**
 * A question is only classified when it is close to an example AND clearly
 * closer than to any other class.
 *
 * Both gates matter and they fail differently. Without the floor, every
 * question gets a class, including "résume ce document"; without the margin,
 * "combien de temps ai-je pour payer" lands on whichever of duration and moment
 * happens to win by a thousandth. Falling through to null is the correct answer
 * for a question none of these classes describes, and callers must treat it as
 * "no intent" rather than as a default.
 *
 * Calibrated on the harvested question set, not on a single document.
 */
export const INTENT_SCORE_FLOOR = 0.62;
export const INTENT_MARGIN = 0.02;

function cosine(a: Float32Array, aOffset: number, b: Float32Array, bOffset: number, dims: number) {
	let dot = 0;
	for (let i = 0; i < dims; i++) dot += a[aOffset + i] * b[bOffset + i];
	return dot;
}

/** Nearest-example cosine per class, then the two gates. Vectors must already
 *  be L2-normalized, which is what the embed worker returns. */
export function classifyIntent(
	query: Float32Array,
	prototypes: IntentPrototypes,
	options: { floor?: number; margin?: number } = {}
): IntentVerdict | null {
	const { dims, vectors } = prototypes;
	if (query.length !== dims) throw new Error('Query and prototype dimensions differ');
	const floor = options.floor ?? INTENT_SCORE_FLOOR;
	const margin = options.margin ?? INTENT_MARGIN;

	const best = new Map<Intent, number>();
	let row = 0;
	for (const intent of INTENTS) {
		let top = -1;
		for (let i = 0; i < INTENT_EXAMPLES[intent].length; i++, row++) {
			const score = cosine(query, 0, vectors, row * dims, dims);
			if (score > top) top = score;
		}
		best.set(intent, top);
	}

	const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
	const [winner, score] = ranked[0];
	const runnerUp = ranked[1]?.[1] ?? -1;
	if (score < floor || score - runnerUp < margin) return null;
	return { intent: winner, score, margin: score - runnerUp };
}

/**
 * Does the prototype classifier match what the shipped word lists decide, and
 * does it hold where they break?
 *
 * Spec 033 gate for T3. Runs the real embedding model in node — the same
 * `multilingual-e5-small` the wasm tier loads in the browser — so the numbers
 * are the ones the app will see, not a proxy.
 *
 * Usage: bun scripts/intent-calibration.ts
 */
import { pipeline } from '@huggingface/transformers';
import {
	INTENTS,
	INTENT_EXAMPLES,
	classifyIntent,
	intentExampleTexts,
	type Intent,
	type IntentPrototypes
} from '../src/lib/nlu/intent-prototypes';
import { E5_EMBEDDING_MODEL } from '../src/lib/pipeline/embed-model';

/** The questions the shipped regexes were written against, harvested from the
 *  test suites, with the class a reader assigns them. Only questions whose
 *  class is unambiguous to a human are labelled; the rest are `null` and check
 *  that the classifier abstains rather than guessing. */
const LABELLED: ReadonlyArray<readonly [string, Intent | null]> = [
	// amount — including the shapes that defeat a keyword
	['Combien coûte un RAPO ?', 'amount'],
	['Combien coute un rapo ?', 'amount'],
	["Combien coûte l'assurance ?", 'amount'],
	['Quel est le montant du RAPO ?', 'amount'],
	['Quels sont les honoraires pour un RAPO ?', 'amount'],
	['Quel est mon solde ?', 'amount'],
	["C cbien l'assurance par mois ?", 'amount'],
	['C cbien la cotizasion menssuelle exacte ?', 'amount'],
	['Combien coûte cette acquisition ?', 'amount'],
	['Quel est le plafond de remboursement ?', 'amount'],
	['How much is the monthly premium?', 'amount'],
	// moment
	["Quelle est la date d'effet du contrat ?", 'moment'],
	['Quand expire la garantie ?', 'moment'],
	['À quelle heure ferme le guichet ?', 'moment'],
	['Quel jour dois-je payer ?', 'moment'],
	['When does the contract end?', 'moment'],
	// duration
	['Combien de temps dure la garantie ?', 'duration'],
	['Combien de temps les données sont-elles conservées ?', 'duration'],
	['Combien de temps la réparation est-elle garantie ?', 'duration'],
	['Quel est le délai de recours ?', 'duration'],
	['Combien de jours a-t-il pour répondre ?', 'duration'],
	['How long is the cooling-off period?', 'duration'],
	// count
	['Combien de réparations sont garanties ?', 'count'],
	['Combien de documents sont joints ?', 'count'],
	['How many claims can I file?', 'count'],
	// person
	["Qui est le directeur d'agence ?", 'person'],
	["Qui est le directeur d'agence du Banque Populaire ?", 'person'],
	["Quel est mon directeur d'agence ?", 'person'],
	["Comment s'appelle le directeur d'agence ?", 'person'],
	['Qui a signé cette attestation ?', 'person'],
	['Who is the claims manager?', 'person'],
	// contact
	['Quel est le numéro de téléphone de mon agence ?', 'contact'],
	["Quelle est l'adresse email du service client ?", 'contact'],
	['Quel est mon IBAN ?', 'contact'],
	// conflict / absence / comparison
	['Y a-t-il des contradictions entre les deux contrats ?', 'conflict'],
	['Que manque-t-il dans le dossier ?', 'absence'],
	['Quelle est la différence entre les deux formules ?', 'comparison'],
	// none of the above: the classifier must abstain, not pick the nearest
	['Résume ce document', null],
	['De quoi parle ce document ?', null],
	['Traduis ce paragraphe en anglais', null],
	['Explique-moi la clause 4.1', null]
];

/** The shipped word lists, copied verbatim from the modules they live in, so
 *  the comparison is against what actually runs today. */
const REGEX_BASELINE: Partial<Record<Intent, RegExp>> = {
	amount:
		/\b(?:combien|cout\w*|coût\w*|prix|montant|tarif\w*|honoraires?|frais|how\s+much|cost|price|fee)\b/iu,
	moment: /\b(?:date|jour exact|calendar date|heure|horaire|time|quand|when)\b/iu,
	duration: /\b(?:combien de temps|delai|délai|preavis|préavis|how long|duration|deadline)\b/iu,
	count: /\b(?:combien de|nombre|how many|number of)\b/iu,
	person: /\b(?:qui\s+(?:est|sont|a)|who\s+(?:is|are|signed)|nom|name)\b/iu,
	contact: /\b(?:numero|numéro|telephone|téléphone|phone|mobile|email|courriel|iban|bic)\b/iu
};

function regexVerdict(question: string): Intent | null {
	// First match wins, which is exactly the ordering bug these lists have in
	// production: "combien de temps" matches `amount` before `duration`.
	for (const intent of INTENTS) {
		const pattern = REGEX_BASELINE[intent];
		if (pattern?.test(question)) return intent;
	}
	return null;
}

function l2(row: Float32Array): Float32Array {
	let sum = 0;
	for (const value of row) sum += value * value;
	const norm = Math.sqrt(sum) || 1;
	const out = new Float32Array(row.length);
	for (let i = 0; i < row.length; i++) out[i] = row[i] / norm;
	return out;
}

async function main() {
	// A prototype that is also a test question scores 1.0 for free, and the
	// measurement stops meaning anything. Six had slipped in on the first draft,
	// so this is asserted rather than remembered.
	const contaminated = Object.values(INTENT_EXAMPLES)
		.flat()
		.filter((example) => LABELLED.some(([question]) => question === example));
	if (contaminated.length)
		throw new Error(`Prototypes appear in the test set: ${contaminated.join(' | ')}`);

	const extractor = await pipeline('feature-extraction', E5_EMBEDDING_MODEL, { dtype: 'fp32' });

	// e5 wants its asymmetric prefixes; questions and examples are both queries.
	const encode = async (texts: string[]): Promise<Float32Array[]> => {
		const output = await extractor(
			texts.map((text) => `query: ${text}`),
			{ pooling: 'mean', normalize: true }
		);
		const dims = output.dims[1] as number;
		const flat = output.data as Float32Array;
		return texts.map((_, index) => l2(flat.slice(index * dims, (index + 1) * dims)));
	};

	const exampleTexts = intentExampleTexts();
	const rawExamples = await encode(exampleTexts);
	const dims = rawExamples[0].length;

	// Every short French question points in nearly the same direction under a
	// retrieval encoder: e5 is trained to match a query to a PASSAGE, not to
	// another query, so the shared "interrogative sentence" component dominates
	// and cosines compress into 0.83–0.99 where they carry no signal. Removing
	// the mean direction is the standard fix for an anisotropic space, and it is
	// free: one vector, computed once with the prototypes.
	const centroid = new Float32Array(dims);
	for (const vector of rawExamples) for (let i = 0; i < dims; i++) centroid[i] += vector[i];
	for (let i = 0; i < dims; i++) centroid[i] /= rawExamples.length;
	const centred = (vector: Float32Array): Float32Array => {
		const out = new Float32Array(dims);
		for (let i = 0; i < dims; i++) out[i] = vector[i] - centroid[i];
		return l2(out);
	};

	const exampleVectors = rawExamples.map(centred);
	const packed = new Float32Array(exampleVectors.length * dims);
	exampleVectors.forEach((vector, index) => packed.set(vector, index * dims));
	const prototypes: IntentPrototypes = { vectors: packed, dims };

	const questions = LABELLED.map(([question]) => question);
	const questionVectors = (await encode(questions)).map(centred);

	let protoRight = 0;
	let regexRight = 0;
	const failures: string[] = [];

	LABELLED.forEach(([question, expected], index) => {
		const proto = classifyIntent(questionVectors[index], prototypes)?.intent ?? null;
		const regex = regexVerdict(question);
		if (proto === expected) protoRight++;
		if (regex === expected) regexRight++;
		if (proto !== expected)
			failures.push(`  proto  ${question}\n         expected ${expected} got ${proto}`);
		if (regex !== expected && proto === expected)
			failures.push(`  REGEX  ${question}\n         expected ${expected} got ${regex}`);
	});

	const total = LABELLED.length;
	console.log(`\nmodel      ${E5_EMBEDDING_MODEL} (${dims}d)`);
	console.log(`examples   ${exampleTexts.length} across ${INTENTS.length} classes`);
	console.log(`\nprototype  ${protoRight}/${total}`);
	console.log(`word list  ${regexRight}/${total}`);
	if (failures.length) console.log(`\ndisagreements\n${failures.join('\n')}`);

	// The motivating defect: one missing circumflex must not change the answer.
	const [withAccent, withoutAccent] = await encode([
		'Combien coûte un RAPO ?',
		'Combien coute un rapo ?'
	]);
	const a = classifyIntent(withAccent, prototypes);
	const b = classifyIntent(withoutAccent, prototypes);
	console.log(
		`\naccent pair  "coûte" -> ${a?.intent ?? 'null'} (${a?.score.toFixed(3)})  "coute" -> ${b?.intent ?? 'null'} (${b?.score.toFixed(3)})`
	);

	// Where the floor and margin sit relative to the data, so the constants can
	// be moved on evidence rather than on taste.
	const scores = LABELLED.map(([, expected], index) => ({
		expected,
		verdict: classifyIntent(questionVectors[index], prototypes, { floor: -1, margin: -1 })
	}));
	const labelled = scores.filter((s) => s.expected !== null);
	const unlabelled = scores.filter((s) => s.expected === null);
	const lowestCorrect = Math.min(
		...labelled.filter((s) => s.verdict?.intent === s.expected).map((s) => s.verdict!.score)
	);
	const highestAbstain = Math.max(...unlabelled.map((s) => s.verdict!.score));
	console.log(
		`\nfloor window  lowest correct ${lowestCorrect.toFixed(3)} | highest must-abstain ${highestAbstain.toFixed(3)}`
	);

	// The ceiling of the method, found rather than assumed: if the best gate pair
	// cannot beat the word lists, the mechanism is wrong and no amount of
	// example-writing rescues it.
	let bestPair = { floor: 0, margin: 0, right: -1 };
	for (let floor = 0; floor <= 0.5; floor += 0.01) {
		for (let margin = 0; margin <= 0.2; margin += 0.005) {
			let right = 0;
			LABELLED.forEach(([, expected], index) => {
				const verdict = classifyIntent(questionVectors[index], prototypes, { floor, margin });
				if ((verdict?.intent ?? null) === expected) right++;
			});
			if (right > bestPair.right) bestPair = { floor, margin, right };
		}
	}
	console.log(
		`\nbest achievable  ${bestPair.right}/${total} at floor ${bestPair.floor.toFixed(2)} margin ${bestPair.margin.toFixed(3)}`
	);

	console.log('\nraw top-2 per question (no gates)');
	LABELLED.forEach(([question, expected], index) => {
		const v = classifyIntent(questionVectors[index], prototypes, { floor: -1, margin: -1 })!;
		const hit = v.intent === expected ? ' ' : '×';
		console.log(
			`${hit} ${v.score.toFixed(3)} m=${v.margin.toFixed(3)}  ${String(expected)} -> ${v.intent}  ${question}`
		);
	});
}

void main();

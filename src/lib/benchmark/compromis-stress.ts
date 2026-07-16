import { hasAnswerBearingEvidence } from '$lib/pipeline/relevance';
import {
	buildUserPrompt,
	resolveTargetedCitations,
	stripThink,
	SYSTEM_PROMPT
} from '$lib/private-ai/prompt';
import { normalizeForFuzzy } from '$lib/pipeline/fuzzy';
import type { SearchHit } from '$lib/types';

export interface MartinStressCase {
	id: string;
	question: string;
	answerable: boolean;
	/** Every group needs at least one retrieved page. */
	pageGroups: number[][];
}

/** Visual ground truth from all 26 rendered pages. No production behavior may
 * depend on this corpus; it is an adversarial contract fixture only. */
export const MARTIN_STRESS_CASES: readonly MartinStressCase[] = [
	{
		id: 'seller-identity',
		question: 'Qui sont les vendeurs ?',
		answerable: true,
		pageGroups: [[1]]
	},
	{ id: 'buyer-identity', question: "Qui est l'acheteur ?", answerable: true, pageGroups: [[1]] },
	{
		id: 'both-parties',
		question: "Qui est l'acheteur et qui sont les vendeurs ?",
		answerable: true,
		pageGroups: [[1]]
	},
	{
		id: 'seller-synonym',
		question: 'Identifie les cédants du bien.',
		answerable: true,
		pageGroups: [[1]]
	},
	{
		id: 'buyer-synonym',
		question: 'Quel acquéreur signe le compromis ?',
		answerable: true,
		pageGroups: [[1]]
	},
	{
		id: 'buyer-profile',
		question: "Quelle est la profession, la nationalité et la date de naissance de l'acquéreur ?",
		answerable: true,
		pageGroups: [[1]]
	},
	{
		id: 'representation',
		question: 'Qui est absent, qui le représente et quelles personnes sont présentes ?',
		answerable: true,
		pageGroups: [[1]]
	},
	{
		id: 'property-address',
		question: 'À quelle adresse se trouve la maison ?',
		answerable: true,
		pageGroups: [[2]]
	},
	{
		id: 'cadastral-area',
		question: 'Quelle est la contenance cadastrale totale ?',
		answerable: true,
		pageGroups: [[2]]
	},
	{
		id: 'cadastral-typo',
		question: 'Quel est la contnence cadasrtale du bien ?',
		answerable: true,
		pageGroups: [[2]]
	},
	{
		id: 'furniture',
		question: 'Quels meubles sont vendus avec la maison ?',
		answerable: true,
		pageGroups: [[3]]
	},
	{
		id: 'sale-price',
		question: 'Quel est le prix de vente ?',
		answerable: true,
		pageGroups: [[3, 19]]
	},
	{
		id: 'natural-price',
		question: 'Combien coute la maison ?',
		answerable: true,
		pageGroups: [[3, 19]]
	},
	{
		id: 'sale-price-typo',
		question: 'Quel est le prxi de vnete exct ?',
		answerable: true,
		pageGroups: [[3, 19]]
	},
	{
		id: 'signature-deadline',
		question: "Quelle est la date limite pour signer l'acte authentique ?",
		answerable: true,
		pageGroups: [[3]]
	},
	{
		id: 'agency-fee',
		question: "Combien coûte l'agence et qui paie ?",
		answerable: true,
		pageGroups: [[4]]
	},
	{
		id: 'works',
		question: 'Quels travaux les vendeurs ont-ils fait réaliser ?',
		answerable: true,
		pageGroups: [[6]]
	},
	{
		id: 'heat-pump-install',
		question: 'Qui a installé la pompe à chaleur et quand ?',
		answerable: true,
		pageGroups: [[6]]
	},
	{
		id: 'heat-pump-service',
		question: 'Qui a entretenu la pompe à chaleur, et à quelle date ?',
		answerable: true,
		pageGroups: [[9]]
	},
	{
		id: 'property-tax',
		question: 'Quel est le montant de la taxe foncière 2024 ?',
		answerable: true,
		pageGroups: [[9]]
	},
	{
		id: 'fee-provision',
		question: 'Quelle provision pour frais faut-il verser sous quinze jours ?',
		answerable: true,
		pageGroups: [[10]]
	},
	{
		id: 'lead-asbestos',
		question: "Y a-t-il du plomb et de l'amiante ?",
		answerable: true,
		pageGroups: [[11]]
	},
	{
		id: 'termites',
		question: 'Le bien contient-il des termites ?',
		answerable: true,
		pageGroups: [[12]]
	},
	{
		id: 'gas-electricity',
		question: 'Quelles anomalies de gaz et d’électricité ont été constatées ?',
		answerable: true,
		pageGroups: [[12]]
	},
	{
		id: 'natural-risks',
		question: 'À quels risques naturels le bien est-il exposé ?',
		answerable: true,
		pageGroups: [[14]]
	},
	{
		id: 'polluted-sites',
		question:
			'Combien de sites pollués et de sites industriels sont recensés à moins de 500 mètres ?',
		answerable: true,
		pageGroups: [[15]]
	},
	{
		id: 'sanitation',
		question: "Que dit le document sur l'évacuation des eaux usées ?",
		answerable: true,
		pageGroups: [[15, 16]]
	},
	{
		id: 'merule-noise',
		question: 'Le bien est-il exposé aux mérules ou au bruit des aérodromes ?',
		answerable: true,
		pageGroups: [[16]]
	},
	{
		id: 'rain-smoke-solar',
		question:
			"Y a-t-il récupération d'eau de pluie, détecteur de fumée et panneaux photovoltaïques ?",
		answerable: true,
		pageGroups: [[18]]
	},
	{
		id: 'loan-amount',
		question: 'Quel est le montant du prêt ?',
		answerable: true,
		pageGroups: [[19]]
	},
	{ id: 'loan-cost', question: 'Quel est le coût du prêt ?', answerable: true, pageGroups: [[19]] },
	{
		id: 'loan-terms',
		question: 'Donne le montant, le taux maximal et la durée maximale du prêt.',
		answerable: true,
		pageGroups: [[19]]
	},
	{
		id: 'acquisition-breakdown',
		question:
			"Distingue prix de vente, frais d'acte, prêt, apport personnel et coût total d'acquisition.",
		answerable: true,
		pageGroups: [[19]]
	},
	{
		id: 'loan-deadlines',
		question: 'Quels sont les deux délais de 60 et 65 jours liés au prêt ?',
		answerable: true,
		pageGroups: [[19]]
	},
	{
		id: 'loan-refusals',
		question: 'Combien de refus bancaires faut-il fournir ?',
		answerable: true,
		pageGroups: [[19]]
	},
	{
		id: 'deposit',
		question: 'Quel est le montant du séquestre versé avant le compromis ?',
		answerable: true,
		pageGroups: [[20]]
	},
	{
		id: 'two-thousands',
		question: 'Les deux montants de 1 000 euros couvrent-ils la même chose ?',
		answerable: true,
		pageGroups: [[10], [20]]
	},
	{
		id: 'penalty',
		question: "Quelle pénalité est prévue en cas de refus d'exécuter la vente ?",
		answerable: true,
		pageGroups: [[21]]
	},
	{
		id: 'buyer-email',
		question: "Quelle adresse e-mail de l'acquéreur est indiquée ?",
		answerable: true,
		pageGroups: [[22]]
	},
	{
		id: 'seller-items',
		question: 'Quels équipements et éléments les vendeurs doivent-ils laisser dans le bien ?',
		answerable: true,
		pageGroups: [[23]]
	},
	{
		id: 'signature',
		question: 'Où et quand le compromis a-t-il été signé ?',
		answerable: true,
		pageGroups: [[25]]
	},
	{
		id: 'passport-negative',
		question: 'Quel est le numéro de passeport de Cédric Martin ?',
		answerable: false,
		pageGroups: []
	},
	{
		id: 'garage-negative',
		question: 'Quelle est la superficie du garage ?',
		answerable: false,
		pageGroups: []
	},
	{
		id: 'dpe-class',
		question: 'Quelle classe DPE exacte a été attribuée au logement ?',
		answerable: true,
		pageGroups: [[13]]
	}
];

/** Every inner group is one required fact; alternatives absorb harmless
 * wording differences without accepting a factually incomplete answer. */
export const MARTIN_ANSWER_ORACLE: Record<string, string[][]> = {
	'seller-identity': [['cedric paul martin'], ['helene marie dupuis']],
	'buyer-identity': [['karim traore']],
	'both-parties': [
		['cedric paul martin'],
		['helene marie dupuis'],
		['karim traore']
	],
	'seller-synonym': [['cedric paul martin'], ['helene marie dupuis']],
	'buyer-synonym': [['karim traore']],
	'buyer-profile': [['ingenieur'], ['guineenne', 'guineen'], ['5 juin 1997']],
	representation: [
		['cedric compromis'],
		['helene dupuis'],
		['idrissa konate'],
		['absent'],
		['represente']
	],
	'property-address': [['11 rue houchard'], ['lille']],
	'cadastral-area': [['76 ca', '76 centiares']],
	'cadastral-typo': [['76 ca', '76 centiares']],
	furniture: [['aucun meuble', 'pas de meuble']],
	'sale-price': [['146 000', '146.000']],
	'natural-price': [['146 000', '146.000']],
	'sale-price-typo': [['146 000', '146.000']],
	'signature-deadline': [['8 octobre 2025', '08 octobre 2025']],
	'agency-fee': [
		['7 500', '7.500'],
		['acquereur', 'acheteur']
	],
	works: [['toiture'], ['velux'], ['isolation'], ['pompe a chaleur']],
	'heat-pump-install': [['cham'], ['octobre 2020']],
	'heat-pump-service': [['izi confort'], ['3 decembre 2024', '03 decembre 2024']],
	'property-tax': [['621']],
	'fee-provision': [['1 000', '1000'], ['frais']],
	'lead-asbestos': [['plomb'], ['amiante'], ['absence', 'pas', 'aucun']],
	termites: [['termite'], ['pas', 'aucun', 'non']],
	'gas-electricity': [['gaz'], ['electricite'], ['anomal']],
	'natural-risks': [['inondation'], ['argile']],
	'polluted-sites': [['0 site', 'aucun site'], ['38']],
	sanitation: [['reseau collectif'], ['direct', 'indirect', 'imprecis']],
	'merule-noise': [['merule'], ['aerodrome'], ['pas', 'aucun', 'non']],
	'rain-smoke-solar': [
		['eau de pluie'],
		['detecteur de fumee'],
		['photovoltaique'],
		['pas', 'aucun', 'non']
	],
	'loan-amount': [['146 000', '146.000']],
	'loan-cost': [
		['determine', 'indetermine'],
		['type de pret', 'garanties']
	],
	'loan-terms': [['146 000', '146.000'], ['3,50', '3.50'], ['25 ans']],
	'acquisition-breakdown': [
		['146 000', '146.000'],
		['11 900', '11.900'],
		['157 900', '157.900']
	],
	'loan-deadlines': [['60 jours'], ['65 jours']],
	'loan-refusals': [['deux', '2']],
	deposit: [['1 000', '1000'], ['sequestre']],
	'two-thousands': [['provision'], ['sequestre'], ['differ', 'pas la meme', 'non']],
	penalty: [['10 %', '10%']],
	'buyer-email': [['44367278+soulbah@users.noreply.github.com']],
	'seller-items': [
		['portes', 'portails'],
		['sanitaire'],
		['chauffage'],
		['meubles de cuisine'],
		['volets', 'persiennes']
	],
	signature: [['croix'], ['22 juillet 2025']],
	'passport-negative': [['pas mentionne', 'ne mentionne pas', 'aucune information']],
	'garage-negative': [['pas mentionne', 'ne mentionne pas', 'aucune information']],
	'dpe-class': [['categorie c', 'classe c']]
};

export interface MartinStressResult {
	id: string;
	question: string;
	passed: boolean;
	answerBearing: boolean;
	pages: Array<number | null>;
	missingPageGroups: number[][];
	top: Array<{ page: number | null; text: string }>;
}

export async function runMartinStress(input: {
	documentId: string;
	retrieve: (question: string, documentIds: string[]) => Promise<SearchHit[]>;
}): Promise<{
	total: number;
	passed: number;
	score: number;
	failures: MartinStressResult[];
	results: MartinStressResult[];
}> {
	const results: MartinStressResult[] = [];
	for (const test of MARTIN_STRESS_CASES) {
		const hits = await input.retrieve(test.question, [input.documentId]);
		const answerBearing = hasAnswerBearingEvidence(test.question, hits);
		const pages = hits.map((hit) => hit.page);
		const missingPageGroups = test.pageGroups.filter(
			(group) => !group.some((page) => pages.includes(page))
		);
		const passed = test.answerable
			? answerBearing && missingPageGroups.length === 0
			: !answerBearing;
		results.push({
			id: test.id,
			question: test.question,
			passed,
			answerBearing,
			pages,
			missingPageGroups,
			top: hits.slice(0, 5).map((hit) => ({ page: hit.page, text: hit.text.slice(0, 180) }))
		});
	}
	const passed = results.filter((result) => result.passed).length;
	return {
		total: results.length,
		passed,
		score: passed / results.length,
		failures: results.filter((result) => !result.passed),
		results
	};
}

export async function runMartinAnswerStress(input: {
	documentId: string;
	retrieve: (question: string, documentIds: string[]) => Promise<SearchHit[]>;
	generate: (
		messages: Array<{ role: 'system' | 'user'; content: string }>,
		question: string,
		hits: SearchHit[]
	) => Promise<string>;
	onProgress?: (completed: number, total: number) => void;
}): Promise<{
	total: number;
	passed: number;
	score: number;
	failures: Array<{
		id: string;
		question: string;
		answer: string;
		missingAnswerGroups: string[][];
		expectedPageGroups: number[][];
		citedPages: Array<number | null>;
	}>;
}> {
	const failures: Array<{
		id: string;
		question: string;
		answer: string;
		missingAnswerGroups: string[][];
		expectedPageGroups: number[][];
		citedPages: Array<number | null>;
	}> = [];
	for (let index = 0; index < MARTIN_STRESS_CASES.length; index++) {
		const test = MARTIN_STRESS_CASES[index];
		const retrieved = await input.retrieve(test.question, [input.documentId]);
		const hits = hasAnswerBearingEvidence(test.question, retrieved) ? retrieved : [];
		const raw = stripThink(
			await input.generate(
				[
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: buildUserPrompt(test.question, hits) }
				],
				test.question,
				hits
			)
		);
		const resolved = resolveTargetedCitations(raw, hits, test.question);
		const answer = normalizeForFuzzy(resolved.text);
		const expected = MARTIN_ANSWER_ORACLE[test.id] ?? [];
		const missingAnswerGroups = expected.filter(
			(group) => !group.some((alternative) => answer.includes(normalizeForFuzzy(alternative)))
		);
		const citedPages = resolved.citations.map((citation) => citation.hit.page);
		const missingCitationGroups = test.answerable
			? test.pageGroups.filter((group) => !group.some((page) => citedPages.includes(page)))
			: citedPages.length
				? [[]]
				: [];
		if (missingAnswerGroups.length || missingCitationGroups.length) {
			failures.push({
				id: test.id,
				question: test.question,
				answer: resolved.text,
				missingAnswerGroups,
				expectedPageGroups: test.pageGroups,
				citedPages
			});
		}
		input.onProgress?.(index + 1, MARTIN_STRESS_CASES.length);
	}
	return {
		total: MARTIN_STRESS_CASES.length,
		passed: MARTIN_STRESS_CASES.length - failures.length,
		score: (MARTIN_STRESS_CASES.length - failures.length) / MARTIN_STRESS_CASES.length,
		failures
	};
}

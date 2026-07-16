import { normalizeForFuzzy } from '$lib/pipeline/fuzzy';
import { hasAnswerBearingEvidence } from '$lib/pipeline/relevance';
import {
	buildUserPrompt,
	groundedRefusal,
	resolveCitations,
	resolveTargetedCitations,
	stripThink,
	SYSTEM_PROMPT
} from '$lib/private-ai/prompt';
import type { SearchHit } from '$lib/types';
import { analyzeQuestion } from '$lib/analysis/query-router';

export interface PublicAnswerStressCase {
	id: string;
	question: string;
	answerGroups: string[][];
	documents: string[];
	answerable: boolean;
}

export const PUBLIC_ANSWER_STRESS_CASES: readonly PublicAnswerStressCase[] = [
	{
		id: 'nist-functions',
		question: 'Quelles sont les 4 fonctons du coeur de l AI RMF ?',
		answerGroups: [['govern'], ['map'], ['measure'], ['manage']],
		documents: ['nist-ai-rmf-1.0.pdf'],
		answerable: true
	},
	{
		id: 'nist-not-checklist',
		question: 'Les actons du Core forment elles une cheklist ordonee ?',
		answerGroups: [
			['non', 'do not', 'ne constituent pas'],
			['checklist', 'liste de controle', 'liste a cocher']
		],
		documents: ['nist-ai-rmf-1.0.pdf'],
		answerable: true
	},
	{
		id: 'nist-attributes',
		question: 'Le cadre est il obligatoir et propre a un sectuer ?',
		answerGroups: [
			['volontaire', 'voluntary'],
			['non sectoriel', 'non specifique a un secteur', 'non sector specific']
		],
		documents: ['nist-ai-rmf-1.0.pdf'],
		answerable: true
	},
	{
		id: 'irs-total-income',
		question: 'A quelle ligen du 1040 calcule t on le revneu total ?',
		answerGroups: [['ligne 9', 'line 9']],
		documents: ['irs-form-1040-2025.pdf'],
		answerable: true
	},
	{
		id: 'irs-taxable-income',
		question: 'Quelle ligen donne le taxble income et coment est il calcule ?',
		answerGroups: [
			['ligne 15', 'line 15'],
			['ligne 14', 'line 14'],
			['ligne 11b', 'line 11b']
		],
		documents: ['irs-form-1040-2025.pdf'],
		answerable: true
	},
	{
		id: 'irs-refund-owed',
		question: 'Quelles lignes distinguent le remboursemnt demande du montant du ?',
		answerGroups: [['35a'], ['37']],
		documents: ['irs-form-1040-2025.pdf'],
		answerable: true
	},
	{
		id: 'aec-reference',
		question: 'Quel detail est reference pour le gravier cruhsed baslat 1/4 inch minus ?',
		answerGroups: [['1/lp103', '1 lp103']],
		documents: ['aec-addendum-drawings.pdf'],
		answerable: true
	},
	{
		id: 'aec-missing-target',
		question: 'Le detail 1 LP103 reference par le cruhsed basalt existe t il dans les plans ?',
		answerGroups: [
			['pas trouve', 'introuvable', 'absent', 'n existe pas', 'not found', 'does not appear']
		],
		documents: [],
		answerable: false
	},
	{
		id: 'tatqa-total',
		question: 'Quel est le total des ventes en 2019 ?',
		answerGroups: [['1 496,5', '1,496.5', '1496.5']],
		documents: ['tatqa-contract-sales.md'],
		answerable: true
	},
	{
		id: 'tatqa-change',
		question: 'De combien les ventes Other ont-elles varié de 2018 à 2019 ?',
		answerGroups: [
			['12,6', '12.6'],
			['baisse', 'diminue', 'decrease', '-12,6', '-12.6', '56,7 millions en 2018 a 44,1']
		],
		documents: ['tatqa-contract-sales.md'],
		answerable: true
	},
	{
		id: 'finqa-average',
		question: 'Quel volume de paiement moyen par transaction a American Express ?',
		answerGroups: [['127,4', '127.4']],
		documents: ['finqa-payment-networks.txt'],
		answerable: true
	},
	{
		id: 'cross-document-arithmetic',
		question:
			'Donne le total des ventes 2019 et le volume de paiement moyen par transaction d American Express.',
		answerGroups: [
			['1 496,5', '1,496.5', '1496.5'],
			['127,4', '127.4']
		],
		documents: ['tatqa-contract-sales.md', 'finqa-payment-networks.txt'],
		answerable: true
	},
	{
		id: 'unsupported-ceo',
		question: 'Quel est le nom du PDG de Discover dans ce tableau ?',
		answerGroups: [
			[
				'pas mentionne',
				'ne mentionne pas',
				'aucune information',
				'pas trouve assez',
				'not mentioned'
			]
		],
		documents: [],
		answerable: false
	}
];

export async function runPublicAnswerStress(input: {
	documentIds: string[];
	retrieve: (
		question: string,
		documentIds: string[]
	) => Promise<{ hits: SearchHit[]; alternateQueries: string[] }>;
	generate: (
		messages: Array<{ role: 'system' | 'user'; content: string }>,
		question: string,
		route: 'targeted' | 'synthesis',
		hits: SearchHit[]
	) => Promise<string>;
	resolveRoute?: (question: string) => Promise<'targeted' | 'synthesis'>;
	cases?: readonly PublicAnswerStressCase[];
	onProgress?: (completed: number, total: number) => void;
}): Promise<{
	total: number;
	passed: number;
	score: number;
	failures: Array<{
		id: string;
		answer: string;
		missingAnswerGroups: string[][];
		expectedDocuments: string[];
		citedDocuments: string[];
	}>;
}> {
	const failures = [];
	const cases = input.cases ?? PUBLIC_ANSWER_STRESS_CASES;
	for (let index = 0; index < cases.length; index++) {
		const test = cases[index];
		const retrieved = await input.retrieve(test.question, input.documentIds);
		const hits = hasAnswerBearingEvidence(test.question, retrieved.hits, retrieved.alternateQueries)
			? retrieved.hits
			: [];
		const route = input.resolveRoute
			? await input.resolveRoute(test.question)
			: analyzeQuestion(test.question).route === 'synthesis'
				? 'synthesis'
				: 'targeted';
		const raw = hits.length
			? stripThink(
					await input.generate(
						[
							{ role: 'system', content: SYSTEM_PROMPT },
							{ role: 'user', content: buildUserPrompt(test.question, hits) }
						],
						test.question,
						route,
						hits
					)
				)
			: groundedRefusal(test.question);
		const resolved =
			route === 'synthesis'
				? resolveCitations(raw, hits)
				: resolveTargetedCitations(raw, hits, test.question);
		const answer = normalizeForFuzzy(resolved.text);
		const missingAnswerGroups = test.answerGroups.filter(
			(group) => !group.some((alternative) => answer.includes(normalizeForFuzzy(alternative)))
		);
		const citedDocuments = [
			...new Set(resolved.citations.map((citation) => citation.hit.documentName))
		];
		const missingDocuments = test.documents.filter((name) => !citedDocuments.includes(name));
		const unexpectedCitations = !test.answerable && citedDocuments.length > 0;
		if (missingAnswerGroups.length || missingDocuments.length || unexpectedCitations) {
			failures.push({
				id: test.id,
				answer: resolved.text,
				missingAnswerGroups,
				expectedDocuments: test.documents,
				citedDocuments
			});
		}
		input.onProgress?.(index + 1, cases.length);
	}
	return {
		total: cases.length,
		passed: cases.length - failures.length,
		score: (cases.length - failures.length) / cases.length,
		failures
	};
}

import type {
	AggregateOperation,
	ClarificationKind,
	FinancialRole,
	QueryScopeKind
} from '$lib/nlu/semantic-frame';
import type { QuestionRoute } from '$lib/types';
import externalHeldOut from '../../../benchmarks/semantic-heldout.json';

interface SemanticExpectation {
	route: QuestionRoute;
	operation?: AggregateOperation | null;
	role?: FinancialRole | null;
	scope?: QueryScopeKind;
	clarification?: ClarificationKind | null;
	referencesPrevious?: boolean;
}

export interface SemanticStressCase {
	id: string;
	baseId: string;
	variant: string;
	locale: 'fr' | 'en';
	partition?: 'heldout';
	category: 'mft' | 'invariance' | 'directional' | 'hard-negative' | 'semantic';
	question: string;
	expected: SemanticExpectation;
}

interface BaseCase {
	id: string;
	question: string;
	expected: SemanticExpectation;
	category?: SemanticStressCase['category'];
}

const BASES: BaseCase[] = [
	...[
		['fr-sent-1', "Combien j'ai envoyé au total ?", 'sum', 'sent'],
		['fr-sent-2', 'Somme des montants envoyés', 'sum', 'sent'],
		['fr-sent-3', 'Additionnez chaque transfert envoyé', 'sum', 'sent'],
		['en-sent-1', 'How much did I send in all?', 'sum', 'sent'],
		['en-sent-2', 'Sum every sent transfer', 'sum', 'sent'],
		['fr-received-1', 'Total des montants reçus', 'sum', 'received'],
		['fr-received-2', 'Combien a reçu le bénéficiaire ?', 'sum', 'received'],
		['en-received-1', 'How much was received in total?', 'sum', 'received'],
		['fr-fee-1', 'Somme de tous les frais', 'sum', 'fee'],
		['en-fee-1', 'Add up every fee', 'sum', 'fee'],
		['fr-avg-1', 'Moyenne des frais de toutes les transactions', 'average', 'fee'],
		['en-avg-1', 'Average fee across all transfers', 'average', 'fee'],
		['fr-min-1', 'Quel est le plus faible montant reçu ?', 'minimum', 'received'],
		['en-max-1', 'Highest amount sent across every transfer', 'maximum', 'sent'],
		['fr-count-1', 'Combien de transactions sont jointes ?', 'count', null],
		['en-count-1', 'How many invoices are attached?', 'count', null],
		['fr-list-1', 'Liste tous les frais', 'list', 'fee'],
		['en-list-1', 'List each received amount', 'list', 'received']
	].map(([id, question, operation, role]) => ({
		id: id as string,
		question: question as string,
		expected: {
			route: 'aggregate' as const,
			operation: operation as AggregateOperation,
			role: role as FinancialRole | null,
			...(/\b(?:tous|toutes|chaque|every|all|each|attached|jointes)\b/i.test(question as string)
				? { scope: 'collection' as const }
				: {}),
			clarification: role === null && operation === 'sum' ? ('financial_role' as const) : null
		}
	})),
	...[
		['fr-record-1', 'Quel est le total de la facture F-102 ?'],
		['fr-record-2', 'Combien ai-je envoyé pour la transaction T-123 ?'],
		['fr-record-3', 'Quels frais figurent sur le transfert TR-88 ?'],
		['fr-record-4', 'Quel montant est indiqué page 3 ?'],
		['fr-record-5', 'Combien de pages dans cette facture ?'],
		['en-record-1', 'What is the total for invoice F-102?'],
		['en-record-2', 'How much did I send for transfer T-456?'],
		['en-record-3', 'Which fee is on transaction TX-99?'],
		['en-record-4', 'What amount appears on page 3?'],
		['en-record-5', 'How many pages are in this invoice?']
	].map(([id, question]) => ({
		id,
		question,
		expected: {
			route: 'targeted' as const,
			scope: question.includes('page 3') ? ('page' as const) : ('record' as const)
		}
	})),
	...[
		['fr-synth-1', 'Compare les différences entre tous les contrats'],
		['fr-synth-2', 'Dresse un portrait complet à partir de plusieurs sources'],
		['fr-synth-3', 'Que sait-on de Camille dans tous les documents ?'],
		['fr-synth-4', 'Relève les contradictions entre les pièces jointes'],
		['en-synth-1', 'Compare the differences across all contracts'],
		['en-synth-2', 'Build a complete profile from multiple sources'],
		['en-synth-3', 'What do we know about Camille across all documents?'],
		['en-synth-4', 'Find contradictions in the attached documents']
	].map(([id, question]) => ({
		id,
		question,
		expected: { route: 'synthesis' as const, clarification: null }
	})),
	...[
		['fr-semantic-1', 'Raconte-moi ce qui ressort de ces pièces'],
		['fr-semantic-2', 'Mets ensemble ce que disent les fichiers sur Camille'],
		['fr-semantic-3', "Donne-moi une vue d'ensemble de la situation"],
		['fr-semantic-4', 'Relie les éléments dispersés dans les fichiers'],
		['fr-semantic-5', 'Résume ce que les sources établissent collectivement'],
		['en-semantic-1', 'Tell me what emerges from these files'],
		['en-semantic-2', 'Bring together what the files say about Camille'],
		['en-semantic-3', 'Give me the big picture of the situation'],
		['en-semantic-4', 'Connect the scattered facts in the files'],
		['en-semantic-5', 'Summarize what the sources collectively establish']
	].map(([id, question]) => ({
		id,
		question,
		category: 'semantic' as const,
		expected: { route: 'synthesis' as const, clarification: null }
	})),
	...[
		['fr-clarify-1', 'Quel est le total ?', 'scope'],
		['en-clarify-1', 'What is the total?', 'scope'],
		['fr-clarify-2', 'Total de tous les documents', 'financial_role'],
		['en-clarify-2', 'Total across every document', 'financial_role']
	].map(([id, question, clarification]) => ({
		id,
		question,
		category: 'directional' as const,
		expected: {
			route: clarification === 'scope' ? ('targeted' as const) : ('aggregate' as const),
			operation: 'sum' as const,
			clarification: clarification as ClarificationKind
		}
	})),
	...[
		['fr-hard-1', 'Explique la clause de résiliation'],
		['fr-hard-2', 'Le contrat mentionne-t-il une assurance ?'],
		['fr-hard-3', 'Écris un résumé de la facture F-102'],
		['fr-hard-4', 'Quelle est la cité de naissance ?'],
		['en-hard-1', 'Explain the termination clause'],
		['en-hard-2', 'Does the contract mention insurance?'],
		['en-hard-3', 'Write a summary of invoice F-102']
	].map(([id, question]) => ({
		id,
		question,
		category: 'hard-negative' as const,
		expected: { route: 'targeted' as const, clarification: null }
	})),
	...[
		['fr-follow-1', 'Et ses frais ?', 'fee'],
		['fr-follow-2', 'Et en juillet ?', null],
		['en-follow-1', 'What about their fees?', 'fee'],
		['en-follow-2', 'And in July?', null]
	].map(([id, question, role]) => ({
		id: id as string,
		question: question as string,
		expected: {
			route: 'targeted' as const,
			role: role as FinancialRole | null,
			referencesPrevious: true
		}
	}))
];

function noAccents(value: string): string {
	return value.normalize('NFKD').replace(/\p{M}/gu, '');
}

function typo(value: string): string {
	const replacements: Array<[RegExp, string]> = [
		[/total/i, 'totla'],
		[/montants?/i, 'montnat'],
		[/documents?/i, 'documetns'],
		[/facture/i, 'facutre'],
		[/invoice/i, 'invocie'],
		[/compare/i, 'comapre'],
		[/contradictions?/i, 'contradicitons'],
		[/frais/i, 'farais'],
		[/received/i, 'recieved'],
		[/transfer/i, 'trasnfer']
	];
	for (const [pattern, replacement] of replacements) {
		if (pattern.test(value)) return value.replace(pattern, replacement);
	}
	return `${value} ?`;
}

const TRANSFORMS: Array<[string, (value: string) => string]> = [
	['plain', (value) => value],
	['case', (value) => value.toLocaleUpperCase()],
	['punctuation', (value) => `  ${value.replace(/[?!.]+$/, '')} !!!  `],
	['accents', noAccents],
	['spacing', (value) => value.replace(/ /g, '   ')],
	['typo', typo]
];

export function buildSemanticStressCorpus(): SemanticStressCase[] {
	return BASES.flatMap((base) =>
		TRANSFORMS.map(([variant, transform]) => ({
			id: `${base.id}:${variant}`,
			baseId: base.id,
			variant,
			locale: base.id.startsWith('en-') ? ('en' as const) : ('fr' as const),
			category: base.category ?? (variant === 'plain' ? 'mft' : 'invariance'),
			question: transform(base.question),
			expected: base.expected
		}))
	);
}

export function buildSemanticBenchmarkCorpus(): SemanticStressCase[] {
	return [
		...buildSemanticStressCorpus(),
		...externalHeldOut.cases.map((test): SemanticStressCase => ({
			id: test.id,
			baseId: test.id,
			variant: 'external',
			locale: test.id.startsWith('ext-en-') ? 'en' : 'fr',
			partition: 'heldout',
			category: test.clarification ? 'directional' : 'hard-negative',
			question: test.question,
			expected: {
				route: test.route as QuestionRoute,
				...('operation' in test ? { operation: test.operation as AggregateOperation } : {}),
				...('role' in test ? { role: test.role as FinancialRole } : {}),
				...('scope' in test ? { scope: test.scope as QueryScopeKind } : {}),
				...('clarification' in test
					? { clarification: test.clarification as ClarificationKind }
					: {})
			}
		}))
	];
}

function stableBucket(value: string): number {
	let hash = 2166136261;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return Math.abs(hash) % 5;
}

/** Split by base utterance before perturbation expansion: no case family can
 * appear in calibration and held-out sets. */
export function splitSemanticStressCorpus(cases = buildSemanticStressCorpus()): {
	calibration: SemanticStressCase[];
	heldOut: SemanticStressCase[];
} {
	const calibration: SemanticStressCase[] = [];
	const heldOut: SemanticStressCase[] = [];
	for (const test of cases) {
		(test.partition === 'heldout' || stableBucket(test.baseId) >= 2 ? heldOut : calibration).push(
			test
		);
	}
	return { calibration, heldOut };
}

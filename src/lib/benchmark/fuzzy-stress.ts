export type FuzzyStressCategory =
	| 'keyboard'
	| 'edit'
	| 'unicode'
	| 'ocr'
	| 'layout'
	| 'language'
	| 'identity'
	| 'numeric'
	| 'absence'
	| 'scale';
export interface FuzzyStressCase {
	id: string;
	category: FuzzyStressCategory;
	scenario: 'general' | 'exact' | 'structure' | 'multi-document' | 'absence';
	query: string;
	expectedDocumentIds: string[];
	evidence: string[];
	locators: string[];
	answerable: boolean;
}

const facts = [
	['identite', 'Qui est Anaïs Dœuf ?', 'Anaïs Dœuf est ingénieure biomédicale.', 'people-1'],
	[
		'contrat',
		'Quand expire le contrat ZX-2048 ?',
		'Le contrat ZX-2048 expire le 17 septembre 2028.',
		'contract-1'
	],
	[
		'paiement',
		'Quel montant porte la facture FR-2026-017 ?',
		'La facture FR-2026-017 porte sur 1 807,42 €.',
		'invoice-1'
	],
	[
		'acronyme',
		'Que signifie HTTP ?',
		'Hypertext Transfer Protocol (HTTP) est un protocole sans état.',
		'rfc-1'
	],
	[
		'tableau',
		'Quelle est la capacité de la caisse BX-77 ?',
		'Référence BX-77 | Capacité: 42 kg | Classe: renforcée.',
		'table-1'
	],
	['ocr', 'Quel est le numéro Morel ?', 'Le numéro de dossier Morel est CP-58019.', 'scan-1'],
	[
		'multidoc',
		'Quel est le statut complet de Malik Ouedraogo ?',
		'Malik Ouedraogo est étudiant et marié.',
		'people-2'
	],
	[
		'juridique',
		'Que prévoit la section 178.516 ?',
		'La section 178.516 régit les essais des caisses en carton-fibre.',
		'cfr-1'
	],
	[
		'nasa',
		'Quel rapport décrit la planification Apollo ?',
		'Le rapport NASA décrit les procédures de planification des vols Apollo.',
		'nasa-1'
	],
	['absence', 'Quel est le code secret de Saturne ?', '', 'none']
] as const;

const variants: Array<[FuzzyStressCategory, (q: string, round: number) => string]> = [
	[
		'keyboard',
		(q, round) =>
			q.replace(
				round === 0 ? /a/i : round === 1 ? /e/i : /i/i,
				round === 0 ? 'q' : round === 1 ? 'r' : 'o'
			)
	],
	[
		'edit',
		(q, round) =>
			round === 0
				? q.replace(/(\p{L})(\p{L})/u, '$2$1')
				: round === 1
					? q.replace(/\p{L}/u, '')
					: q.replace(/\p{L}/u, '$&$&')
	],
	[
		'unicode',
		(q, round) =>
			round === 0
				? q.normalize('NFD')
				: round === 1
					? q.replaceAll(' ', '\u00a0')
					: q.replaceAll("'", '’')
	],
	[
		'ocr',
		(q, round) =>
			round === 0
				? q.replace(/[oO]/, '0')
				: round === 1
					? q.replace(/[lI]/, '1')
					: q.replace(/rn/i, 'm')
	],
	[
		'layout',
		(q, round) =>
			round === 0
				? q.replace(/ /g, '-\n')
				: round === 1
					? q.replace(/ /g, '')
					: `EN-TÊTE\n${q}\nPIED DE PAGE`
	],
	[
		'language',
		(q, round) =>
			round === 0
				? `Please answer: ${q}`
				: round === 1
					? `Réponse factuelle requise: ${q}`
					: q.replace(/contrat/i, 'agreement')
	],
	[
		'identity',
		(q, round) =>
			round === 0
				? q.replace(/Anaïs|Malik/, 'Anais')
				: round === 1
					? q.replace(/Dœuf/, 'Doeuf')
					: q.replace(/Ouedraogo/, 'O. Ouedraogo')
	],
	[
		'numeric',
		(q, round) =>
			q.replace(/2048|2026|58019|178\.516/, (n) =>
				round === 0 ? n.split('').join(' ') : round === 1 ? n.replace('.', ',') : `n°${n}`
			)
	],
	[
		'absence',
		(q, round) =>
			`${q} ${round === 0 ? 'Réponds absent si non prouvé.' : round === 1 ? 'Ne déduis rien.' : 'Exige une citation exacte.'}`
	],
	[
		'scale',
		(q, round) =>
			`Dans les ${round === 0 ? 50 : round === 1 ? 100 : 500} documents, ${q.toLocaleLowerCase()}`
	]
];

export function buildFuzzyStressMatrix(): FuzzyStressCase[] {
	const cases: FuzzyStressCase[] = [];
	for (const [factId, query, evidence, documentId] of facts) {
		const scenario =
			factId === 'absence'
				? 'absence'
				: ['contrat', 'paiement', 'ocr', 'juridique'].includes(factId)
					? 'exact'
					: ['acronyme', 'tableau', 'nasa'].includes(factId)
						? 'structure'
						: ['identite', 'multidoc'].includes(factId)
							? 'multi-document'
							: 'general';
		for (let round = 0; round < 3; round++)
			for (const [category, mutate] of variants) {
				const answerable = factId !== 'absence';
				cases.push({
					id: `${factId}-${category}-${round}`,
					category,
					scenario,
					query: mutate(round ? query.toLocaleLowerCase() : query, round),
					expectedDocumentIds: answerable ? [documentId] : [],
					evidence: answerable ? [evidence] : [],
					locators: answerable ? [`${documentId}#controlled-${factId}`] : [],
					answerable
				});
			}
	}
	return cases;
}

export interface CrossDocumentFixture {
	name: string;
	mime: string;
	content: string;
	marker: string;
}

export interface CrossDocumentCase {
	query: string;
	relevantDocuments: string[];
	category:
		| 'complementary'
		| 'multi-hop'
		| 'identity'
		| 'negation'
		| 'superseded'
		| 'conflict'
		| 'exhaustive'
		| 'absent';
}

export const CROSS_DOCUMENT_FIXTURES: CrossDocumentFixture[] = [
	{
		name: 'profil-cr204.md',
		mime: 'text/markdown',
		marker: 'BALISE-PROFIL-CR204',
		content: `# Fiche de profil — CR-204

Identifiant unique : CR-204.
Camille Renaud réside à Grenoble. Elle est née à Dijon le 14 février 1999.
Cette fiche ne contient aucune information sur sa situation familiale.
BALISE-PROFIL-CR204
`
	},
	{
		name: 'scolarite-cr204.txt',
		mime: 'text/plain',
		marker: 'BALISE-ETUDES-CR204',
		content: `DOSSIER SCOLAIRE CR-204
Camille Renaud est étudiante en architecture à Lyon depuis septembre 2024.
Elle prépare un master. Elle n'est pas enseignante et n'étudie pas à Grenoble.
BALISE-ETUDES-CR204
`
	},
	{
		name: 'etat-civil-cr204.txt',
		mime: 'text/plain',
		marker: 'BALISE-MARIAGE-CR204',
		content: `EXTRAIT SYNTHÉTIQUE — PERSONNE CR-204
Camille Renaud, identifiant CR-204, est mariée à Noé Perrin depuis le 6 juillet 2025.
Ce document ne mentionne ni métier ni études.
BALISE-MARIAGE-CR204
`
	},
	{
		name: 'homonyme-cr905.md',
		mime: 'text/markdown',
		marker: 'BALISE-HOMONYME-CR905',
		content: `# Homonyme — CR-905

Une autre personne porte le nom Camille Renaud. Son identifiant est CR-905.
CR-905 est née à Toulouse en 1987, exerce comme enseignante et est célibataire.
Ne jamais fusionner CR-905 avec CR-204 malgré leur nom identique.
BALISE-HOMONYME-CR905
`
	},
	{
		name: 'orion-compte-rendu.txt',
		mime: 'text/plain',
		marker: 'BALISE-ORION-INITIAL',
		content: `PROJET ORION — COMPTE RENDU DU 10 JANVIER 2026
Responsable du projet : Marc Vidal.
Léa Morel participe comme observatrice ; elle ne dirige pas le projet.
Budget initial proposé : 120 000 EUR.
BALISE-ORION-INITIAL
`
	},
	{
		name: 'orion-avenant.txt',
		mime: 'text/plain',
		marker: 'BALISE-ORION-AVENANT',
		content: `PROJET ORION — AVENANT DU 18 MARS 2026
Le budget révisé et actuellement applicable est 145 000 EUR.
La valeur de 120 000 EUR est remplacée et ne doit plus servir de budget actuel.
La responsabilité de Marc Vidal reste inchangée.
BALISE-ORION-AVENANT
`
	},
	{
		name: 'expedition-zx17.txt',
		mime: 'text/plain',
		marker: 'BALISE-ZX17-B17',
		content: `BORDEREAU D'EXPÉDITION
Le colis ZX-17 appartient exclusivement au lot B-17.
Le bordereau ne donne aucun lieu de stockage.
BALISE-ZX17-B17
`
	},
	{
		name: 'stock-lots.txt',
		mime: 'text/plain',
		marker: 'BALISE-B17-NANTES',
		content: `ÉTAT DES STOCKS
Lot B-17 : entrepôt de Nantes, zone C.
Lot B-71 : entrepôt de Lille, zone A.
Attention : B-17 et B-71 sont deux lots distincts.
BALISE-B17-NANTES
`
	},
	{
		name: 'temoignages-atelier.md',
		mime: 'text/markdown',
		marker: 'BALISE-TEMOIGNAGES',
		content: `# Témoignages indépendants

- Document A : Imani décrit l'atelier comme calme.
- Document B : Pablo décrit le même atelier comme bruyant pendant les livraisons.

Ces perceptions divergent ; aucune ne doit être supprimée ou présentée comme fait unique.
BALISE-TEMOIGNAGES
`
	}
];

export const CROSS_DOCUMENT_CASES: CrossDocumentCase[] = [
	{
		query: 'Que sait-on des études et de la situation familiale de Camille Renaud CR-204 ?',
		relevantDocuments: ['scolarite-cr204.txt', 'etat-civil-cr204.txt'],
		category: 'complementary'
	},
	{
		query: 'Dresse un portrait complet de CR-204 sans la confondre avec son homonyme.',
		relevantDocuments: [
			'profil-cr204.md',
			'scolarite-cr204.txt',
			'etat-civil-cr204.txt',
			'homonyme-cr905.md'
		],
		category: 'identity'
	},
	{
		query: 'Camille Renaud est-elle née à Toulouse et est-elle enseignante ?',
		relevantDocuments: ['profil-cr204.md', 'scolarite-cr204.txt', 'homonyme-cr905.md'],
		category: 'identity'
	},
	{
		query: 'Qui dirige Orion, qui ne le dirige pas, et quel budget est actuellement valable ?',
		relevantDocuments: ['orion-compte-rendu.txt', 'orion-avenant.txt'],
		category: 'negation'
	},
	{
		query:
			"Quel ancien budget d'Orion ne faut-il plus utiliser, et par quelle somme est-il remplacé ?",
		relevantDocuments: ['orion-compte-rendu.txt', 'orion-avenant.txt'],
		category: 'superseded'
	},
	{
		query:
			'Dans quel entrepôt se trouve le colis ZX-17 ? Explique le lien entre colis, lot et lieu.',
		relevantDocuments: ['expedition-zx17.txt', 'stock-lots.txt'],
		category: 'multi-hop'
	},
	{
		query: 'Le colis ZX-17 est-il à Lille ?',
		relevantDocuments: ['expedition-zx17.txt', 'stock-lots.txt'],
		category: 'negation'
	},
	{
		query:
			"Donne toutes les descriptions de l'atelier sans résoudre artificiellement leur divergence.",
		relevantDocuments: ['temoignages-atelier.md'],
		category: 'conflict'
	},
	{
		query: 'Quels documents parlent de CR-204, et quel fait distinct apporte chacun ?',
		relevantDocuments: ['profil-cr204.md', 'scolarite-cr204.txt', 'etat-civil-cr204.txt'],
		category: 'exhaustive'
	},
	{
		query: 'Quel est le numéro de passeport de CR-204 ?',
		relevantDocuments: [],
		category: 'absent'
	}
];

export function scoreCrossDocumentEvidence(
	cases: CrossDocumentCase[],
	retrievedNames: string[][]
): { evidenceRecall: number; completeCaseRate: number; absentCasePrecision: number } {
	let expected = 0;
	let recalled = 0;
	let complete = 0;
	let absent = 0;
	let absentClean = 0;
	for (const [index, test] of cases.entries()) {
		const names = new Set(retrievedNames[index] ?? []);
		if (!test.relevantDocuments.length) {
			absent++;
			if (!names.size) absentClean++;
			continue;
		}
		expected += test.relevantDocuments.length;
		const found = test.relevantDocuments.filter((name) => names.has(name)).length;
		recalled += found;
		if (found === test.relevantDocuments.length) complete++;
	}
	const answerable = cases.filter((test) => test.relevantDocuments.length).length;
	return {
		evidenceRecall: expected ? recalled / expected : 1,
		completeCaseRate: answerable ? complete / answerable : 1,
		absentCasePrecision: absent ? absentClean / absent : 1
	};
}

import type { QuestionRoute } from '$lib/types';

export const SEMANTIC_PROTOTYPE_VERSION = 3;

export interface SemanticPrototype {
	label: QuestionRoute;
	text: string;
}

/**
 * Small, versioned bilingual anchors, not an exhaustive utterance list. Each
 * item describes a route's meaning; surface-form robustness comes from the
 * multilingual embedding model already used by retrieval.
 */
export const SEMANTIC_PROTOTYPES: readonly SemanticPrototype[] = [
	{ label: 'targeted', text: 'Find one precise fact in a document.' },
	{ label: 'targeted', text: 'Answer a question about one named record or person.' },
	{ label: 'targeted', text: 'Retrouver un fait précis dans un document.' },
	{ label: 'targeted', text: 'Répondre sur une facture, une personne ou une référence précise.' },
	{ label: 'synthesis', text: 'Compare evidence from several documents and explain differences.' },
	{ label: 'synthesis', text: 'Combine facts about the same subject across multiple sources.' },
	{ label: 'synthesis', text: 'Comparer plusieurs documents et expliquer leurs différences.' },
	{
		label: 'synthesis',
		text: 'Rassembler les informations sur un même sujet entre plusieurs sources.'
	},
	{
		label: 'synthesis',
		text: 'Build the overall picture from all files and connect facts scattered between them.'
	},
	{
		label: 'synthesis',
		text: 'Faire ressortir la vue d’ensemble et relier les faits dispersés entre tous les fichiers.'
	},
	{
		label: 'aggregate',
		text: 'Calculate a sum, average, minimum, maximum or count across records.'
	},
	{ label: 'aggregate', text: 'List every matching transaction without top-k truncation.' },
	{
		label: 'aggregate',
		text: 'Calculer une somme, moyenne, minimum, maximum ou quantité sur des relevés.'
	},
	{ label: 'aggregate', text: 'Lister toutes les transactions correspondantes sans en omettre.' }
];

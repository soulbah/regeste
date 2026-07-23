import { describe, expect, it } from 'vitest';
import {
	denseRetrievalQueryVariants,
	enumerationEvidenceCoverage,
	expandChannelCandidatesWithNeighbors,
	expandRetrievalQuery,
	expandStructuralParents,
	fuseCandidates,
	mergeRankedCandidateLists,
	neighborsForAnchors,
	isNumericAnswerQuestion,
	numericLabelEvidenceCoverage,
	numericLabelValueProximityCoverage,
	queryCoverage,
	refineCandidates,
	retrievalQueryVariants,
	splitQueryClauses,
	selectWithNeighbors,
	numericAnswerEvidenceCoverage,
	numericConstraintEvidenceCoverage,
	contactAnswerEvidenceCoverage,
	contactAnswerValues,
	durationValueMentions,
	missingDurationCarrier,
	multiClauseEvidenceCoverage,
	requestedDurationCount
} from './retrieval';
import { chunkBlocks } from './chunk';
import type { SearchHit } from '$lib/types';

const hit = (chunkId: number, documentId: string, score: number): SearchHit => ({
	chunkId,
	documentId,
	documentName: `${documentId}.pdf`,
	text: `chunk ${chunkId}`,
	page: 1,
	headingPath: null,
	score
});

describe('fuseCandidates', () => {
	it('keeps a useful contextual neighbor in its channel before hybrid fusion', () => {
		const anchor = { ...hit(1, 'policy', 0.8), seq: 10, text: 'Votre devis assurance.' };
		const price = {
			...hit(2, 'policy', 0),
			seq: 11,
			text: 'Paiement mensuel exact de 14,91 €.'
		};
		const unrelated = { ...hit(3, 'policy', 0), seq: 9, text: 'Adresse postale.' };
		const result = expandChannelCandidatesWithNeighbors(
			[anchor],
			[unrelated, price],
			'C cbien la cotizasion menssuelle exacte ?'
		);
		expect(result.map((item) => item.chunkId)).toEqual([1, 2]);
	});

	it('binds a requested money label to the nearby value instead of a later deductible', () => {
		const query = 'C cbien la cotizasion menssuelle exacte ?';
		const premium = 'Votre paiement mensuel exact est de 14,91 € par mois.';
		const distractor =
			'Votre paiement mensuel peut diminuer selon vos choix. ' +
			'Conditions générales sans montant applicable. '.repeat(6) +
			'La franchise est de 380 €.';
		expect(numericLabelValueProximityCoverage(query, premium)).toBe(1);
		expect(numericLabelValueProximityCoverage(query, distractor)).toBeLessThan(1);
		expect(numericLabelEvidenceCoverage(query, 'cotisation moins importante')).toBe(0.5);
	});

	it('merges query variants by rank, the original query counting double', () => {
		// Rank-only fusion let variants outvote the original query's unique hit
		// (measured: an enumeration question lost two named perils the plain
		// query retrieves). Agreement across lists still wins; between two
		// rank-1 hits, the user's actual question now beats a rewrite.
		const originalBest = hit(1, 'original', 0.51);
		const expandedBest = hit(2, 'expanded', 0.91);
		const agreed = hit(3, 'agreed', 0.5);
		const result = mergeRankedCandidateLists([
			[originalBest, agreed],
			[expandedBest, { ...agreed, score: 0.8 }]
		]);
		expect(result.map((item) => item.chunkId)).toEqual([3, 1, 2]);
	});

	it('rewards agreement and keeps raw scores', () => {
		const result = fuseCandidates([hit(1, 'a', 0.8), hit(2, 'a', 0.7)], [hit(2, 'a', -4)]);
		expect(result[0].chunkId).toBe(2);
		expect(result[0].semanticScore).toBe(0.7);
		expect(result[0].lexicalScore).toBe(-4);
	});

	it('never introduces an out-of-scope candidate', () => {
		const result = fuseCandidates([hit(1, 'enabled', 0.8)], [hit(2, 'enabled', -2)]);
		expect(result.every((candidate) => candidate.documentId === 'enabled')).toBe(true);
	});
});

describe('fuzzy and multi-document safety', () => {
	it('rewards structured enumerations only for exhaustive list questions', () => {
		const numbered = '1. Alpha\n2. Beta\n3. Gamma\n4. Delta';
		expect(enumerationEvidenceCoverage('Cite les quatre types.', numbered)).toBeGreaterThan(0);
		expect(enumerationEvidenceCoverage('Explique le type Alpha.', numbered)).toBe(0);
	});

	it('adds an independent fuzzy rank without displacing exact top evidence', () => {
		const exact = { ...hit(1, 'contract', -1), text: 'Le contrat ZX-2048 expire en 2028.' };
		const fuzzy = { ...hit(2, 'contract', -2), text: 'Le contrat ZX-2047 expire en 2029.' };
		expect(refineCandidates([], [exact], 'Quand expire ZX-2048 ?', 2, [fuzzy])[0].chunkId).toBe(1);
	});

	it('uses structural heading context during reranking', () => {
		const get = {
			...hit(1, 'rfc', -1),
			headingPath: '9 Methods > 9.3 Method Definitions > 9.3.1 GET',
			text: 'Requests transfer of a current selected representation.'
		};
		const put = {
			...hit(2, 'rfc', -2),
			headingPath: '9 Methods > 9.3 Method Definitions > 9.3.4 PUT',
			text: 'The PUT method differs from GET.'
		};
		expect(refineCandidates([], [], 'Quelle section définit GET ?', 2, [put, get])[0].chunkId).toBe(
			1
		);
	});

	it('lets a discriminating fuzzy candidate beat unrelated two-channel agreement', () => {
		const compromis = {
			...hit(1, 'compromis', -1),
			documentName: 'Compromis Martin.pdf',
			text: 'PRIX DE LA VENTE exact 146 000 euros'
		};
		const unrelated = { ...hit(2, 'lease', 0.8), text: 'Le locataire résilie son bail.' };
		const result = refineCandidates(
			[unrelated],
			[unrelated],
			'Quel est le prxi de vnete exct du bien Martin ?',
			2,
			[compromis]
		);
		expect(result[0].chunkId).toBe(1);
	});

	it('keeps typoed named-entity evidence ahead of unrelated synthesis distractors', () => {
		const named = {
			...hit(1, 'profile-note', 0.02),
			text: 'Malik Ouedraogo pratique le violoncelle.'
		};
		const distractor = {
			...hit(2, 'framework', 0.05),
			text: 'Activities and status are reviewed across the framework.'
		};
		const result = refineCandidates(
			[distractor, named],
			[distractor],
			'Que sait-on du statut et des activités de Malk Ouedragoo ?',
			2,
			[named]
		);
		expect(result[0].chunkId).toBe(1);
	});

	it('preserves one leading passage per document for synthesis', () => {
		const ranked = [
			{ ...hit(1, 'partie A', 1), documentId: 'a' },
			{ ...hit(2, 'partie A bis', 0.9), documentId: 'a' },
			{ ...hit(3, 'partie B', 0.8), documentId: 'b' }
		];
		const selected = selectWithNeighbors(ranked, [], 'Compare tous les documents', 2);
		expect(new Set(selected.map((item) => item.documentId))).toEqual(new Set(['a', 'b']));
	});

	it('uses a long parent for recall but emits only precise children', () => {
		const parent = {
			...hit(10, 'form', 0.04),
			paraIndex: -1,
			text: 'very long structural parent'
		};
		const relevantChild = {
			...hit(11, 'form', 0),
			parentChunkId: 10,
			paraIndex: null,
			text: 'Système d’alarme : Non. Cohabitant : partenaire.'
		};
		const unrelatedChild = {
			...hit(12, 'form', 0),
			parentChunkId: 10,
			paraIndex: null,
			text: 'Adresse du logement.'
		};
		const expanded = expandStructuralParents(
			[parent],
			[unrelatedChild, relevantChild],
			'alarme cohabitant partenaire'
		);
		expect(expanded[0].chunkId).toBe(11);
		expect(expanded.some((candidate) => candidate.paraIndex === -1)).toBe(false);
	});

	it('keeps final evidence under the local context budget', () => {
		const ranked = Array.from({ length: 10 }, (_, index) => ({
			...hit(index + 1, 'large', 1 - index * 0.01),
			page: index + 1,
			text: `${index} ${'evidence '.repeat(150)}`
		}));
		const selected = selectWithNeighbors(ranked, [], 'résume les éléments', 10, 'synthesis');
		const chars = selected.reduce(
			(sum, item) => sum + item.text.length + item.documentName.length + 40,
			0
		);
		expect(chars).toBeLessThanOrEqual(7200);
	});

	it('keeps four distinct same-page passages for a synthesis list', () => {
		const ranked = [
			{
				...hit(1, 'policy', 0.3),
				page: 48,
				text: 'Droit d’accès et de rectification des données personnelles.'
			},
			{
				...hit(2, 'policy', 0.2),
				page: 48,
				text: 'Droit de suppression et de portabilité des données personnelles.'
			},
			{
				...hit(3, 'policy', 0.1),
				page: 48,
				text: 'Droit de déposer une plainte auprès de la CNIL.'
			},
			{
				...hit(4, 'policy', 0.05),
				page: 48,
				text: 'Droit d’opposition au traitement des données personnelles.'
			}
		];
		const selected = selectWithNeighbors(
			ranked,
			[],
			'Quels droits sont prévus sur les données personnelles ?',
			4,
			'synthesis'
		);
		expect(selected.map((candidate) => candidate.chunkId)).toEqual([1, 2, 3, 4]);
	});

	it('keeps three same-page passages for an explanatory targeted answer', () => {
		const ranked = [
			{ ...hit(1, 'policy', 0.3), page: 5, text: 'La dépréciation est déduite.' },
			{ ...hit(2, 'policy', 0.2), page: 5, text: 'Un complément de 25 % est possible.' },
			{ ...hit(3, 'policy', 0.1), page: 5, text: 'Le complément est payé sur facture.' }
		];
		const selected = selectWithNeighbors(
			ranked,
			[],
			"Comment l'indemnisation tient-elle compte de la dépréciation et du complément ?",
			3,
			'targeted'
		);
		expect(selected.map((candidate) => candidate.chunkId)).toEqual([1, 2, 3]);
	});

	it('keeps all named-entity facts before unrelated document leaders in synthesis', () => {
		const ranked = [
			{ ...hit(1, 'study', 1), text: 'Malik Ouedraogo est étudiant.' },
			{ ...hit(2, 'framework', 0.95), text: 'Status and activities framework.' },
			{ ...hit(3, 'family', 0.9), text: 'Malik Ouedraogo est marié.' },
			{ ...hit(4, 'note', 0.85), text: 'Malik Ouedraogo pratique le violoncelle.' }
		];
		const selected = selectWithNeighbors(
			ranked,
			[],
			'Que sait-on de Malk Ouedragoo ?',
			3,
			'synthesis'
		);
		expect(selected.map((item) => item.documentId)).toEqual(['study', 'family', 'note']);
	});
});

describe('retrieval refinement', () => {
	it('uses explicit numeric structure without encoding document-domain vocabulary', () => {
		expect(isNumericAnswerQuestion('C cbien la cotizasion menssuelle exacte ?')).toBe(true);
		expect(isNumericAnswerQuestion('Qui est le souscripteur ?')).toBe(false);
		expect(
			numericLabelEvidenceCoverage(
				'C cbien la cotizasion menssuelle exacte ?',
				'Votre paiement est de 14,91 € par mois.'
			)
		).toBe(1);
		expect(
			numericLabelEvidenceCoverage(
				'C cbien la cotizasion menssuelle exacte ?',
				'Plafond de garantie : 40 000 €.'
			)
		).toBe(0);
		expect(
			numericAnswerEvidenceCoverage(
				'Quel est le plafond ?',
				'Nous couvrons ce risque jusqu’à 6 000 000 € par an.'
			)
		).toBe(1);
		expect(
			numericAnswerEvidenceCoverage(
				'Quel est le plafond ?',
				'Le plafond est indiqué dans votre offre.'
			)
		).toBe(0);
		expect(numericAnswerEvidenceCoverage('Qui est le souscripteur ?', 'Prime : 14,91 €')).toBe(0);
		expect(
			numericAnswerEvidenceCoverage(
				'Combien de temps la réparation est-elle garantie ?',
				'La réparation coûte 300 €.'
			)
		).toBe(0);
		expect(
			numericAnswerEvidenceCoverage(
				'Combien de temps la réparation est-elle garantie ?',
				'Les réparations sont garanties pendant 12 mois.'
			)
		).toBe(1);
		expect(
			numericAnswerEvidenceCoverage(
				'Combien de temps les données sont-elles conservées ?',
				'En cas de sinistre : deux (2) ans. Dommages corporels : dix (10) ans.'
			)
		).toBe(1);
		expect(
			numericAnswerEvidenceCoverage(
				'C cbien la cotizasion menssuelle exacte ?',
				'Paiement mensuel : 14,91 €.'
			)
		).toBe(1);
		expect(
			numericAnswerEvidenceCoverage(
				'C cbien la cotizasion menssuelle exacte ?',
				'Cotisation payable mensuellement, montant indiqué dans votre offre.'
			)
		).toBe(0);
	});

	it('scores every requested numeric dimension in a compound question', () => {
		const query =
			"Pendant combien de temps et jusqu'à quel montant le logement inhabitable est-il couvert ?";
		expect(
			numericAnswerEvidenceCoverage(
				query,
				'Le logement inhabitable est couvert pendant un an, dans la limite de 2 000 €.'
			)
		).toBe(1);
		expect(
			numericAnswerEvidenceCoverage(query, 'Les données sont conservées pendant deux ans.')
		).toBe(0.5);
	});

	it('treats deadlines and prescription periods as durations, not generic numbers', () => {
		const query = 'Quels délais de prescription s’appliquent en général et pour la sécheresse ?';
		expect(numericAnswerEvidenceCoverage(query, 'La franchise sécheresse est de 1 520 €.')).toBe(0);
		expect(
			numericAnswerEvidenceCoverage(
				query,
				'Le délai est de deux ans en général et de cinq ans pour la sécheresse.'
			)
		).toBe(1);
	});

	it('binds a duration answer to its subject instead of a generic how-long heading', () => {
		const retention = {
			...hit(40, 'policy', 1),
			text: 'Combien de temps conservons-nous vos données ? Deux ans après le contrat.'
		};
		const moving = {
			...hit(41, 'policy', 0.2),
			text: "Pendant un déménagement, l'ancienne adresse reste couverte pendant un mois."
		};
		const selected = selectWithNeighbors(
			[retention, moving],
			[],
			"Combien de temps reste-t-on couvert à l'ancienne adresse pendant un déménagement ?",
			2,
			'targeted'
		);
		expect(selected[0].chunkId).toBe(41);
	});

	it('packs coherent multi-clause evidence before single-clause numeric distractors', () => {
		const retention = {
			...hit(42, 'policy', 1),
			text: 'Les informations du contrat sont conservées pendant deux ans.'
		};
		const renewal = {
			...hit(43, 'policy', 0.2),
			text: 'Le contrat dure un an et est renouvelé automatiquement pour la même durée.'
		};
		const selected = selectWithNeighbors(
			[retention, renewal],
			[],
			'Quelle est la durée du contrat et comment est-il renouvelé ?',
			2,
			'synthesis'
		);
		expect(selected[0].chunkId).toBe(43);
	});

	it('does not let an unrelated enumeration swamp scoped prose evidence', () => {
		const distractor = {
			...hit(1, 'policy', 0.03),
			text: '1. Incendie\n2. Plomberie\n3. Serrurerie\n4. Électricité'
		};
		const scoped = {
			...hit(2, 'policy', 0.02),
			text: "Les garanties contre le cambriolage cessent après plus de 90 jours d'absence."
		};
		expect(
			refineCandidates(
				[distractor, scoped],
				[distractor, scoped],
				"Quelles garanties cessent après plus de 90 jours d'absence ?",
				2,
				[],
				'synthesis'
			)[0].chunkId
		).toBe(2);
	});

	it('preserves exact numeric constraints and typed answer evidence in final selection', () => {
		expect(
			numericConstraintEvidenceCoverage(
				"Quelles garanties cessent après plus de 90 jours d'absence ?",
				"Non couvert après plus de 90 jours d'absence."
			)
		).toBe(1);
		expect(
			numericConstraintEvidenceCoverage(
				"Quelles garanties cessent après plus de 90 jours d'absence ?",
				'Assistance disponible 24 heures sur 24.'
			)
		).toBe(0);
		const generic = {
			...hit(1, 'policy', 0.2),
			text: 'La prime est payable chaque mois selon le montant de votre offre.'
		};
		const exact = {
			...hit(2, 'policy', 0.01),
			text: 'Votre paiement mensuel est de 14,91 €.'
		};
		expect(
			selectWithNeighbors(
				[generic, exact],
				[],
				'C cbien la cotizasion menssuelle exacte ?',
				2,
				'targeted'
			)[0].chunkId
		).toBe(2);
	});

	it('prefers a typo-tolerant labeled value over a higher-scored label-only distractor', () => {
		const distractor = {
			...hit(1, 'policy', 0.2),
			page: 70,
			text: 'Une franchise plus élevée donne une cotisation moins importante : 300 €.'
		};
		const exact = {
			...hit(2, 'quote', 0.01),
			page: 28,
			text: 'Votre paiement de 14,91 € par mois est prélevé mensuellement.'
		};
		const selected = selectWithNeighbors(
			[distractor, exact],
			[],
			'C cbien la cotizasion menssuelle exacte ?',
			1,
			'targeted'
		);
		expect(selected[0].chunkId).toBe(2);
	});

	it('packs the explicit date for a compound request instead of date boilerplate', () => {
		const premium = {
			...hit(1, 'quote', 0.3),
			page: 28,
			text: 'Le paiement mensuel est de 14,91 €.'
		};
		const genericDate = {
			...hit(2, 'policy', 0.2),
			page: 55,
			text: "La garantie débute à la date de prise d'effet indiquée au contrat."
		};
		const exactDate = {
			...hit(3, 'quote', 0.01),
			page: 70,
			text: "PRISE D'EFFET : 14 juillet 2026."
		};
		const selected = selectWithNeighbors(
			[premium, genericDate, exactDate],
			[],
			"Donne le prix mensuel et la date de prise d'effet.",
			2,
			'synthesis'
		);
		expect(selected.map((candidate) => candidate.chunkId)).toContain(3);
		expect(selected.map((candidate) => candidate.chunkId)).not.toContain(2);
	});

	it('packs complementary identity passages for a compound identity request', () => {
		const generic = {
			...hit(1, 'policy', 0.3),
			text: 'Les assurés peuvent contacter le réseau de réparateurs.'
		};
		const named = {
			...hit(2, 'quote', 0.02),
			text: 'Le souscripteur nommé est Idrissa Konaté.'
		};
		const companion = {
			...hit(3, 'quote', 0.01),
			text: 'Le cohabitant déclaré est son partenaire.'
		};
		const selected = selectWithNeighbors(
			[generic, named, companion],
			[],
			'Quel souscripteur est nommé et quel cohabitant a-t-il déclaré ?',
			2,
			'synthesis'
		);
		expect(selected.map((candidate) => candidate.chunkId)).toEqual([2, 3]);
	});

	it('preserves one strong typed value from a minority retrieval channel', () => {
		const exact = {
			...hit(100, 'quote', 0.01),
			text: 'Votre paiement mensuel est de 14,91 €.'
		};
		const distractors = Array.from({ length: 30 }, (_, index) => ({
			...hit(index + 1, 'policy', 0.2 - index * 0.001),
			text: `Plafond générique ${index + 1} : 40 000 €.`
		}));
		expect(
			refineCandidates(
				[...distractors, exact],
				distractors,
				'C cbien la cotizasion menssuelle exacte ?',
				1,
				distractors,
				'targeted'
			)[0].chunkId
		).toBe(100);
	});

	it('preserves high-utility prose evidence from one channel before fusion consensus', () => {
		const exact = {
			...hit(100, 'policy', 0.45),
			text: 'Les objets que vous empruntez ou confiez à un tiers ne sont pas couverts.'
		};
		const distractors = Array.from({ length: 12 }, (_, index) => ({
			...hit(index + 1, 'policy', 0.9 - index * 0.01),
			text: `Les objets couverts sont décrits dans les conditions générales ${index + 1}.`
		}));
		const dense = [...distractors.slice(0, 9), exact, ...distractors.slice(9)];
		const result = refineCandidates(
			dense,
			distractors,
			'Les objets empruntés ou confiés sont-ils couverts ?',
			1,
			distractors,
			'targeted'
		);
		expect(result[0].chunkId).toBe(100);
	});

	it('scores coherent coverage of independent query clauses', () => {
		const query = "Qui assure l'assistance et sur quel territoire s'applique-t-elle ?";
		expect(
			multiClauseEvidenceCoverage(
				query,
				"Les garanties d'assistance sont assurées par AWP P&C sur le territoire de France métropolitaine.",
				'synthesis'
			)
		).toBe(1);
		expect(
			multiClauseEvidenceCoverage(query, "L'assistance est assurée par AWP P&C.", 'synthesis')
		).toBe(0.5);
	});

	it('promotes a same-passage date and time over generic coverage boilerplate', () => {
		const generic = {
			...hit(1, 'policy', 0.03),
			page: 60,
			headingPath: 'Quand commence la couverture ?',
			text: 'La couverture commence à la date indiquée dans la police.'
		};
		const exact = {
			...hit(2, 'policy', 0.02),
			page: 2,
			headingPath: 'Quand ça ?',
			text: 'Les événements survenant après le 14 juillet 2026 à 00:01 sont couverts.'
		};
		const query = expandRetrievalQuery('À quelle date et heure la couverture commence-t-elle ?');
		expect(refineCandidates([generic, exact], [generic, exact], query, 2)[0].page).toBe(2);
	});

	it('preserves an explicit effective date in targeted final packing', () => {
		const numericDistractor = {
			...hit(1, 'policy', 0.3),
			text: 'Prise en charge : 300 € TTC maximum.'
		};
		const genericDate = {
			...hit(2, 'policy', 0.2),
			text: "Période comprise entre la date de prise d'effet et sa résiliation."
		};
		const exactDate = {
			...hit(3, 'quote', 0.01),
			text: 'La couverture débute le 14 juillet 2026.'
		};
		const selected = selectWithNeighbors(
			[numericDistractor, genericDate, exactDate],
			[],
			"Quelle est la date de prise d'effet ?",
			1,
			'targeted'
		);
		expect(selected[0].chunkId).toBe(3);
	});

	it('promotes the complete insured-companion identity over unrelated insurance facts', () => {
		const unrelated = {
			...hit(1, 'policy', 0.03),
			page: 12,
			text: 'Un réseau de réparateurs agréés est disponible pour les assurés.'
		};
		const identity = {
			...hit(2, 'policy', 0.02),
			page: 2,
			headingPath: 'Qui est couvert(e) ?',
			text: 'La présente police couvre Idrissa Konaté et votre partenaire.'
		};
		const query = expandRetrievalQuery('Qui est assuré par ce devis et avec qui ?');
		expect(refineCandidates([unrelated, identity], [unrelated, identity], query, 2)[0].page).toBe(
			2
		);
	});
	it('expands real-estate questions to document vocabulary', () => {
		expect(expandRetrievalQuery('Quel est le prix de la maison ?')).toContain(
			'vente montant euros'
		);
		expect(expandRetrievalQuery('Quel est le montant du prêt ?')).toContain('emprunt financement');
		expect(expandRetrievalQuery('Combien coute la maison ?')).toContain(
			'prix price vente sale montant amount euros'
		);
		expect(expandRetrievalQuery("Qui est l'acheteur et le vendeur ?")).toContain(
			'acheteur acquéreur acquisition partie monsieur madame soussigné'
		);
		expect(expandRetrievalQuery('Quelle est la superficie ?')).toContain(
			'contenance mètres carrés'
		);
	});

	it('promotes the named parties block over repeated boilerplate mentions', () => {
		const parties = {
			...hit(1, 'compromis', 0.027),
			page: 1,
			text: '1) Vendeurs Monsieur Cédric MARTIN et Madame Hélène DUPUIS. 2) Acquéreur Monsieur Idrissa KONATÉ.'
		};
		const boilerplate = {
			...hit(2, 'compromis', 0.03),
			page: 17,
			text: "L'acquéreur informe le vendeur des conditions de la vente."
		};
		const query = expandRetrievalQuery("Qui est l'acheteur et le vendeur ?");
		expect(refineCandidates([boilerplate, parties], [boilerplate, parties], query, 2)[0].page).toBe(
			1
		);
	});

	it.each([
		['Qui sont les vendeurs ?', 1],
		["Qui est l'acheteur ?", 1],
		['Who are the sellers?', 1]
	] as const)('prefers named role evidence for %s', (question, expectedPage) => {
		const named = {
			...hit(1, 'contract', 0.027),
			page: 1,
			text: 'Vendeurs Monsieur Cédric MARTIN et Madame Hélène DUPUIS. Acquéreur Monsieur Idrissa KONATÉ.'
		};
		const generic = {
			...hit(2, 'contract', 0.03),
			page: 7,
			text: 'Le vendeur constructeur et les entrepreneurs ont réalisé les travaux pour le vendeur.'
		};
		const query = expandRetrievalQuery(question);
		expect(refineCandidates([generic, named], [generic, named], query, 2)[0].page).toBe(
			expectedPage
		);
	});

	it('recognizes imperative identity, representation and signature vocabulary', () => {
		expect(expandRetrievalQuery('Identifie les cédants du bien.')).toContain(
			'vendeur cédant propriétaire partie monsieur madame soussigné'
		);
		expect(
			expandRetrievalQuery('Qui est absent, qui le représente et qui est présent ?')
		).toContain('présence représentation absent présent procuration soussigné');
		expect(expandRetrievalQuery('Où et quand le compromis a-t-il été signé ?')).toContain(
			'signature signé date lieu fait à paraphes signatures'
		);
		expect(expandRetrievalQuery('Qui est assuré par ce devis et avec qui ?')).toContain(
			'assuré couverte couvert couvre coassuré partenaire souscripteur'
		);
		expect(
			expandRetrievalQuery('À quelle date et heure la couverture commence-t-elle ?')
		).toContain("date d'effet prise d'effet entrée en vigueur");
	});

	it('expands action-after-claim and declared-attribute questions to structural evidence', () => {
		const claimQuery = expandRetrievalQuery('Que dois-je faire immédiatement après un vol ?');
		expect(claimQuery).toContain('obligations sinistre réclamation');
		expect(claimQuery).toContain('autorités police');
		expect(claimQuery).toContain('preuves justificatifs propriété');
		expect(
			expandRetrievalQuery('Quel objet précis de plus de 5 000 € le souscripteur possède-t-il ?')
		).toContain('possédez-vous déclaré questionnaire objet valeur supérieure');
	});

	it('keeps structural vocabulary in an independent query view', () => {
		expect(retrievalQueryVariants('Où et quand le compromis a-t-il été signé ?')).toEqual([
			'Où et quand le compromis a-t-il été signé ?',
			'signature signé date lieu fait à paraphes signatures'
		]);
	});

	it('adds bounded concrete-term windows for scenario questions', () => {
		const variants = retrievalQueryVariants(
			'Mon ordinateur portable volé dans un café est-il couvert par la garantie de base ?'
		);
		expect(variants).toContain('portable vole cafe');
		expect(variants).toContain('vole cafe couvert');
	});

	it('does not fuzzy-correct the date phrase prise d’effet into price', () => {
		const variants = retrievalQueryVariants("Quelle est la date de prise d'effet ?");
		expect(variants).toContain(
			"date d'effet prise d'effet entrée en vigueur début commence survenant après effective date entry into force starts at"
		);
		expect(variants).not.toContain('prix price vente sale montant amount euros');
		expect(isNumericAnswerQuestion("Quelle est la date de prise d'effet ?")).toBe(false);
	});

	it('searches substantial clauses of a multi-part request independently', () => {
		const variants = retrievalQueryVariants(
			'Donne le total des ventes 2019 et les données American Express nécessaires au calcul.'
		);
		expect(variants).toContain('Donne le total des ventes 2019');
		expect(variants).toContain('les données American Express nécessaires au calcul.');
		const partyVariants = retrievalQueryVariants("Qui est l'acheteur et le vendeur ?");
		expect(partyVariants).toContain("Qui est l'acheteur");
		expect(partyVariants).toContain('le vendeur ?');
	});

	it('does not retrieve an unscoped how-long fragment independently', () => {
		const question =
			"Pendant combien de temps et jusqu'à quel montant les dépenses de logement inhabitable sont-elles couvertes ?";
		expect(retrievalQueryVariants(question)).toEqual([question]);
		expect(denseRetrievalQueryVariants(question, 'synthesis')).toEqual([question]);
	});

	it('keeps sparse expansions out of dense retrieval and splits only broad routes', () => {
		const question = "Qui est l'acheteur et le vendeur ?";
		expect(denseRetrievalQueryVariants(question, 'targeted')).toEqual([question]);
		expect(denseRetrievalQueryVariants(question, 'synthesis')).toEqual([
			question,
			"Qui est l'acheteur",
			'le vendeur ?'
		]);
		expect(
			denseRetrievalQueryVariants('Quel est le prix ?', 'targeted', ['What is the sale price?'])
		).toEqual(['Quel est le prix ?', 'What is the sale price?']);
	});

	it('shares substantial clause decomposition with answer generation', () => {
		expect(
			splitQueryClauses(
				'Donne le total des ventes 2019 et le volume moyen par transaction American Express.'
			)
		).toHaveLength(2);
		expect(splitQueryClauses("Qui est l'acheteur, qui est le vendeur ?")).toEqual([
			"Qui est l'acheteur",
			'qui est le vendeur ?'
		]);
	});

	it('expands typoed bilingual technical concepts without adding an answer', () => {
		expect(expandRetrievalQuery('Quel est le prxi de vnete exct ?')).toContain(
			'prix price vente sale montant amount euros'
		);
		expect(expandRetrievalQuery('Contnet Lenght peut il être négatif ?')).toContain(
			'Content-Length content length field non-negative'
		);
		expect(expandRetrievalQuery('Quel efet a la planifcation de deux vehicules ?')).toContain(
			'flight planning two vehicles effect'
		);
		expect(expandRetrievalQuery("Quelle datte d'entrée en viguer est indiquée ?")).toContain(
			'effective date entry into force'
		);
		expect(expandRetrievalQuery('Quelle sectoin definit GET ?')).toContain(
			'request method definition semantics'
		);
	});

	it('promotes the Martin price, loan and cadastral-area passages', () => {
		const candidates = [
			{ ...hit(1, 'compromis', 0.03), page: 4, text: 'Description générale de immeuble' },
			{
				...hit(2, 'compromis', 0.029),
				page: 3,
				text: 'PRIX DE LA VENTE montant CENT CINQUANTE MILLE EUROS 146.000,00 €'
			},
			{
				...hit(3, 'compromis', 0.029),
				page: 19,
				text: 'FINANCEMENT Montant du prêt 146.000,00 €'
			},
			{
				...hit(4, 'compromis', 0.029),
				page: 2,
				text: 'Une maison à usage habitation, contenance totale 76 ca'
			}
		];
		expect(
			refineCandidates(candidates, candidates, expandRetrievalQuery('prix de la maison'), 4)[0].page
		).toBe(3);
		expect(
			refineCandidates(candidates, candidates, expandRetrievalQuery('montant du prêt'), 4)[0].page
		).toBe(19);
		expect(
			refineCandidates(
				candidates,
				candidates,
				expandRetrievalQuery('superficie de la maison'),
				4
			)[0].chunkId
		).toBe(4);
	});
	it('promotes entity coverage over unrelated early-page candidates', () => {
		const early = { ...hit(1, 'scan', 0.9), page: 2, seq: 1, text: 'Expéditeur ACME numéro 7788' };
		const late = {
			...hit(2, 'scan', 0.7),
			page: 23,
			seq: 22,
			text: 'Destinataire JOHN DOE numéro 4242'
		};
		const result = refineCandidates(
			[early, late],
			[late],
			'Qui est le destinataire JOHN DOE ? Quel est son numéro ?',
			2
		);
		expect(result[0].chunkId).toBe(2);
	});

	it('lets the current follow-up outrank identity context', () => {
		const identity = {
			...hit(1, 'lease', 0.9),
			text: 'Madame Claire Dupont, locataire du logement'
		};
		const rent = {
			...hit(2, 'lease', 0.7),
			text: 'Le loyer mensuel est fixé à huit cent cinquante euros hors charges'
		};
		const result = refineCandidates([identity, rent], [rent], 'Quel est son loyer mensuel ?', 2);
		expect(result[0].chunkId).toBe(2);
	});

	it('adds a useful neighbor and removes duplicate same-page passages', () => {
		const anchor = {
			...hit(20, 'scan', 0.03),
			page: 23,
			seq: 20,
			text: 'Destinataire JOHN DOE'
		};
		const neighbor = {
			...hit(21, 'scan', 0),
			page: 23,
			seq: 21,
			text: 'Compte : 4242'
		};
		const duplicate = { ...hit(22, 'scan', 0.02), page: 23, seq: 22, text: anchor.text };
		const result = selectWithNeighbors(
			[anchor, duplicate],
			[neighbor],
			'Quel est le numéro de JOHN DOE ?',
			8
		);
		expect(result.map((item) => item.chunkId)).toContain(21);
		expect(result.filter((item) => item.text === anchor.text)).toHaveLength(1);
	});

	it('keeps useful context around every fetched anchor, not only the first four', () => {
		const ranked = Array.from({ length: 5 }, (_, index) => ({
			...hit(index + 1, 'policy', 0.05 - index * 0.001),
			seq: index * 10,
			text: `generic anchor ${index}`
		}));
		const neighbor = {
			...hit(99, 'policy', 0),
			seq: 41,
			text: 'Les réparations sont garanties pendant 12 mois.'
		};
		const selected = selectWithNeighbors(
			ranked,
			[neighbor],
			'Combien de temps les réparations sont-elles garanties ?',
			8
		);
		expect(selected.map((item) => item.chunkId)).toContain(99);
	});

	it('isolates neighbors fetched for another batched request', () => {
		const requestedAnchor = { ...hit(1, 'policy', 0.3), seq: 10 };
		const lowerUnrequestedHit = { ...hit(2, 'policy', 0.01), seq: 30 };
		const ownNeighbor = { ...hit(3, 'policy', 0), seq: 11 };
		const foreignNeighbor = { ...hit(4, 'policy', 0), seq: 31 };
		expect(
			neighborsForAnchors([ownNeighbor, foreignNeighbor], [requestedAnchor], 1).map(
				(item) => item.chunkId
			)
		).toEqual([3]);
		expect(lowerUnrequestedHit.seq).toBe(30);
	});

	it('keeps a second-hop neighbor for synthesis and explanatory answers', () => {
		const anchor = {
			...hit(1, 'policy', 0.3),
			seq: 10,
			text: 'Transport et stockage du mobilier.'
		};
		const secondHop = {
			...hit(2, 'policy', 0),
			seq: 12,
			text: 'Le stockage dure 30 jours dans la limite de 500 €.'
		};
		expect(
			selectWithNeighbors(
				[anchor],
				[secondHop],
				'Quels plafonds et durées couvrent le transport et le stockage ?',
				2,
				'synthesis'
			).map((item) => item.chunkId)
		).toContain(2);
		expect(
			selectWithNeighbors(
				[anchor],
				[secondHop],
				'Comment le complément est-il versé ?',
				2,
				'targeted'
			).map((item) => item.chunkId)
		).toContain(2);
	});

	it('keeps a fourth-hop continuation for explanatory conditions', () => {
		const anchor = {
			...hit(1, 'policy', 0.3),
			seq: 10,
			text: 'Le complément de reconstruction est calculé après vétusté.'
		};
		const condition = {
			...hit(2, 'policy', 0),
			seq: 14,
			text: 'Ce complément est versé sur présentation des factures des travaux.'
		};
		expect(
			selectWithNeighbors(
				[anchor],
				[condition],
				'Comment le complément de reconstruction est-il versé ?',
				2,
				'targeted'
			).map((item) => item.chunkId)
		).toContain(2);
	});

	it('packs a substantial explanatory continuation before stronger unrelated matches', () => {
		const anchor = {
			...hit(1, 'policy', 0.3),
			seq: 10,
			text: 'Le complément de reconstruction est calculé après dépréciation et peut atteindre 25 %.'
		};
		const condition = {
			...hit(2, 'policy', 0.01),
			seq: 11,
			text: 'Ce complément est versé après la réalisation complète des travaux, sur présentation des factures, à condition de reconstruire au même endroit dans les deux ans.'
		};
		const distractors = Array.from({ length: 8 }, (_, index) => ({
			...hit(index + 10, 'other', 0.29 - index * 0.01),
			seq: index,
			text: `Une autre garantie prévoit un plafond de 25 % pour le poste ${index}.`
		}));
		const selected = selectWithNeighbors(
			[anchor, ...distractors, condition],
			[],
			'Comment le complément de reconstruction de 25 % est-il versé ?',
			8,
			'targeted'
		);
		expect(selected.map((item) => item.chunkId)).toContain(2);
	});

	it('anchors an explanatory window on a number supplied by the user', () => {
		const generic = {
			...hit(1, 'policy', 0.9),
			page: 24,
			seq: 24,
			text: 'Fournissez les justificatifs demandés pour votre demande d’indemnisation du logement.'
		};
		const scoped = {
			...hit(2, 'policy', 0.4),
			page: 5,
			seq: 5,
			text: 'Après dépréciation, un complément de 25 % du coût de reconstruction peut être payé.'
		};
		const condition = {
			...hit(3, 'policy', 0),
			page: 5,
			seq: 6,
			text: 'Ce complément est payé après réalisation des travaux et sur présentation des factures.'
		};
		const selected = selectWithNeighbors(
			[generic, scoped],
			[condition],
			"Comment l'indemnisation du logement tient-elle compte du complément de 25 % ?",
			3,
			'targeted'
		);
		expect(selected.slice(0, 2).map((item) => item.chunkId)).toEqual([2, 3]);
	});

	it('places the answer-bearing synthesis neighbor before its contextual anchor', () => {
		const anchor = {
			...hit(1, 'policy', 0.3),
			seq: 10,
			text: 'Les catastrophes naturelles et technologiques sont couvertes.'
		};
		const coverageList = {
			...hit(2, 'policy', 0.01),
			seq: 9,
			text: 'Le logement et les biens sont couverts contre les incendies, la fumée, les explosions, les cambriolages, le vandalisme, les tempêtes et les dégâts des eaux.'
		};
		const distractors = Array.from({ length: 8 }, (_, index) => ({
			...hit(index + 10, 'other', 0.29 - index * 0.01),
			seq: index,
			text: `Les exclusions de la garantie contre les dommages sont décrites au chapitre ${index}.`
		}));
		const selected = selectWithNeighbors(
			[anchor, ...distractors, coverageList],
			[],
			'Quels événements endommageant le logement et les biens sont couverts ?',
			4,
			'synthesis'
		);
		expect(selected.slice(0, 2).map((item) => item.chunkId)).toEqual([2, 1]);
	});

	it('keeps evidence for every clause ahead of broad synthesis distractors', () => {
		const general = {
			...hit(1, 'policy', 0.5),
			seq: 10,
			text: "Toute action dérivant du contrat d'assurance est prescrite par deux ans."
		};
		const drought = {
			...hit(2, 'policy', 0.1),
			seq: 40,
			text: 'Les actions relatives à la sécheresse-réhydratation des sols sont prescrites par cinq ans.'
		};
		const distractors = Array.from({ length: 6 }, (_, index) => ({
			...hit(index + 10, 'policy', 0.49 - index * 0.01),
			seq: index + 11,
			text: `La prescription peut être interrompue par une demande en justice, disposition ${index}.`
		}));
		const selected = selectWithNeighbors(
			[general, ...distractors, drought],
			[],
			"Quels délais de prescription s'appliquent en général et pour la sécheresse-réhydratation des sols ?",
			4,
			'synthesis'
		);
		expect(selected.map((item) => item.chunkId)).toContain(1);
		expect(selected.map((item) => item.chunkId)).toContain(2);
	});

	it('preserves near-identical record pages for exhaustive questions only', () => {
		const repeated = (page: number, date: string, amount: string): SearchHit => ({
			...hit(page, 'receipts', 0.04 - page * 0.001),
			page,
			seq: page - 1,
			text: `Récépissé de transfert Expéditeur Exemple Bénéficiaire Exemple Conditions générales identiques Transaction ${date} Montant ${amount} EUR Total ${amount} EUR`
		});
		const pages = [
			repeated(1, '20 juin 2026', '120,00'),
			repeated(2, '12 juin 2026', '80,00'),
			repeated(3, '08 juin 2026', '120,00')
		];
		expect(
			selectWithNeighbors(pages, [], 'Quelle est la somme envoyée en juin ?', 8).map(
				(item) => item.page
			)
		).toEqual([1, 2, 3]);
		expect(
			selectWithNeighbors(pages, [], 'Qui est le bénéficiaire ?', 8).map((item) => item.page)
		).toHaveLength(1);
	});

	it('weights names and numbers as discriminating terms', () => {
		expect(queryCoverage('numéro JOHN DOE 4242', 'JOHN DOE porte le numéro 4242')).toBeGreaterThan(
			queryCoverage('numéro JOHN DOE 4242', 'numéro expéditeur 7788')
		);
		expect(queryCoverage('Quel numéro ?', 'Numero de compte')).toBeGreaterThan(0);
	});

	it('anchors synthesis context on the requested subject instead of a generic duration', () => {
		const retention = {
			...hit(1, 'policy', 0.9),
			page: 49,
			seq: 49,
			text: 'Les données personnelles sont conservées deux ans après le contrat.'
		};
		const subject = {
			...hit(2, 'policy', 0.5),
			page: 16,
			seq: 16,
			text: 'Les dépenses supplémentaires sont couvertes si le logement reste inhabitable.'
		};
		const condition = {
			...hit(3, 'policy', 0),
			page: 16,
			seq: 15,
			text:
				"La prise en charge dure au maximum un an et s'élève à 2 000 €. " +
				'Cette condition complète immédiatement la clause relative au logement inhabitable.'
		};
		const selected = selectWithNeighbors(
			[retention, subject],
			[condition],
			'Pendant combien de temps et jusqu’à quel montant les dépenses de logement inhabitable sont-elles couvertes ?',
			8,
			'synthesis'
		);
		expect(selected.slice(0, 2).map((item) => item.chunkId)).toEqual([2, 3]);
	});

	it('prioritizes a passage covering the full conditional question', () => {
		const deductible = {
			...hit(1, 'policy', 0.9),
			text: 'La franchise est fixée à 300 € et reste à la charge de l’assuré.'
		};
		const remedy = {
			...hit(2, 'policy', 0.4),
			text: "Aucun recours n'est exercé lorsque le dommage est inférieur à la franchise."
		};
		const selected = selectWithNeighbors(
			[deductible, remedy],
			[],
			'Un recours est-il exercé si le dommage est inférieur à la franchise ?',
			8,
			'targeted'
		);
		expect(selected[0].chunkId).toBe(2);
	});

	it('keeps every scanned page eligible and returns a late recipient fact', () => {
		const chunks = chunkBlocks(
			Array.from({ length: 30 }, (_, index) => ({
				text:
					index === 22
						? 'Destinataire JOHN DOE numéro de compte 4242'
						: index < 4
							? `Expéditeur ACME numéro ${7700 + index}`
							: `Conditions générales section ${index + 1}`,
				page: index + 1,
				charStart: 0,
				charEnd: 80
			})),
			'scan-30-pages.pdf'
		);
		expect(new Set(chunks.map((chunk) => chunk.page)).size).toBe(30);

		const candidates = chunks.map((chunk, index) => ({
			...hit(index + 1, 'scan', 0.9 - index * 0.01),
			page: chunk.page,
			seq: chunk.seq,
			text: chunk.text
		}));
		const late = candidates[22];
		const result = refineCandidates(
			candidates,
			[late],
			'Qui est le destinataire JOHN DOE ? Quel est son numéro de compte ?',
			8
		);
		expect(result.map((item) => item.page)).toContain(23);
		expect(result[0].text).toContain('JOHN DOE');
		expect(result[0].text).not.toContain('Expéditeur');
	});
});

describe('expected answer type for contact atoms', () => {
	// Regression: a passage that echoes the question's wording without carrying
	// an address outranked the terse chunk that held it, because every
	// overlap feature is monotone in question-chunk similarity.
	const GOLD = 'Destinataire :\nservice-visas@consulat-exemple.org';
	const ECHO =
		'Je souhaite recevoir les documents sous format électronique PDF à l’adresse e-mail utilisée pour la présente demande';

	it('separates a passage carrying the requested identifier from one that only echoes it', () => {
		const question = 'Quelle adresse mail dois-je joindre pour la demande de documents ?';
		expect(contactAnswerEvidenceCoverage(question, GOLD)).toBe(1);
		expect(contactAnswerEvidenceCoverage(question, ECHO)).toBe(0);
	});

	it('covers phone and url atoms', () => {
		expect(
			contactAnswerEvidenceCoverage('Quel est le téléphone ?', 'Tel : +33 1 41 86 09 69')
		).toBe(1);
		expect(contactAnswerEvidenceCoverage('Quel est le téléphone ?', 'Appelez le service')).toBe(0);
		expect(
			contactAnswerEvidenceCoverage('Quel est le site web ?', 'Voir https://www.orangemoney.fr')
		).toBe(1);
	});

	// Regression: these all scored 1 and hijacked the answer. A phone number or a
	// URL sits in the letterhead of nearly every real document, so the value half
	// of the guard filters nothing — the question wording is the whole gate, and
	// it matched French words that merely share a spelling with an identifier.
	// Shipped once: a question about an amount was answered with a phone number.
	it('does not fire on ordinary French that merely resembles an identifier', () => {
		const letterhead = 'Cabinet Durand, 01 42 55 66 77. Montant annuel : 1 200 EUR';
		const withUrl = 'Surface : 4 200 m2. Voir https://exemple.fr/a';
		expect(contactAnswerEvidenceCoverage("Quel est le montant tel qu'indiqué ?", letterhead)).toBe(
			0
		);
		expect(
			contactAnswerEvidenceCoverage("Quel est le lien entre l'article 5 et l'annexe B ?", withUrl)
		).toBe(0);
		expect(
			contactAnswerEvidenceCoverage('Quelle est la surface du site industriel ?', withUrl)
		).toBe(0);
		expect(contactAnswerEvidenceCoverage('Le mobilier mobile est-il couvert ?', letterhead)).toBe(
			0
		);
	});

	// The correction prompt names the literal value, so extraction has to return
	// the identifier itself and nothing when the question asked for another type.
	it('returns the carried identifier for the asked type only', () => {
		expect(contactAnswerValues('Quelle adresse mail joindre ?', GOLD)).toEqual([
			'service-visas@consulat-exemple.org'
		]);
		expect(contactAnswerValues('Quelle adresse mail joindre ?', ECHO)).toEqual([]);
		expect(contactAnswerValues('Quel est le téléphone ?', GOLD)).toEqual([]);
	});

	it('stays inert when the question names no contact atom', () => {
		expect(contactAnswerEvidenceCoverage('Qui est le destinataire ?', GOLD)).toBe(0);
		expect(contactAnswerEvidenceCoverage('Quel est le montant ?', GOLD)).toBe(0);
	});

	// Regression: "Quels sont les numeros de demandes ?" answered "1, 2, …, 10".
	// The carriers (réf. FILE-REF…) never reached the excerpts — passages dense in
	// the WORD "demande" (a numbered list of requests to make) crowded them out,
	// and the model enumerated the list ordinals. The reference shape puts the
	// carrier back; the list itself must never count as a carrier.
	it('recognises reference identifiers and rejects list ordinals', () => {
		const carrier = 'Une première demande (réf. FILE-REF-A-0000001), déposée le 1er juillet';
		const list =
			'Demande exactement : 1. une copie intégrale certifiée de l’acte ; 2. la procuration';
		const q = 'Quels sont les numeros de demandes ?';
		expect(contactAnswerEvidenceCoverage(q, carrier)).toBe(1);
		expect(contactAnswerValues(q, carrier)).toEqual(['FILE-REF-A-0000001']);
		expect(contactAnswerEvidenceCoverage(q, list)).toBe(0);
		expect(
			contactAnswerEvidenceCoverage('Quel est le numéro de dossier ?', 'Dossier n° 536431')
		).toBe(1);
		// Adjacent types stay independent: a phone question is not fed references,
		// and a date/amount question never enters this shape at all.
		expect(contactAnswerEvidenceCoverage('Quel est le numéro de téléphone ?', carrier)).toBe(0);
		expect(contactAnswerEvidenceCoverage('Quelle est la date de la demande ?', carrier)).toBe(0);
	});

	// Selection rebuilds its own order from raw score, so the partition has to
	// hold here too: ranking the carrier first upstream is not enough.
	it('selects the carrier over a higher-scored echo within a one-passage budget', () => {
		const gold = { ...hit(1, 'demande', 0.1), seq: 1, text: GOLD };
		const echo = { ...hit(2, 'demande', 0.9), seq: 8, text: ECHO };
		const selected = selectWithNeighbors(
			[echo, gold],
			[],
			'Quelle adresse mail dois-je joindre pour la demande de documents ?',
			1
		);
		expect(selected.map((item) => item.chunkId)).toEqual([1]);
	});
});

// Benchmark case complaint-response: "Sous quels délais AWP accuse-t-il
// réception d'une réclamation écrite et répond-il ?" — the carrier ("dix (10)
// jours ouvrables … deux (2) mois") was IN the sent evidence and the model
// still answered only the response delay, dropping the acknowledgment. The
// duration gate mirrors the contact gate: count what the question asks,
// judge the draft, hand the retry the literal missing value.
describe('duration answer gate', () => {
	const complaintQuestion =
		'Sous quels délais AWP accuse-t-il réception d’une réclamation écrite et répond-il ?';
	const carrierText =
		'AWP accuse réception de la réclamation écrite dans les dix (10) jours ouvrables suivant sa ' +
		'réception et y répond dans les deux (2) mois suivant la date de réception de la réclamation.';

	it('counts one deadline per part, the elliptical verb echo included', () => {
		expect(requestedDurationCount(complaintQuestion)).toBe(2);
		// Single-deadline questions gate nothing, whatever their clause count.
		expect(
			requestedDurationCount(
				'Mes biens restent-ils couverts pendant un voyage à l’étranger, et pendant combien de temps ?'
			)
		).toBe(1);
		expect(
			requestedDurationCount('Quand peut-on saisir le médiateur et quel est le dernier délai ?')
		).toBe(1);
		expect(requestedDurationCount('Combien de temps dure la garantie ?')).toBe(1);
		expect(requestedDurationCount('Quel est le montant de la franchise ?')).toBe(0);
	});

	it('extracts distinct duration values across spellings and languages', () => {
		expect(durationValueMentions(carrierText).map((m) => m.key)).toEqual(['10 jour', '2 mois']);
		// "dix (10) jours" and "10 jours" are the same value, not two.
		expect(
			durationValueMentions('dix (10) jours ouvrables, puis 10 jours au plus').map((m) => m.key)
		).toEqual(['10 jour']);
		// Speeds and bare numbers are not durations.
		expect(durationValueMentions('des tempêtes de plus de 100 km/h et 40 000 €')).toEqual([]);
	});

	it('finds the question-covering excerpt carrying the missing value', () => {
		const draft = 'AWP répond à la réclamation dans les deux (2) mois. [2]';
		const unrelated = {
			text: 'La garantie constructeur est de deux (2) ans et la prescription de cinq (5) ans.',
			headingPath: null
		};
		const carrier = { text: carrierText, headingPath: 'Réclamation' };
		const found = missingDurationCarrier(complaintQuestion, draft, [unrelated, carrier]);
		expect(found).toEqual({ index: 1, literal: 'dix (10) jours ouvrables' });
		// A draft already stating both deadlines needs no retry.
		expect(
			missingDurationCarrier(
				complaintQuestion,
				'Accusé de réception sous dix (10) jours ouvrables, réponse sous deux (2) mois. [1]',
				[carrier]
			)
		).toBeNull();
		// A single-deadline question never fires, even with a partial draft.
		expect(missingDurationCarrier('Quel est le délai de réponse ?', draft, [carrier])).toBeNull();
	});
});

// Benchmark case covered-events: the enumeration opens in one chunk ("…contre
// les incendies, la fumée,") and every remaining peril lives in its direct
// continuation, which shares no word with the question and ranks far below
// the packing cutoff. A selected anchor that visibly ends mid-sentence pulls
// its successor in right behind it.
describe('synthesis mid-sentence continuation', () => {
	it('keeps the continuation of an early anchor that ends mid-enumeration', () => {
		const query =
			'Quels principaux événements endommageant le logement ou les biens sont couverts ?';
		const filler =
			'Nous couvrons les biens endommagés suite à ces événements, dans la limite des plafonds ' +
			'indiqués, lorsque le logement ou les biens sont endommagés par un événement couvert par la police.';
		const anchor = {
			...hit(1, 'policy', 0.9),
			seq: 10,
			text: 'Le logement et les biens sont couverts contre les événements suivants : les incendies, la fumée,'
		};
		const continuation = {
			...hit(2, 'policy', 0.01),
			seq: 11,
			text: 'les explosions, les surtensions électriques, le cambriolage et le vandalisme.'
		};
		const windows = [3, 4, 5, 6].map((chunkId, index) => ({
			...hit(chunkId, 'policy', 0.5 - index * 0.1),
			seq: 12 + index,
			text: `${filler} (${chunkId})`
		}));
		const selected = selectWithNeighbors(
			[anchor, ...windows, continuation],
			[],
			query,
			5,
			'synthesis'
		);
		expect(selected.map((item) => item.chunkId)).toContain(2);
		// The anchor itself stays; the continuation displaces a tail filler only.
		expect(selected.map((item) => item.chunkId)).toContain(1);
	});
});

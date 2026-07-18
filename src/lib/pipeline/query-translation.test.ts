import { describe, expect, it, vi } from 'vitest';
import {
	cleanRetrievalQueryVariants,
	cleanTranslatedQuery,
	crossLingualQueryVariants,
	hasClauseLevelLexicalEvidence,
	hasDistinctiveLexicalEvidence,
	localRetrievalQueryVariants,
	preservesQueryConstraints,
	retrieveWithLocalQueryFallback
} from './query-translation';
import type { SearchHit } from '$lib/types';

const hit = (chunkId: number, text: string, score = 0.04): SearchHit => ({
	chunkId,
	documentId: 'document',
	documentName: 'document.pdf',
	text,
	page: 1,
	headingPath: null,
	score
});

describe('crossLingualQueryVariants', () => {
	it('adds a model-translated view for French queries over English documents', async () => {
		const translate = vi.fn().mockResolvedValue('English translation: Which line is total income?');
		await expect(
			crossLingualQueryVariants('Quelle ligne donne le revenu total ?', ['en'], translate)
		).resolves.toEqual(['Which line is total income?']);
		expect(translate).toHaveBeenCalledOnce();
	});

	it('does not translate same-language or unknown-language searches', async () => {
		const translate = vi.fn();
		await expect(
			crossLingualQueryVariants('What is the total?', ['en'], translate)
		).resolves.toEqual([]);
		await expect(
			crossLingualQueryVariants('Quel est le total ?', ['fr', null], translate)
		).resolves.toEqual([]);
		expect(translate).not.toHaveBeenCalled();
	});

	it('rejects answers and malformed output', () => {
		expect(cleanTranslatedQuery('I cannot answer this query.', 'Question ?')).toBeNull();
		expect(cleanTranslatedQuery('x'.repeat(401), 'Question ?')).toBeNull();
	});

	it('adds same-language retrieval labels without replacing the original query', async () => {
		const rewrite = vi
			.fn()
			.mockResolvedValue(
				'Query: prise effet garanties date heure\nEnglish: policy effective date time'
			);
		await expect(
			localRetrievalQueryVariants('Quand commence la couverture ?', ['fr', 'en'], rewrite)
		).resolves.toEqual(['prise effet garanties date heure', 'policy effective date time']);
		expect(rewrite).toHaveBeenCalledOnce();
	});

	it('cleans numbered variants, duplicates and accidental answers', () => {
		expect(
			cleanRetrievalQueryVariants(
				'1. Search: options ajoutées non ajoutées\n- options ajoutées non ajoutées\nRéponse: elles sont ajoutées',
				'Quelles options ?'
			)
		).toEqual(['options ajoutées non ajoutées']);
	});

	it('keeps search variants that merely contain the words "réponse"/"answer"', () => {
		expect(
			cleanRetrievalQueryVariants(
				'délai de réponse assureur sinistre garantie',
				'Quel est le délai de réponse ?'
			)
		).toEqual(['délai de réponse assureur sinistre garantie']);
		expect(
			cleanTranslatedQuery('the insurer must answer the claim within 15 days', 'Quel délai ?')
		).toBe('the insurer must answer the claim within 15 days');
	});

	it('still rejects refusals and leading answer labels', () => {
		expect(
			cleanRetrievalQueryVariants('Je ne peux pas répondre à cette question', 'Quel délai ?')
		).toEqual([]);
		expect(cleanTranslatedQuery('Réponse : le délai est de 15 jours', 'Quel délai ?')).toBeNull();
	});

	it('does not rewrite when the original query already retrieves answer evidence', async () => {
		const rewrite = vi.fn();
		const retrieve = vi
			.fn()
			.mockResolvedValue([hit(1, 'La cotisation mensuelle est de 14,91 euros.')]);

		await expect(
			retrieveWithLocalQueryFallback({
				query: 'Quelle est la cotisation mensuelle ?',
				documentLanguages: ['fr'],
				rewrite,
				retrieve
			})
		).resolves.toEqual({ hits: expect.any(Array), alternateQueries: [] });
		expect(retrieve).toHaveBeenCalledOnce();
		expect(retrieve).toHaveBeenCalledWith([]);
		expect(rewrite).not.toHaveBeenCalled();
	});

	it('requires direct concept evidence for each substantive multi-part clause', () => {
		const unrelatedLimits = [
			hit(1, 'La franchise réduit le paiement mensuel et certaines limites ne s’appliquent pas.')
		];
		expect(
			hasClauseLevelLexicalEvidence(
				"En cas de sous-assurance, appliquez-vous une règle proportionnelle et jusqu'à quelle limite payez-vous ?",
				unrelatedLimits
			)
		).toBe(false);
		expect(
			hasClauseLevelLexicalEvidence(
				"Mes biens sont-ils couverts à l'étranger, et pendant combien de temps ?",
				[hit(2, 'Vos biens sont couverts à l’étranger pour une durée inférieure à trois mois.')]
			)
		).toBe(true);
	});

	it('does not accept a generic exclusion that drops concrete scenario terms', async () => {
		const generic = [
			hit(1, 'Les équipements professionnels comme un ordinateur portable ne sont pas couverts.')
		];
		const exact = [
			hit(2, "Si quelqu'un s'empare de votre ordinateur portable à un café, ce n'est pas couvert.")
		];
		expect(
			hasDistinctiveLexicalEvidence(
				'Mon ordinateur portable volé dans un café est-il couvert ?',
				generic
			)
		).toBe(false);
		const retrieve = vi.fn().mockResolvedValueOnce(generic).mockResolvedValueOnce(exact);
		await expect(
			retrieveWithLocalQueryFallback({
				query: 'Mon ordinateur portable volé dans un café est-il couvert ?',
				documentLanguages: ['fr'],
				rewrite: vi.fn().mockResolvedValue('ordinateur portable volé café couverture'),
				retrieve
			})
		).resolves.toEqual({
			hits: exact,
			alternateQueries: ['ordinateur portable volé café couverture']
		});
	});

	it('labels the current question for the rewrite and binds constraints to it', async () => {
		// The previous ANSWER's numbers must not be forced into variants, and the
		// model must be told which line is the question to rewrite.
		const composed =
			"Quel est le plafond d'hôtel par nuit ?\nLe plafond est de 150 € TTC, 3 nuits par sinistre\nEt sa limite en nombre de nuits ?";
		const rewrite = vi.fn().mockResolvedValue('hébergement nombre de nuits limite par sinistre');
		const variants = await localRetrievalQueryVariants(
			composed,
			['fr'],
			rewrite,
			'Et sa limite en nombre de nuits ?'
		);
		expect(variants).toEqual(['hébergement nombre de nuits limite par sinistre']);
		const [messages] = rewrite.mock.calls[0];
		expect(messages[1].content).toContain('Question: Et sa limite en nombre de nuits ?');
		expect(messages[0].content).toContain('Rewrite only the final question');
	});

	it('judges evidence on the current question when a follow-up composes the query', async () => {
		// Regression: a follow-up retrieves with the composed conversation query.
		// Primary hits covering only the previous turn's words (name, address)
		// used to satisfy every gate, so the rewrite never ran and the actual
		// question went unserved.
		const composed =
			"Comment s'appelle la demandeuse ?\nLa demandeuse s'appelle Aminata Keita\nQuel est son métier ?";
		const primary = [
			hit(1, 'La demandeuse Aminata Keita réside à BAMAKO, adresse électronique, téléphone.')
		];
		const fallback = [
			hit(2, '21. Activité professionnelle actuelle Employé 22. Employeur (Nom, adresse)')
		];
		const retrieve = vi.fn().mockResolvedValueOnce(primary).mockResolvedValueOnce(fallback);
		await expect(
			retrieveWithLocalQueryFallback({
				query: composed,
				refinementQuery: 'Quel est son métier ?',
				documentLanguages: ['fr'],
				rewrite: vi.fn().mockResolvedValue('activité professionnelle actuelle profession métier'),
				retrieve
			})
		).resolves.toEqual({
			hits: fallback,
			alternateQueries: ['activité professionnelle actuelle profession métier']
		});
	});

	it('retries a weak original query and accepts a grounded rewrite', async () => {
		const primary = [hit(1, 'Conditions générales sans information recherchée.', 0.01)];
		const fallback = [hit(2, 'La cotisation mensuelle est de 14,91 euros.')];
		const rewrite = vi.fn().mockResolvedValue('cotisation mensuelle prix');
		const retrieve = vi.fn().mockResolvedValueOnce(primary).mockResolvedValueOnce(fallback);

		await expect(
			retrieveWithLocalQueryFallback({
				query: "C cbien l'assurance par mois ?",
				documentLanguages: ['fr'],
				rewrite,
				retrieve
			})
		).resolves.toEqual({ hits: fallback, alternateQueries: ['cotisation mensuelle prix'] });
		expect(retrieve).toHaveBeenNthCalledWith(1, []);
		expect(retrieve).toHaveBeenNthCalledWith(2, ['cotisation mensuelle prix']);
	});

	it('keeps stronger structured primary evidence when rewrite drifts to a generic rule', async () => {
		const primary = [
			hit(1, "Possédez-vous au moins un objet d'une valeur supérieure à 5 000 € : Oui")
		];
		const fallback = [
			hit(2, 'Chaque objet est couvert dans la limite générale de 5 000 € par article.')
		];
		const retrieve = vi.fn().mockResolvedValueOnce(primary).mockResolvedValueOnce(fallback);

		await expect(
			retrieveWithLocalQueryFallback({
				query: 'Quel objet précis de plus de 5 000 € le souscripteur possède-t-il ?',
				documentLanguages: ['fr'],
				rewrite: vi.fn().mockResolvedValue('objet de valeur supérieur à 5 000 euros'),
				retrieve
			})
		).resolves.toEqual({ hits: primary, alternateQueries: [] });
	});

	it('rejects an ungrounded rewrite retry and preserves the original result', async () => {
		const primary = [hit(1, 'Conditions générales.', 0.01)];
		const fallback = [hit(2, 'Une réponse commerciale sans numéro de contrat.', 0.01)];
		const retrieve = vi.fn().mockResolvedValueOnce(primary).mockResolvedValueOnce(fallback);

		await expect(
			retrieveWithLocalQueryFallback({
				query: 'Quel est le numéro exact du contrat ?',
				documentLanguages: ['fr'],
				rewrite: vi.fn().mockResolvedValue('numéro contrat police'),
				retrieve
			})
		).resolves.toEqual({ hits: primary, alternateQueries: [] });
	});

	it('rejects rewrites that drop numbers, negation or strict scope', async () => {
		expect(
			preservesQueryConstraints(
				'Les garanties ne cessent pas après plus de 90 jours.',
				'garanties habitation exclusions durée'
			)
		).toBe(false);
		expect(
			preservesQueryConstraints(
				'Les garanties ne cessent pas après plus de 90 jours.',
				'garanties ne cessent pas après plus de 90 jours'
			)
		).toBe(true);
		await expect(
			localRetrievalQueryVariants(
				'Option non ajoutée après 30 jours ?',
				['fr'],
				async () => 'option ajoutée délai\noption non ajoutée après 30 jours'
			)
		).resolves.toEqual(['option non ajoutée après 30 jours']);
	});

	it('rejects a grounded-looking fallback that drops a multi-part clause', async () => {
		const primary = [hit(1, 'Conditions générales.', 0.01)];
		const fallback = [hit(2, 'Vos biens sont couverts à l’étranger.')];
		const retrieve = vi.fn().mockResolvedValueOnce(primary).mockResolvedValueOnce(fallback);
		await expect(
			retrieveWithLocalQueryFallback({
				query: "Quels biens sont couverts à l'étranger, et quelles exclusions s'appliquent ?",
				documentLanguages: ['fr'],
				rewrite: vi.fn().mockResolvedValue('biens couverts étranger exclusions'),
				retrieve
			})
		).resolves.toEqual({ hits: primary, alternateQueries: [] });
	});
});

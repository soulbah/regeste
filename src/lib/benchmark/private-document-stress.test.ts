import { describe, expect, it } from 'vitest';
import {
	answerMatchesStressOracle,
	assertPrivateDocumentStressPages,
	matchesAnswerAlternative,
	matchesForbiddenAnswerAlternative,
	parsePrivateDocumentStressMatrix,
	runPrivateDocumentRetrievalStress,
	runPrivateDocumentStress
} from './private-document-stress';

describe('private document stress matrix', () => {
	it('ignores numeric formatting and library-stemmed inflections without adding synonyms', () => {
		expect(matchesAnswerAlternative('Appelez le 0801 840 506.', '0 801 840 506')).toBe(true);
		expect(matchesAnswerAlternative('Appelez le +33 801 840 506.', '801 840 506')).toBe(true);
		expect(matchesAnswerAlternative('Les dégâts des eaux cessent.', 'degat des eaux')).toBe(true);
		expect(
			matchesAnswerAlternative('Cette activité est explicitement exceptée.', 'exception')
		).toBe(true);
		expect(matchesAnswerAlternative('Aucune vétusté appliquée.', 'depreciation')).toBe(false);
		expect(matchesAnswerAlternative('Premier fait : 40.\nAutre fait : 000.', '40 000')).toBe(false);
		expect(
			matchesAnswerAlternative('1. Idrissa Konaté\n2. 12/03/1994\n3. Dabou', '12/03/1994')
		).toBe(true);
		expect(
			matchesAnswerAlternative('La prise en charge dure au maximum un an.', 'maximum d un an')
		).toBe(true);
		expect(
			matchesAnswerAlternative("Le plafond vaut 40 000 € par événement durant l'année.", 'un an')
		).toBe(false);
		expect(matchesAnswerAlternative('The cover lasts one year.', '1 year')).toBe(true);
		expect(matchesAnswerAlternative('Le délai est de deux (2) ans.', 'deux ans')).toBe(true);
	});

	it('reads one cell of a table row, and an amount as a value', () => {
		// Every digit, space, dot and comma used to form one run, so this row
		// collapsed into a single 24-digit token: no individual cell was ever
		// visible and a payment schedule could not be scored at all.
		const row = '1 05.11.2025 14 949,07 69,39 50,93 18,46';
		expect(matchesAnswerAlternative(row, '69,39')).toBe(true);
		expect(matchesAnswerAlternative(row, '50,93')).toBe(true);
		expect(matchesAnswerAlternative(row, '14 949,07')).toBe(true);
		expect(matchesAnswerAlternative(row, '05.11.2025')).toBe(true);
		// A neighbouring cell is not this cell, and a value spanning two of them
		// never existed.
		expect(matchesAnswerAlternative(row, '76,25')).toBe(false);
		expect(matchesAnswerAlternative(row, '9 936')).toBe(false);
		// Cents and trailing decimals are formatting, not a different amount.
		expect(matchesAnswerAlternative('Montant du crédit : 15 000,00', '15 000')).toBe(true);
		expect(matchesAnswerAlternative('Taux : 1,9900', '1,99')).toBe(true);
		expect(matchesAnswerAlternative('Frais de dossier 180,00', '180')).toBe(true);
		// Identifiers group their digits however the document pleases.
		expect(matchesAnswerAlternative('Depuis l’étranger : +33 801 840506', '801 840 506')).toBe(
			true
		);
	});

	it('keeps polarity words exact for forbidden failure phrases', () => {
		expect(
			matchesForbiddenAnswerAlternative(
				'Les appareils électroniques ne sont pas couverts.',
				'ne sont couverts que si'
			)
		).toBe(false);
		expect(
			matchesForbiddenAnswerAlternative(
				'Les appareils ne sont couverts que si une option est ajoutée.',
				'ne sont couverts que si'
			)
		).toBe(true);
		// A polar token must not be found inside a longer word: substring matching
		// scored "non" as present in "renonciation" and "pas" in "passage", which
		// turned an answer saying the opposite into a match.
		expect(matchesForbiddenAnswerAlternative('Le délai de renonciation court.', 'non')).toBe(false);
		expect(matchesForbiddenAnswerAlternative('Ce passage est couvert.', 'pas')).toBe(false);
		expect(matchesForbiddenAnswerAlternative('Ce risque est non couvert.', 'non')).toBe(true);
		// Truncated stems stay deliberate: one alternative still covers a family
		// of inflections, as long as the stem is long enough to be unambiguous.
		expect(matchesAnswerAlternative('Le délai de renonciation court.', 'renon')).toBe(true);
		expect(matchesAnswerAlternative('Le sinistre a été déclaré.', 'declar')).toBe(true);
	});

	it('reuses cached answers only when current lexical oracle still passes', () => {
		const test = {
			id: 'amount',
			question: 'Quel montant ?',
			answerable: true,
			pageGroups: [[1]],
			answerGroups: [['42 €']],
			forbiddenAnswerGroups: [['non couvert']]
		};
		expect(answerMatchesStressOracle(test, 'Le montant est 42 € [1].')).toBe(true);
		expect(answerMatchesStressOracle(test, 'Le montant est 41 € [1].')).toBe(false);
		expect(answerMatchesStressOracle(test, '42 € mais non couvert [1].')).toBe(false);
	});

	it('validates a runtime-only oracle without persisting private document facts', () => {
		expect(
			parsePrivateDocumentStressMatrix({
				documentName: 'local.pdf',
				cases: [
					{
						id: 'amount',
						question: 'What is the amount?',
						answerable: true,
						pageGroups: [[2, 3]],
						answerGroups: [['42 EUR', '€42']],
						forbiddenAnswerGroups: [['repair network']]
					}
				]
			})
		).toMatchObject({ documentName: 'local.pdf', cases: [{ id: 'amount' }] });
	});

	it('distinguishes a cited qualified answer from an uncited refusal', () => {
		const matrix = parsePrivateDocumentStressMatrix({
			documentName: 'local.pdf',
			cases: [
				{
					id: 'alarm',
					question: 'Quelle est la marque de l’alarme ?',
					answerable: true,
					expectedOutcome: 'qualified',
					pageGroups: [[4]],
					answerGroups: [['alarme'], ['non', 'pas installee']]
				}
			]
		});
		expect(matrix.cases[0].expectedOutcome).toBe('qualified');
	});

	it('runs the retrieval gate independently and concurrently', async () => {
		let active = 0;
		let peak = 0;
		const report = await runPrivateDocumentRetrievalStress({
			documentId: 'doc',
			cases: [1, 2, 3, 4].map((page) => ({
				id: `case-${page}`,
				question: `Fact ${page}?`,
				answerable: true,
				pageGroups: [[page]],
				answerGroups: [[`fact ${page}`]]
			})),
			concurrency: 2,
			resolveRoute: async () => 'targeted',
			retrieve: async (question) => {
				active++;
				peak = Math.max(peak, active);
				await new Promise((resolve) => setTimeout(resolve, 2));
				active--;
				const page = Number(question.match(/\d+/)?.[0]);
				return {
					alternateQueries: [],
					hits: [
						{
							chunkId: page,
							documentId: 'doc',
							documentName: 'local.pdf',
							text: `fact ${page}`,
							page,
							headingPath: null,
							score: 1
						}
					]
				};
			}
		});

		expect(report.passed).toBe(4);
		expect(peak).toBe(2);
	});

	it('keeps raw candidates when the evidence gate refuses them', async () => {
		const report = await runPrivateDocumentRetrievalStress({
			documentId: 'doc',
			cases: [
				{
					id: 'phone',
					question: 'Quel est le téléphone exact du souscripteur ?',
					answerable: true,
					pageGroups: [[2]],
					answerGroups: [['0600000000']]
				}
			],
			resolveRoute: async () => 'targeted',
			retrieve: async () => ({
				alternateQueries: [],
				hits: [
					{
						chunkId: 1,
						documentId: 'doc',
						documentName: 'local.pdf',
						text: 'Veuillez fournir le téléphone du souscripteur.',
						page: 2,
						headingPath: null,
						score: 1
					}
				]
			})
		});

		expect(report.results[0].answerBearing).toBe(false);
		expect(report.results[0].hits).toEqual([]);
		expect(report.results[0].rawHits).toHaveLength(1);
		expect(report.results[0].pageRecallPassed).toBe(true);
		expect(report.results[0].answerGroupTriagePassed).toBe(false);
	});

	it('still generates when lexical oracle alternatives miss answer-bearing evidence', async () => {
		let generated = false;
		const report = await runPrivateDocumentStress({
			documentId: 'doc',
			cases: [
				{
					id: 'paraphrase',
					question: 'Les appareils électroniques en dépendance sont-ils couverts ?',
					answerable: true,
					pageGroups: [[9]],
					answerGroups: [['formulation absente de cet oracle volontairement']]
				}
			],
			retrieve: async () => ({
				alternateQueries: [],
				hits: [
					{
						chunkId: 1,
						documentId: 'doc',
						documentName: 'local.pdf',
						text: 'Les appareils électroniques volés laissés dans les dépendances ne sont pas couverts.',
						page: 9,
						headingPath: null,
						score: 1
					}
				]
			}),
			generate: async () => {
				generated = true;
				return 'Non, ils ne sont pas couverts [1].';
			},
			resolveRoute: async () => 'targeted'
		});

		expect(generated).toBe(true);
		expect(report.results[0].generationSkipped).toBe(false);
		expect(report.results[0].pageRecallPassed).toBe(true);
		expect(report.results[0].answerGroupTriagePassed).toBe(false);
	});

	it('separates direct retrieval evidence from a derived answer oracle', async () => {
		const report = await runPrivateDocumentRetrievalStress({
			documentId: 'doc',
			cases: [
				{
					id: 'derived',
					question: 'Douze mensualités correspondent-elles au total annuel ?',
					answerable: true,
					pageGroups: [[1]],
					evidenceGroups: [['14,91'], ['185,50']],
					answerGroups: [['non'], ['178,92'], ['185,50'], ['6,58']]
				}
			],
			resolveRoute: async () => 'targeted',
			retrieve: async () => ({
				alternateQueries: [],
				hits: [
					{
						chunkId: 1,
						documentId: 'doc',
						documentName: 'local.pdf',
						text: 'Paiement de 14,91 € par mois, prime annuelle indiquée de 185,50 €.',
						page: 1,
						headingPath: null,
						score: 1
					}
				]
			})
		});

		expect(report.results[0]).toMatchObject({
			pageRecallPassed: true,
			answerGroupTriagePassed: true,
			retrievalPassed: true
		});
	});

	it('does not assemble one expected number from separate evidence passages', async () => {
		const report = await runPrivateDocumentRetrievalStress({
			documentId: 'doc',
			cases: [
				{
					id: 'split-number',
					question: 'Quel est le plafond choisi ?',
					answerable: true,
					pageGroups: [[1]],
					answerGroups: [['40 000']]
				}
			],
			resolveRoute: async () => 'targeted',
			retrieve: async () => ({
				alternateQueries: [],
				hits: [
					{
						chunkId: 1,
						documentId: 'doc',
						documentName: 'local.pdf',
						text: 'Premier plafond : 40.',
						page: 1,
						headingPath: null,
						score: 1
					},
					{
						chunkId: 2,
						documentId: 'doc',
						documentName: 'local.pdf',
						text: 'Référence distincte : 000.',
						page: 2,
						headingPath: null,
						score: 0.9
					}
				]
			})
		});

		expect(report.results[0].answerGroupTriagePassed).toBe(false);
	});

	it('fails an otherwise correct answer when it contains forbidden irrelevant facts', async () => {
		const report = await runPrivateDocumentStress({
			documentId: 'doc',
			cases: [
				{
					id: 'insured',
					question: 'Who is insured?',
					answerable: true,
					pageGroups: [[2]],
					answerGroups: [['Idrissa Konaté']],
					forbiddenAnswerGroups: [['repair network']]
				}
			],
			retrieve: async () => ({
				alternateQueries: [],
				hits: [
					{
						chunkId: 1,
						documentId: 'doc',
						documentName: 'local.pdf',
						text: 'Idrissa Konaté is insured.',
						page: 2,
						headingPath: null,
						score: 1
					}
				]
			}),
			generate: async () => 'Idrissa Konaté is insured [1]. The repair network is approved [1].',
			resolveRoute: async () => 'targeted'
		});

		expect(report.passed).toBe(0);
		expect(report.results[0]).toMatchObject({
			answerPassed: false,
			missingAnswerGroups: [],
			unexpectedAnswerGroups: [['repair network']]
		});
	});

	it('rejects duplicate ids and malformed page or answer groups', () => {
		expect(() =>
			parsePrivateDocumentStressMatrix({
				documentName: 'local.pdf',
				cases: [
					{
						id: 'same',
						question: 'One?',
						answerable: true,
						pageGroups: [[1]],
						answerGroups: [['a']]
					},
					{ id: 'same', question: 'Two?', answerable: false, pageGroups: [], answerGroups: [['b']] }
				]
			})
		).toThrow('unique');
		expect(() =>
			parsePrivateDocumentStressMatrix({
				documentName: 'local.pdf',
				cases: [
					{ id: 'bad', question: 'Bad?', answerable: true, pageGroups: [[]], answerGroups: [] }
				]
			})
		).toThrow('index 0');
		expect(() =>
			parsePrivateDocumentStressMatrix({
				documentName: 'local.pdf',
				cases: [
					{
						id: 'bad-forbidden',
						question: 'Bad?',
						answerable: true,
						pageGroups: [[1]],
						answerGroups: [['a']],
						forbiddenAnswerGroups: []
					}
				]
			})
		).toThrow('index 0');
		expect(() =>
			parsePrivateDocumentStressMatrix({
				documentName: 'local.pdf',
				cases: [
					{
						id: 'contradiction',
						question: 'Absent?',
						answerable: true,
						expectedOutcome: 'refusal',
						pageGroups: [],
						answerGroups: [['absent']]
					}
				]
			})
		).toThrow('Inconsistent');
		const matrix = parsePrivateDocumentStressMatrix({
			documentName: 'local.pdf',
			cases: [
				{
					id: 'page',
					question: 'Fact?',
					answerable: true,
					pageGroups: [[3]],
					answerGroups: [['fact']]
				}
			]
		});
		expect(() => assertPrivateDocumentStressPages(matrix, 2)).toThrow('exceeds');
	});

	it('keeps retrieval independent and requires citations from expected pages', async () => {
		const report = await runPrivateDocumentStress({
			documentId: 'doc',
			cases: [
				{
					id: 'wrong-page',
					question: 'Quel est le montant ?',
					answerable: true,
					pageGroups: [[2]],
					answerGroups: [['42 euros']]
				}
			],
			retrieve: async () => ({
				alternateQueries: [],
				hits: [
					{
						chunkId: 1,
						documentId: 'doc',
						documentName: 'local.pdf',
						text: 'Le montant est de 42 euros.',
						page: 1,
						headingPath: null,
						score: 1
					}
				]
			}),
			generate: async () => 'Le montant est de 42 euros [1].',
			resolveRoute: async () => 'targeted'
		});
		expect(report.results[0]).toMatchObject({
			answerBearing: true,
			retrievalPassed: false,
			answerPassed: true,
			citationPassed: false,
			passed: false
		});
	});
});

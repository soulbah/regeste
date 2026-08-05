import { describe, expect, it } from 'vitest';
import {
	hasAnswerBearingEvidence,
	isWeakMatch,
	rerankMargin,
	relevancePercent,
	temporalEvidenceCoverage
} from './relevance';
import type { SearchHit } from '$lib/types';

const evidenceHit = (text: string): SearchHit => ({
	chunkId: 1,
	documentId: 'doc',
	documentName: 'doc.txt',
	seq: 0,
	page: null,
	headingPath: null,
	score: 0.03,
	text
});

const hit = (score: number): SearchHit => ({
	chunkId: 1,
	documentId: 'document',
	documentName: 'scan.pdf',
	text: 'passage',
	page: 1,
	headingPath: null,
	score
});

describe('retrieval relevance', () => {
	it('requires every requested temporal value in the same passage', () => {
		const question = 'À quelle date et heure la couverture commence-t-elle ?';
		expect(temporalEvidenceCoverage(question, 'Prise d’effet le 14 juillet 2026.')).toBe(0);
		expect(temporalEvidenceCoverage(question, 'Survenant après le 14 juillet 2026 à 00:01.')).toBe(
			1
		);
	});

	it('keeps slash-formatted dates as temporal evidence', () => {
		expect(
			temporalEvidenceCoverage(
				'Donne le nom, la date et le lieu de naissance du souscripteur.',
				'Prénom et Nom : Idrissa Konaté\nDate de naissance : 12/03/1994\nLieu : Dabou'
			)
		).toBe(1);
	});

	it('distinguishes calendar instants from schedules and relative delays', () => {
		expect(
			temporalEvidenceCoverage(
				'Quand peut-on appeler ?',
				'Du lundi au samedi, hors jours fériés, de 8h00 à 20h00.'
			)
		).toBe(1);
		expect(
			temporalEvidenceCoverage(
				'Quand peut-on saisir le médiateur ?',
				'À l’issue d’un délai de deux (2) mois après la première réclamation.'
			)
		).toBe(1);
		expect(
			temporalEvidenceCoverage(
				'À quelle date et heure la couverture commence-t-elle ?',
				'Du lundi au samedi, de 8h00 à 20h00.'
			)
		).toBe(0);
	});

	it('recognizes a named insured-companion passage as a complete identity slot', async () => {
		const { identityEvidenceCoverage } = await import('./relevance');
		const question = 'Qui est assuré par ce devis et avec qui ?';
		expect(
			identityEvidenceCoverage(question, 'Un réseau de réparateurs agréés est disponible.')
		).toBe(0);
		expect(
			identityEvidenceCoverage(question, 'La police couvre Idrissa Konaté et votre partenaire.')
		).toBe(1);
	});
	it('keeps a weak best result below 100 percent', () => {
		expect(isWeakMatch([hit(0.016)])).toBe(true);
		expect(relevancePercent(hit(0.016))).toBeLessThan(50);
	});

	it('caps a strong refined result at 100 percent', () => {
		expect(relevancePercent(hit(0.05))).toBe(100);
	});

	it('rejects entity-only overlap for an unsupported attribute', () => {
		expect(
			hasAnswerBearingEvidence('Quel est le numéro de passeport de CR-204 ?', [
				evidenceHit('Camille Renaud — CR-204 — étudiante à Lyon.')
			])
		).toBe(false);
		expect(
			hasAnswerBearingEvidence('Quel est le passeport du vendeur Cédric Martin ?', [
				evidenceHit('Le vendeur Cédric MARTIN signe le compromis de vente.')
			])
		).toBe(false);
	});

	it('reads a shouted question as words, not as a wall of acronyms', () => {
		// Case is the only signal that a token is an acronym, so an all-caps
		// question has none: LE, LA and DE were required to appear verbatim in the
		// evidence, and a lowercase document could never satisfy them.
		expect(
			hasAnswerBearingEvidence('QUELLE EST LA FRANCHISE DE LA GARANTIE ?', [
				evidenceHit('La franchise de la garantie est de 300 € par sinistre.')
			])
		).toBe(true);
		// A real acronym is still required, and a document that writes it in
		// another case still carries it.
		expect(
			hasAnswerBearingEvidence('Que dit le document sur mon IBAN ?', [
				evidenceHit('Votre iban figure sur le mandat de prélèvement.')
			])
		).toBe(true);
	});

	it('accepts the French first of the month as an explicit date', () => {
		expect(
			hasAnswerBearingEvidence("Quelle est la date d'effet du contrat ?", [
				evidenceHit("La date d'effet du contrat est le 1er janvier 2027.")
			])
		).toBe(true);
	});

	it('keeps evidence mentioning the requested attribute or a morphological variant', () => {
		expect(
			hasAnswerBearingEvidence('CR-204 est-elle mariée ?', [
				evidenceHit('CR-204 est marié à Noé Perrin depuis juillet.')
			])
		).toBe(true);
		expect(
			hasAnswerBearingEvidence('Qui est Marc Vidal ?', [
				evidenceHit('Marc Vidal dirige le projet Orion.')
			])
		).toBe(true);
	});

	it('requires every requested party role and accepts contract synonyms', () => {
		const question = "Qui est l'acheteur et le vendeur ?";
		expect(
			hasAnswerBearingEvidence(question, [evidenceHit('Le vendeur est Monsieur Cédric MARTIN.')])
		).toBe(false);
		expect(
			hasAnswerBearingEvidence(question, [
				evidenceHit(
					'Les vendeurs sont Cédric MARTIN et Hélène DUPUIS. L’acquéreur est Idrissa KONATÉ.'
				)
			])
		).toBe(true);
	});

	it('rejects generic party boilerplate for an identity question', () => {
		expect(
			hasAnswerBearingEvidence('Qui sont les vendeurs ?', [
				evidenceHit(
					'Le vendeur constructeur et les entrepreneurs ont réalisé les travaux pour le vendeur.'
				)
			])
		).toBe(false);
		expect(
			hasAnswerBearingEvidence("Qui est l'acheteur ?", [
				evidenceHit("L'acquéreur informe le vendeur des conditions de la vente.")
			])
		).toBe(false);
	});

	it('requires concrete values for requested date, time and named-policy identity slots', () => {
		expect(
			hasAnswerBearingEvidence('À quelle date et heure la couverture commence-t-elle ?', [
				evidenceHit('La couverture commence à la date indiquée dans votre police.')
			])
		).toBe(false);
		expect(
			hasAnswerBearingEvidence('À quelle date et heure la couverture commence-t-elle ?', [
				evidenceHit('La couverture commence le 14 juillet 2026 à 00:01.')
			])
		).toBe(true);
		expect(
			hasAnswerBearingEvidence('Qui est assuré par ce devis et avec qui ?', [
				evidenceHit('Ce devis couvre votre logement et les personnes vivant avec vous.')
			])
		).toBe(false);
		expect(
			hasAnswerBearingEvidence('Qui est assuré par ce devis et avec qui ?', [
				evidenceHit('La police couvre Idrissa Konaté et votre partenaire.')
			])
		).toBe(true);
	});

	it('does not refuse a title attribute question when the role sits in the heading', () => {
		expect(
			hasAnswerBearingEvidence('Quel est le salaire du directeur ?', [
				{
					...evidenceHit('Rémunération annuelle : 90 000 EUR de salaire brut.'),
					headingPath: 'Directeur commercial'
				}
			])
		).toBe(true);
	});

	it('does not require a presentation wrapper to appear in structured evidence', () => {
		expect(
			hasAnswerBearingEvidence(
				'Quel historique de sinistre, résiliation et assurance actuelle est déclaré ?',
				[
					evidenceHit(
						'Au cours des 3 dernières années, avez-vous eu un sinistre dans votre logement ? Non. Votre assureur a-t-il résilié votre contrat ? Non. Êtes-vous actuellement assuré ? Oui, depuis moins d’un an.'
					)
				]
			)
		).toBe(true);
	});

	it('accepts name-before-role and comma deed phrasings but not an unrelated named person', () => {
		expect(
			hasAnswerBearingEvidence('Qui est le vendeur ?', [
				evidenceHit(
					'Monsieur Jean DUPONT, demeurant à Paris, ci-après dénommé le vendeur, vend le bien.'
				)
			])
		).toBe(true);
		expect(
			hasAnswerBearingEvidence('Qui est le vendeur ?', [
				evidenceHit('Le vendeur, Jean DUPONT, demeurant à Paris, déclare vendre.')
			])
		).toBe(true);
		expect(
			hasAnswerBearingEvidence('Qui est le vendeur ?', [
				evidenceHit(
					"Le vendeur s'engage à payer Monsieur Jean Dupont, huissier de justice, pour les frais."
				)
			])
		).toBe(false);
	});

	it('combines complementary identity slots across separate passages', () => {
		const question = 'Quel souscripteur est nommé et quel cohabitant a-t-il déclaré ?';
		const named = evidenceHit('Le souscripteur nommé est Idrissa Konaté.');
		const companion = {
			...evidenceHit('Le cohabitant déclaré est son partenaire.'),
			chunkId: 2
		};
		expect(hasAnswerBearingEvidence(question, [named])).toBe(false);
		expect(hasAnswerBearingEvidence(question, [companion])).toBe(false);
		expect(hasAnswerBearingEvidence(question, [named, companion])).toBe(true);
	});

	it('treats a natural cost question as evidence for a stated sale price', () => {
		expect(
			hasAnswerBearingEvidence('Combien coute la maison ?', [
				evidenceHit('PRIX DE LA VENTE de la maison : 152.000,00 €')
			])
		).toBe(true);
	});

	it('accepts a scoped numeric value without requiring the source to repeat the slot label', () => {
		expect(
			hasAnswerBearingEvidence('Quel est le plafond du bris de glace accidentel ?', [
				evidenceHit('Nous couvrons le bris de glace accidentel jusqu’à 40 000 € par événement.')
			])
		).toBe(true);
		expect(
			hasAnswerBearingEvidence('Quel est le plafond du bris de glace accidentel ?', [
				evidenceHit('La franchise habitation est fixée à 300 € par événement.')
			])
		).toBe(false);
	});

	it('does not substitute the property area for an absent garage area', () => {
		expect(
			hasAnswerBearingEvidence('Quelle est la superficie du garage ?', [
				evidenceHit('La contenance totale de la maison est de 76 ca.')
			])
		).toBe(false);
		expect(
			hasAnswerBearingEvidence('Quelle est la superficie de la maison ?', [
				evidenceHit('La contenance totale du bien immobilier est de 76 ca.')
			])
		).toBe(true);
	});

	it('does not combine an attribute and its scope across unrelated passages', () => {
		expect(
			hasAnswerBearingEvidence("Quel est le téléphone de l'assuré ?", [
				evidenceHit("L'assuré est Idrissa Konaté."),
				{ ...evidenceHit('Téléphone assistance : 0801 840 506.'), chunkId: 2 }
			])
		).toBe(false);
	});

	it('does not bind an assistance phone to a distant subscriber mention in one chunk', () => {
		expect(
			hasAnswerBearingEvidence('Quel est le numéro de téléphone personnel du souscripteur ?', [
				evidenceHit(
					'Le souscripteur doit signaler tout changement de situation.\n' +
						'Conditions générales et exclusions diverses. '.repeat(12) +
						'Téléphone assistance : +33 801 840 506.'
				)
			])
		).toBe(false);
	});

	it('does not confuse a covered phone device with a requested phone number', () => {
		expect(
			hasAnswerBearingEvidence("Le bris de l'écran d'un téléphone est-il couvert ?", [
				evidenceHit(
					"Les dommages aux écrans d'appareils électroniques, notamment les téléphones, ne sont pas couverts."
				)
			])
		).toBe(true);
	});

	it('requires an exact value bound to its label instead of a request to provide it', () => {
		expect(
			hasAnswerBearingEvidence('Quel est le numéro exact du contrat d’assurance ?', [
				evidenceHit('Veuillez indiquer le nom et le numéro du contrat souscrit.')
			])
		).toBe(false);
		expect(
			hasAnswerBearingEvidence('Quel est le numéro exact du contrat d’assurance ?', [
				evidenceHit('Numéro du contrat : MRH-2048')
			])
		).toBe(true);
	});

	it('does not read an instruction followed by a section as a personal phone value', () => {
		expect(
			hasAnswerBearingEvidence('Quel est le numéro de téléphone personnel du souscripteur ?', [
				evidenceHit(
					'Veuillez nous indiquer :\n- Le numéro de téléphone auquel le Bénéficiaire peut être joint.\n1.4 - Territorialité\nLes garanties sont accordées en France.'
				)
			])
		).toBe(false);
	});

	it('requires uppercase acronyms to survive retrieval', () => {
		expect(
			hasAnswerBearingEvidence('Quelle est la classe DPE du logement ?', [
				evidenceHit('Classe de protection du logement : standard.')
			])
		).toBe(false);
		expect(
			hasAnswerBearingEvidence('Quelle est la classe DPE du logement ?', [
				evidenceHit('Classe DPE du logement : C.')
			])
		).toBe(true);
	});

	it('accepts structured premise evidence for a qualified exact-detail answer', () => {
		expect(
			hasAnswerBearingEvidence("Quelle est la marque du système d'alarme installé ?", [
				evidenceHit("Système d'alarme : Non")
			])
		).toBe(true);
		expect(
			hasAnswerBearingEvidence('Quel objet précis de plus de 5 000 € est déclaré ?', [
				evidenceHit("Possédez-vous au moins un objet d'une valeur supérieure à 5 000 € : Oui")
			])
		).toBe(true);
	});

	it('accepts typoed and bilingual attribute evidence', () => {
		expect(
			hasAnswerBearingEvidence('Quel est le prxi de vnete exct du bien Morle ?', [
				evidenceHit('Le prix de vente exact du bien Morel est 152.000,00 €.')
			])
		).toBe(true);
		expect(
			hasAnswerBearingEvidence('Quelle est la capcité de BX-77 ?', [
				evidenceHit('Référence BX-77 | Capacité: 42 kg')
			])
		).toBe(true);
		expect(
			hasAnswerBearingEvidence('Qaund les comentaires sur l ICR sont ils attendus ?', [
				evidenceHit('Comments on this ICR are expected by August 14, 2026.')
			])
		).toBe(true);
		expect(
			hasAnswerBearingEvidence(
				"Donne toutes les descriptions de l'atelier sans résoudre artificiellement leur divergence.",
				[evidenceHit("Imani décrit l'atelier comme calme; Pablo le décrit comme bruyant.")]
			)
		).toBe(true);
	});

	it('uses a validated translated query to assess cross-language evidence', () => {
		expect(
			hasAnswerBearingEvidence(
				'Le cadre est-il obligatoire et propre à un secteur ?',
				[evidenceHit('The framework is voluntary and non-sector-specific.')],
				['Is the framework mandatory and sector-specific?']
			)
		).toBe(true);
		expect(
			hasAnswerBearingEvidence(
				'Quel est le groupe sanguin du responsable ?',
				[evidenceHit('The report names the Flight Planning Branch manager.')],
				['What is the blood group of the manager?']
			)
		).toBe(false);
		expect(
			hasAnswerBearingEvidence(
				'Quel est le nom du PDG de Discover ?',
				[evidenceHit('Discover processed 1.6 billion transactions.')],
				['What is the name of the CEO of Discover?']
			)
		).toBe(false);
	});

	it('rejects entity overlap when the requested fuzzy attribute is absent', () => {
		expect(
			hasAnswerBearingEvidence(
				'Quel etait le groupe sanguim du responsable Flight Planing Branch ?',
				[
					evidenceHit(
						'This document was prepared by the Flight Planning Branch of the Crew Procedures Division.'
					)
				]
			)
		).toBe(false);
		expect(
			hasAnswerBearingEvidence('Quel mot de passe recommande RFC9110 ?', [
				{
					...evidenceHit('RFC 9110 defines HTTP semantics and many recommendations.'),
					documentName: 'rfc9110.pdf'
				},
				{
					...evidenceHit("Aucun mot de passe n'est recommandé ici."),
					documentName: 'unrelated-http-note.md'
				}
			])
		).toBe(false);
	});

	it('does not combine a password mention and recommendation from unrelated passages', () => {
		expect(
			hasAnswerBearingEvidence('Quel mot de passe recommande RFC9110 ?', [
				{
					...evidenceHit('RFC9110 discusses passwords in authentication systems.'),
					documentName: 'rfc9110.pdf'
				},
				{
					...evidenceHit('RFC9110 contains implementation recommendations.'),
					chunkId: 2,
					documentName: 'rfc9110.pdf'
				}
			])
		).toBe(false);
		expect(
			hasAnswerBearingEvidence('Quel est le mot de passe recommandé ?', [
				evidenceHit('Le mot de passe recommandé est Silex-2026.')
			])
		).toBe(true);
	});
});

describe('rerankMargin', () => {
	const hit = (rerankScore: number | undefined): SearchHit =>
		({
			chunkId: 1,
			documentId: 'd',
			documentName: 'doc.pdf',
			text: 'x',
			page: 1,
			headingPath: null,
			score: 0.9,
			...(rerankScore === undefined ? {} : { rerankScore })
		}) as SearchHit;

	it('is the gap between the best passage and the runner-up', () => {
		expect(rerankMargin([hit(-1.2), hit(-3.4), hit(-5)])).toBeCloseTo(2.2, 5);
	});

	it('is null on a turn that was not reranked, so the caller falls back', () => {
		expect(rerankMargin([hit(undefined), hit(undefined)])).toBeNull();
	});

	it('is null when a single passage survived', () => {
		expect(rerankMargin([hit(-1.2)])).toBeNull();
	});

	it('does not gate the answer, because the margin does not separate right from wrong', () => {
		// Calibrated on 113 grounded cases: median margin 0.50 when the top
		// passage was on a gold page, 0.29 when it was not. Refusing on the gap
		// would suppress 32 correct answers to catch 6 wrong ones, so isWeakMatch
		// stays on the fused score and the margin is reported, not enforced.
		expect(isWeakMatch([hit(-2.0), hit(-2.1)])).toBe(false);
	});
});

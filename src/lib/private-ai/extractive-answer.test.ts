import { describe, expect, it } from 'vitest';
import type { SearchHit } from '$lib/types';
import { buildDeterministicExtractiveAnswer } from './extractive-answer';
import { checkNumericGrounding } from './grounding';

const hit = (chunkId: number, text: string, page = 1, seq = chunkId): SearchHit => ({
	chunkId,
	documentId: 'doc',
	documentName: 'source.pdf',
	text,
	page,
	headingPath: null,
	seq,
	paraIndex: 0,
	score: 0.03
});

describe('deterministic extractive answers', () => {
	it('answers an exact-value reverse lookup from its shortest local clause', () => {
		const evidence = [
			hit(
				1,
				'Tarifs :\n• 275 € HT, pour un atelier de médiation sur site (6 participants)\n• Le déplacement reste facturé séparément.'
			)
		];
		const answer = buildDeterministicExtractiveAnswer(
			'Quelle prestation correspond au forfait de 275 € HT et combien de participants concerne-t-elle ?',
			evidence
		);

		expect(answer).toBe(
			'Le document indique : « 275 € HT, pour un atelier de médiation sur site (6 participants) » [1].'
		);
		expect(
			checkNumericGrounding(
				answer!,
				evidence.map((item) => item.text)
			).grounded
		).toBe(true);
	});

	it('declines an exact-value reverse lookup when evidence carries another value', () => {
		expect(
			buildDeterministicExtractiveAnswer('Que couvre le forfait de 275 € ?', [
				hit(1, 'Forfait disponible : 280 € pour une intervention.')
			])
		).toBeNull();
	});

	it('does not answer a three-fact question with an unrelated identity pair', () => {
		expect(
			buildDeterministicExtractiveAnswer(
				"Quel solde le document certifie-t-il, à quelle date, et qui l'a signé ?",
				[
					hit(
						1,
						'Compte n° 60012345678 ouvert au nom de KARIM TRAORE. Solde créditeur : 1 234,56 EUR. Fait le 23 juillet 2026. AMELIE ROUSSEAU.'
					)
				]
			)
		).toBeNull();
	});

	it('reconstructs a split printed total from a generic multi-item decomposition', () => {
		const total = hit(1, ['Total du lot :', '3 0 00 € HT.'].join('\n'), 10, 20);
		const decomposition = hit(
			2,
			[
				'Détail :',
				'- première ligne : 1000 € HT.',
				'- deuxième ligne : 1250 € HT.',
				'- troisième ligne : 750 € HT.'
			].join('\n'),
			10,
			21
		);
		const evidence = [decomposition, total];
		const answer = buildDeterministicExtractiveAnswer('Quel est le montant total ?', evidence);

		expect(answer).toContain('3000 € HT');
		expect(answer).toContain('1000 € HT + 1250 € HT + 750 € HT = 3000 € HT');
		expect(
			checkNumericGrounding(
				answer!,
				evidence.map((item) => item.text)
			).grounded
		).toBe(true);
	});

	it('uses arithmetic proof for a naturally phrased financial decomposition', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Quel total faut-il prévoir pour les postes alpha et bêta, et comment se décompose-t-il ?',
			[
				hit(1, 'Montant global : 3000 € HT', 4, 10),
				hit(2, 'Détail : 1000 € HT\n1250 € HT\n750 € HT', 4, 11)
			]
		);
		expect(answer).toContain('3000 € HT');
		expect(answer).toContain('1000 € HT + 1250 € HT + 750 € HT = 3000 € HT');
	});

	it('leaves section-reference questions to model synthesis', () => {
		// Regression: "Que dit l'article 110 …" anchored the number-anchored
		// extractor, which dumped the whole chunk (starting inside article 109).
		const answer = buildDeterministicExtractiveAnswer(
			"Que dit l'article 110 sur la celebration d'un mariage ?",
			[
				hit(
					1,
					"Mention est portée en marge de l'acte de mariage. Arțicle 110 : Célébration du mariage A l'expiration du délai d'un mois, l'officier de l'état civil procède à la célébration du mariage."
				)
			]
		);
		expect(answer).toBeNull();
	});

	it('still anchors genuine value questions on their number', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Que se passe-t-il apres un sejour de plus de 90 jours ?',
			[
				hit(
					1,
					'Un séjour de plus de 90 jours impose une demande de visa de long séjour auprès du consulat.'
				)
			]
		);
		expect(answer).toContain('90 jours');
	});

	it('maps requested form slots to their exact labels and values', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Résume type, surface, période de construction, matériau et dépendances déclarés.',
			[
				hit(
					1,
					'- Quel type de logement avez-vous : Maison\n- Quelle est la superficie de votre logement : 70 m²\n- Quel type de logement souhaitez-vous assurer : Résidence principale\n- Quand votre logement a-t-il été construit : Entre 1946 et 1980\n- Quels sont les matériaux de construction de votre logement : Brique\n- Votre logement a-t-il des dépendances : Oui\n- Quelle est la taille combinée des dépendances : 18 m²'
				)
			]
		);
		expect(answer).toContain('type de logement avez-vous : Maison');
		expect(answer).toContain('superficie de votre logement : 70 m²');
		expect(answer).toContain('matériaux de construction');
		expect(answer).toContain('18 m²');
		expect(answer).toContain('dépendances : Oui');
		expect(answer).not.toContain('Résidence principale');
		expect(answer).not.toContain('assurance habitation');
	});

	it('repairs split square units and includes structural continuations from OCR forms', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Résume type, surface, période de construction, matériau et dépendances déclarés.',
			[
				hit(
					1,
					'- Quel type de logement avez-vous : Maison\n2\n- Quelle est la superficie de votre logement : 70m\n- Quand votre logement a-t-il été construit : Entre 1946 et 1980\n- Quels sont les matériaux de construction de votre logement : Brique\n- Votre logement a-t-il des dépendances : dépendances',
					66,
					1
				),
				hit(2, '- Quelle est la taille combinée des dépendances : 18 m²', 66, 2)
			]
		);
		expect(answer).toContain('Maison');
		expect(answer).not.toContain('Maison 2');
		expect(answer).toContain('70 m²');
		expect(answer).toContain('Entre 1946 et 1980');
		expect(answer).toContain('18 m²');
		expect(answer).toContain('dépendances : Oui');
	});

	it('binds a form label to its value on the following visual line', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Donne le nom, la date et le lieu de naissance du souscripteur.',
			[
				hit(
					1,
					'Identification du souscripteur :\nPrénom et Nom :\nCamille Moreau\nDate de naissance :\n03/04/1991\nLieu de naissance :\nBastia, France',
					69
				)
			]
		);
		expect(answer).toContain('Camille Moreau');
		expect(answer).toContain('03/04/1991');
		expect(answer).toContain('Bastia');
	});

	it('compares selected statuses with a recommendation deterministically', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'La liste des options choisies et le conseil final sont-ils cohérents ? Explique l’écart.',
			[
				hit(
					1,
					'- Option vol complet : non ajouté\n- Protection juridique : non ajoutée\n- Bris de glace : ajouté',
					70
				),
				hit(2, 'Notre conseil recommande les options vol complet et Protection juridique.', 70),
				hit(3, 'Dispositifs de protection : Système d’alarme : Non', 69)
			]
		);
		expect(answer).toContain('incohérents');
		expect(answer).toContain('vol complet');
		expect(answer).toContain('Protection juridique');
		expect(answer).toContain('non ajoutées');
		expect(answer).not.toContain('Système d’alarme');
	});

	it('includes duration linked to a current-policy yes/no field', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Quel historique de sinistre, résiliation et assurance actuelle a été déclaré ?',
			[
				hit(
					1,
					'- Sinistre au cours des 3 dernières années : Non\n- Résiliation au cours des 3 dernières années : Non\n- Avez-vous actuellement une assurance :',
					66,
					1
				),
				hit(
					2,
					"Oui\n- Depuis combien de temps avez-vous votre contrat actuel ? moins d'un an",
					66,
					2
				),
				hit(
					3,
					"L'assureur apporte sa garantie, même si le fait est antérieur. 2.2. Second cas : la réclamation est adressée pendant la période subséquente.",
					62,
					3
				)
			]
		);
		expect(answer).toContain('actuellement une assurance : Oui');
		expect(answer).toContain("moins d'un an");
		expect(answer).not.toContain('période subséquente');
	});

	it('chooses the exact scenario over another exclusion sharing the object', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Mon ordinateur portable volé dans un café est-il couvert ?',
			[
				hit(
					1,
					"Si quelqu'un s'empare de votre ordinateur portable à un café, ce n'est pas couvert."
				),
				hit(2, "Les dommages à l'écran d'un ordinateur portable ne sont pas couverts.")
			]
		);
		expect(answer).toContain('à un café');
		expect(answer).not.toContain("dommages à l'écran");
	});

	it('uses adjacent polarity and object sentences instead of unrelated chunk tail', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Les appareils électroniques volés dans une dépendance sont-ils couverts ?',
			[
				hit(
					1,
					'Nous ne couvrons pas le vol dans une dépendance. Cette exclusion concerne les appareils électroniques qui y sont laissés. Les écrans cassés suivent une autre garantie.',
					9
				),
				hit(2, "Les dommages à l'écran d'un téléphone ne sont pas couverts.", 15)
			]
		);
		expect(answer).toContain('dépendance');
		expect(answer).toContain('appareils électroniques');
		expect(answer).not.toContain('écrans cassés');
	});

	it('does not treat a temporal coverage question as a yes-no scenario', () => {
		expect(
			buildDeterministicExtractiveAnswer('À quelle date et heure la couverture commence-t-elle ?', [
				hit(1, 'Votre couverture commence à la date indiquée dans la police et dure un an.', 60)
			])
		).toBeNull();
	});

	it('joins the immediate option continuation after a decisive scenario', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Mon ordinateur portable volé dans un café est-il couvert ?',
			[
				hit(
					1,
					"Si quelqu'un s'empare de votre ordinateur portable à un café, ce n'est pas couvert. Si vous souhaitez être couvert, il vous suffit",
					9,
					10
				),
				hit(
					2,
					"d'ajouter notre garantie complète contre le vol directement depuis notre application. Une autre exclusion suit.",
					9,
					11
				)
			]
		);
		expect(answer).toContain("ce n'est pas couvert");
		expect(answer).toContain('garantie complète contre le vol');
		expect(answer).not.toContain('Une autre exclusion');
		expect(answer?.split('\n')).toHaveLength(2);
	});

	it('returns a qualified absence when a related option status is known', () => {
		const answer = buildDeterministicExtractiveAnswer(
			"Quel est le nom de l'enfant couvert par l'assurance scolaire ?",
			[hit(1, '- Assurance scolaire : non ajouté')]
		);
		expect(answer).toContain('Assurance scolaire : non ajouté');
		expect(answer).toContain("nom demandé n'est pas précisé");
	});

	it('qualifies a missing alarm brand from the declared alarm status', () => {
		const answer = buildDeterministicExtractiveAnswer(
			"Quelle est la marque du système d'alarme installé ?",
			[hit(1, "Dispositifs de protection :\nSystème d'alarme : Non\nCaméras de sécurité : Non", 69)]
		);
		expect(answer).toContain("Système d'alarme : Non");
		expect(answer).toContain("marque demandée n'est pas précisée");
	});

	it('qualifies an unnamed valuable item from a positive declaration', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Quel objet précis de plus de 5 000 € le souscripteur possède-t-il ?',
			[hit(1, "Possédez-vous au moins un objet d'une valeur supérieure à 5 000 € : Oui", 66)]
		);
		expect(answer).toContain('5 000 € : Oui');
		expect(answer).toContain("objet précis demandé n'est pas précisé");
	});

	it('keeps every rights bullet and the opposition subsection', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Quels droits sont prévus sur les données ?',
			[
				hit(
					1,
					'● d’accéder à vos données personnelles\n● de rectifier vos données personnelles\n● de supprimer vos données personnelles'
				),
				hit(2, 'Vous avez le droit de vous opposer au traitement de vos données personnelles.')
			]
		);
		expect(answer).toContain('accéder');
		expect(answer).toContain('rectifier');
		expect(answer).toContain('supprimer');
		expect(answer).toContain('opposer');
	});

	it('closes a truncated opposition clause at its supported proposition', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Quels droits sont prévus sur les données ?',
			[
				hit(
					1,
					'● d’accéder à vos données personnelles\n● de rectifier vos données personnelles\n● de supprimer vos données personnelles'
				),
				hit(
					2,
					'Vous avez le droit de vous opposer au traitement de vos données personnelles (y compris à des fins de'
				)
			]
		);
		expect(answer).toContain(
			'Vous avez le droit de vous opposer au traitement de vos données personnelles [2]'
		);
		expect(answer).not.toContain('à des fins de');
	});

	it('keeps a numeric explanation and its structural payment continuation', () => {
		const answer = buildDeterministicExtractiveAnswer(
			"Comment l'indemnisation tient-elle compte de la dépréciation et du complément de 25 % ?",
			[
				hit(1, 'La dépréciation est déduite selon l’ancienneté et l’état du logement.', 5, 10),
				hit(
					2,
					'Le complément peut atteindre 25 % du coût de reconstruction. Cette valeur sera payée',
					5,
					11
				),
				hit(3, 'seulement après les travaux et sur présentation des factures.', 5, 12)
			]
		);
		expect(answer).toContain('dépréciation');
		expect(answer).toContain('25 %');
		expect(answer).toContain('factures');
	});

	it('calculates a repeated payment total and difference deterministically', () => {
		const answer = buildDeterministicExtractiveAnswer(
			"Douze mensualités de 14,91 € font-elles la prime annuelle indiquée ? Calcule les deux montants et l'écart.",
			[
				hit(
					1,
					'Votre paiement de 14,91 € par mois correspond à une prime annuelle de 185,50 €.',
					28
				)
			]
		);
		expect(answer).toContain('178,92');
		expect(answer).toContain('185,50');
		expect(answer).toContain('6,58');
		expect(answer).toContain('[1]');
	});

	it('applies a strict duration threshold to every requested scenario', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Mes biens sont-ils couverts pour un voyage de deux mois puis pour un voyage de quatre mois ?',
			[
				hit(
					1,
					'Les biens restent couverts dans le monde entier pour un voyage de moins de 3 mois.',
					4
				)
			]
		);
		expect(answer).toContain('2 mois : oui');
		expect(answer).toContain('4 mois : non');
		expect(answer).toContain('strictement inférieure à 3 mois');
	});

	it('extracts an exhaustive adjacent-page monetary form cluster', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Récapitule tous les montants de garanties choisis, y compris reconstruction.',
			[
				hit(
					1,
					'- Dommages aux biens : 40 000 €\n- Relogement : 2 000 €\n- Responsabilité civile : 6 000 000 €',
					69
				),
				hit(2, '- Défense et recours : 20 000 €\n- Coûts de reconstruction : illimités', 70),
				hit(3, '- Taxe annuelle : 18,51 €', 28)
			]
		);
		expect(answer).toContain('40 000 €');
		expect(answer).toContain('2 000 €');
		expect(answer).toContain('6 000 000 €');
		expect(answer).toContain('20 000 €');
		expect(answer).toContain('illimités');
		expect(answer).not.toContain('Taxe annuelle');
	});

	it('keeps three requested form categories after stricter slot matching', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Quels dispositifs de sécurité, cohabitant et objet de valeur ont été déclarés ?',
			[
				hit(
					1,
					"- Système d'alarme : Non\n- Caméras de sécurité : Non\n- Qui d'autre vit avec vous : votre partenaire\n- Objet supérieur à 5 000 € : Oui",
					66
				)
			]
		);
		expect(answer).toContain("Système d'alarme");
		expect(answer).toContain('partenaire');
		expect(answer).toContain('5 000 €');
	});

	it('extracts a percentage modifier from the clause that binds it to the requested costs', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Le plafond peut-il être majoré pour les frais de protection et de stockage ?',
			[
				hit(
					1,
					'Le plafond sera majoré de 10 % pour couvrir les frais de protection et de stockage.',
					8
				),
				hit(2, 'Le stockage du mobilier est plafonné à 500 €.', 35)
			]
		);
		expect(answer).toContain('10 %');
		expect(answer).toContain('protection');
		expect(answer).not.toContain('500 €');
	});

	it('keeps a complete numbered evidence list instead of synthesizing nearby partial lists', () => {
		const answer = buildDeterministicExtractiveAnswer(
			"Cite les onze types d'événements ouvrant l'assistance.",
			[
				hit(1, 'Urgences : incendie, dégât des eaux, porte bloquée.', 3),
				hit(
					2,
					'Garanties Assistance\n1. Fuite intérieure\n2. Fuite extérieure\n3. Engorgement\n4. Électricité\n5. Gaz\n6. Incendie\n7. Intempéries\n8. Sécheresse\n9. Effraction\n10. Vandalisme\n11. Porte bloquée',
					30
				)
			]
		);
		expect(answer).toContain('1. Fuite intérieure');
		expect(answer).toContain('11. Porte bloquée');
		expect(answer).toContain('[2]');
	});

	it('returns two co-located deadlines from one authoritative clause', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Quand peut-on saisir le médiateur et quel est le dernier délai ?',
			[
				hit(
					1,
					'Vous pouvez saisir le médiateur après deux mois. La demande doit être formulée au plus tard dans un délai d’un an.',
					44
				),
				hit(2, 'Vous pouvez renoncer sous 14 jours.', 56)
			]
		);
		expect(answer).toContain('deux mois');
		expect(answer).toContain('un an');
		expect(answer).not.toContain('14 jours');
	});

	it('extracts a co-located identity and identifier without domain vocabulary', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'À qui appartient le dossier et quel est son numéro ?',
			[
				hit(
					1,
					'Nous certifions que le dossier n° 987654321 ouvert au nom de CAMILLE MOREAU présente un solde positif.'
				)
			]
		);
		expect(answer).toBe('Le dossier n° 987654321 est ouvert au nom de CAMILLE MOREAU [1].');
	});

	it('joins an incomplete consequence to its immediate continuation', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Quelle conséquence entraîne une fausse déclaration intentionnelle ?',
			[
				hit(
					1,
					'Une fausse déclaration intentionnelle entraîne la nullité. L’assureur conserve à titre de',
					65,
					10
				),
				hit(2, 'sanction les primes déjà payées.', 65, 11)
			]
		);
		expect(answer).toContain('nullité');
		expect(answer).toContain('primes déjà payées');
		expect(answer).toContain('[2]');
	});

	it('does not let an unrelated declaration form answer retention deadlines', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Combien de temps sont conservées les données après le contrat, après un sinistre et après un sinistre corporel ?',
			[
				hit(1, 'Avez-vous déclaré un sinistre au cours des 3 dernières années : Non', 66),
				hit(
					2,
					'Après le contrat : deux ans. Après un sinistre : deux ans. Après un sinistre corporel : dix ans.',
					49
				)
			]
		);
		expect(answer).toContain('deux ans');
		expect(answer).toContain('dix ans');
		expect(answer).not.toContain('3 dernières années');
	});

	it('extracts split retention scopes from a dense policy clause', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Combien de temps sont conservées les données après le contrat, après un sinistre et après un sinistre corporel ?',
			[
				hit(1, 'Avez-vous déclaré un sinistre au cours des 3 dernières années : Non', 66),
				hit(
					2,
					'● En cas de sinistre – deux (2) ans à compter du règlement du sinistre.\n● En cas de sinistre avec dommages corporels – dix (10) ans à compter du sinistre.\n● Pour toute information sur le contrat – deux (2) ans à compter de la résiliation.',
					49
				)
			]
		);
		expect(answer).toContain('deux (2) ans');
		expect(answer).toContain('dix (10) ans');
		expect(answer).not.toContain('3 dernières années');
	});

	it('returns the local obligation block for an action-after-event question', () => {
		const answer = buildDeterministicExtractiveAnswer(
			'Que dois-je faire immédiatement après un vol ?',
			[
				hit(1, 'La franchise est fixée à 300 € par événement.', 23),
				hit(
					2,
					'Vos obligations s’il vous arrive quelque chose. Vous êtes tenu de prendre des mesures immédiates, de nous informer et de fournir des preuves.',
					24,
					20
				),
				hit(
					3,
					'Tous les cas de vol doivent être signalés à la police dans les plus brefs délais.',
					24,
					21
				),
				hit(4, 'Fournissez les justificatifs de valeur et de propriété demandés.', 24, 22)
			]
		);
		expect(answer).toContain('signalés à la police');
		expect(answer).toContain('preuves');
		expect(answer).toContain('justificatifs');
		expect(answer).not.toContain('franchise');
	});

	it('binds a long composed request to each explicit value-bearing clause', () => {
		const answer = buildDeterministicExtractiveAnswer(
			"Donne en une réponse le prix mensuel, la prime annuelle, la franchise, la date de prise d'effet et les trois grands plafonds biens, relogement et responsabilité civile.",
			[
				hit(
					1,
					'Votre paiement de 14,91 € par mois correspond à une prime annuelle de 185,50 €.',
					28
				),
				hit(2, 'FRANCHISE : Vous avez choisi 300 € par sinistre.', 70),
				hit(3, 'PRISE D’EFFET : la couverture débute le 14 juillet 2026.', 70),
				hit(
					4,
					'Dommages à vos biens mobiliers : 40 000 €. Augmentation temporaire du coût de la vie : 2 000 €. Responsabilité civile : 6 000 000 €.',
					69
				),
				hit(5, 'Le relogement est couvert jusqu’à 2 000 €.', 4)
			]
		);
		expect(answer).toContain('14,91 €');
		expect(answer).toContain('185,50 €');
		expect(answer).toContain('300 €');
		expect(answer).toContain('14 juillet 2026');
		expect(answer).toContain('40 000 €');
		expect(answer).toContain('2 000 €');
		expect(answer).toContain('6 000 000 €');
	});
});

import { describe, expect, it } from 'vitest';
import {
	SYSTEM_PROMPT,
	buildUserPrompt,
	buildAnswerCoverageContract,
	buildEvidenceInventory,
	buildVerificationPrompt,
	buildVerificationUserPrompt,
	citationGroundingCoverage,
	compactCitationMarkers,
	enforceAnswerInvariants,
	extractThink,
	fitEvidenceToContext,
	hasCollapsedIntoRepetition,
	isDegenerateAnswer,
	withoutRepeatedAnswerSentences,
	withoutRepeatedSentences,
	isRefusalLike,
	needsGroundedVerification,
	resolveCitations,
	resolveTargetedCitations
} from './prompt';
import type { SearchHit } from '$lib/types';

const hit = (n: number): SearchHit => ({
	chunkId: n,
	documentId: 'd',
	documentName: 'Contract.pdf',
	text: `Excerpt ${n}`,
	page: n,
	headingPath: null,
	score: 0.03
});

describe('buildUserPrompt', () => {
	it('numbers excerpts with locators', () => {
		const p = buildUserPrompt('Q?', [hit(1), hit(2)]);
		expect(p).toContain('[1] (Contract.pdf · page 1)');
		expect(p).toContain('[2] (Contract.pdf · page 2)');
		expect(p.endsWith('Question: Q?')).toBe(true);
	});

	it('labels prior conversation as context rather than evidence', () => {
		const p = buildUserPrompt('Quel est son numéro ?', [hit(1)], 'Previous answer: JOHN DOE');
		expect(p).toContain('reference resolution only, not a source');
		expect(p).toContain('Previous answer: JOHN DOE');
	});

	it('pins the requested financial role without enumerating surface phrasings', () => {
		const p = buildUserPrompt('Combien ai-je envoyé pour la transaction T-123 ?', [hit(1)]);
		expect(p).toContain('Requested financial role: sent.');
		expect(p).toContain('do not substitute sent, received, fees, tax, subtotal, or total/debited');
	});

	it('requires exact structural identifiers and surfaces references near a queried identifier', () => {
		const drawing = {
			...hit(1),
			text: 'CRUSHED BASALT GRAVEL 1/4 MINUS 1/LP103'
		};
		const prompt = buildUserPrompt('Quel détail est référencé pour le gravier 1/4 inch minus ?', [
			drawing
		]);
		expect(prompt).toContain('start with the exact requested line, section, sheet, detail');
		expect(prompt).toContain('Exact nearby references copied from the excerpts: 1/LP103');
	});

	it('preserves requested direction for changes', () => {
		expect(buildUserPrompt('Variation de 2018 à 2019 ?', [hit(1)])).toContain(
			'Requested direction: 2018 is the start and 2019 is the end. Compute end minus start'
		);
	});

	it('turns substantial coordinated requests into an explicit answer checklist', () => {
		const prompt = buildUserPrompt(
			'Donne le total des ventes 2019 et le volume moyen par transaction American Express.',
			[hit(1)]
		);
		expect(prompt).toContain('Requested parts (answer each one separately):');
		expect(prompt).toContain('1. Donne le total des ventes 2019');
		expect(prompt).toContain('2. le volume moyen par transaction American Express.');
		expect(prompt).toContain('Never mix numbers between parts or documents');
	});

	it('selects only structural, directional and multi-part answers for a verification pass', () => {
		expect(needsGroundedVerification('Quelle ligne contient le remboursement ?')).toBe(true);
		expect(needsGroundedVerification('Variation de 2018 à 2019 ?')).toBe(true);
		expect(
			needsGroundedVerification(
				'Donne le total des ventes 2019 et le volume moyen par transaction American Express.'
			)
		).toBe(true);
		expect(needsGroundedVerification('Qui est le vendeur ?')).toBe(false);
		expect(needsGroundedVerification('Qui est assuré par ce devis et avec qui ?')).toBe(false);
		expect(needsGroundedVerification('Quels sont tous mes droits sur mes données ?')).toBe(true);
		expect(needsGroundedVerification('Mon ordinateur volé dans un café est-il couvert ?')).toBe(
			true
		);
		expect(needsGroundedVerification('Quel écart entre la prime annoncée et le total ?')).toBe(
			true
		);
	});

	it('does not verify simple questions with a "de … à" span or a leading framing clause', () => {
		expect(needsGroundedVerification('Quel est le montant de la prime à verser ?')).toBe(false);
		expect(needsGroundedVerification('Combien de jours a-t-il pour répondre ?')).toBe(false);
		expect(needsGroundedVerification('Selon vous, qui est le vendeur ?')).toBe(false);
		expect(needsGroundedVerification('D’après le contrat, quel est le prix de vente ?')).toBe(
			false
		);
	});

	it('does not inject part or direction constraints on a framed simple question', () => {
		const prompt = buildUserPrompt('Selon vous, qui est le vendeur ?', [hit(1)]);
		expect(prompt).not.toContain('Requested parts');
		expect(prompt).not.toContain('start-to-end direction');
		expect(prompt).not.toContain('Requested direction');
	});

	it('keeps an identity companion as one answer frame', () => {
		const prompt = buildUserPrompt('Qui est assuré par ce devis et avec qui ?', [hit(1)]);
		expect(prompt).not.toContain('Requested parts');
	});

	it('re-weighs evidence on a contested turn instead of echoing or defending', () => {
		const context = 'Previous question: Quel est le salaire ?\nPrevious answer: 3486,92 €';
		const contested = buildUserPrompt("Non, l'acompte est beaucoup plus", [hit(1)], context);
		expect(contested).toContain('The user disputes the previous answer');
		expect(contested).toContain('say plainly that the previous answer was wrong');
		// Without a previous answer there is nothing to dispute.
		const firstTurn = buildUserPrompt("Non, l'acompte est beaucoup plus", [hit(1)]);
		expect(firstTurn).not.toContain('disputes the previous answer');
		// An ordinary follow-up with context is not treated as a dispute.
		const followUp = buildUserPrompt('Quel est son montant net ?', [hit(1)], context);
		expect(followUp).not.toContain('disputes the previous answer');
	});

	it('never turns a leading interjection into an answerable part', () => {
		// Regression: "Non, l'acompte est beaucoup plus" split into two "requested
		// parts" and the model recited the user's own words back with citations.
		const prompt = buildUserPrompt("Non, l'acompte est beaucoup plus", [hit(1)]);
		expect(prompt).not.toContain('Requested parts');
		expect(prompt).not.toContain('1. Non');
	});

	it('extracts think blocks as draft notes, closed or mid-stream', () => {
		expect(extractThink('<think>weigh the clauses</think>The cap is 150 €.')).toBe(
			'weigh the clauses'
		);
		expect(extractThink('<think>first</think>middle<think>still going')).toBe('first\nstill going');
		expect(extractThink('No reasoning here.')).toBe('');
	});

	it('asks the verifier to correct rather than critique the draft', () => {
		const prompt = buildVerificationPrompt('Quelle ligne ?', 'Excerpts: source', 'Ligne 34 [1].');
		expect(prompt).toContain('Return only the corrected answer');
		expect(prompt).toContain('exact form/output identifiers');
		expect(prompt).toContain('difference is non-zero');
		expect(prompt).toContain('Treat the draft as untrusted');
		expect(prompt).toContain('A duration cannot be replaced by a price');
		expect(prompt).toContain('exact starting event');
	});

	it('derives a structured coverage contract from the question', () => {
		expect(
			buildAnswerCoverageContract(
				'Résume type, surface, période de construction, matériau et dépendances.'
			)
		).toContain('Answer each requested slot separately');
		expect(buildAnswerCoverageContract('Dans quel délai déclarer le sinistre ?')).toContain(
			'exact starting event/trigger'
		);
		expect(buildAnswerCoverageContract("Quel est le nom de l'enfant couvert ?")).toContain(
			'name is not specified'
		);
	});

	it('extracts label-value facts and exact scenario sentences before generation', () => {
		const form = {
			...hit(1),
			seq: 10,
			text:
				'- Quel type de logement avez-vous : Maison\n' +
				'- Quel type de logement souhaitez-vous assurer : Résidence principale\n' +
				'- Assurance scolaire : non ajouté'
		};
		const scenario = {
			...hit(2),
			seq: 11,
			text: "Si quelqu'un s'empare de votre ordinateur portable à un café, ce n'est pas couvert."
		};
		expect(buildEvidenceInventory('Quel type de logement est déclaré ?', [form])).toContain(
			'Quel type de logement avez-vous : Maison [1]'
		);
		expect(
			buildEvidenceInventory('Mon ordinateur volé dans un café est-il couvert ?', [scenario])
		).toContain('ordinateur portable à un café');
	});

	it('joins a form label with a short answer split into the next child chunk', () => {
		const label = {
			...hit(1),
			page: 66,
			seq: 10,
			text: 'Avez-vous actuellement une assurance habitation pour ce logement :'
		};
		const value = {
			...hit(2),
			page: 66,
			seq: 12,
			text: "Oui\n- Depuis combien de temps avez-vous votre contrat actuel ? moins d'un an"
		};
		const inventory = buildEvidenceInventory('Quelle assurance actuelle est déclarée ?', [
			label,
			value
		]);
		expect(inventory).toContain('assurance habitation pour ce logement : Oui [1][2]');
	});

	it('compacts verification evidence without changing original citation numbers', () => {
		const hits = Array.from({ length: 10 }, (_, index) => ({
			...hit(index + 1),
			seq: index + 1,
			text: `Unrelated policy boilerplate ${index}. ${'padding '.repeat(80)}`
		}));
		hits[6] = {
			...hits[6],
			page: 16,
			text: 'Si votre logement devient inhabitable, les dépenses supplémentaires sont couvertes.'
		};
		hits[7] = {
			...hits[7],
			page: 16,
			text: "La prise en charge dure au maximum un an et s'élève à 2 000 €."
		};
		const prompt = buildVerificationUserPrompt(
			'Pendant combien de temps et jusqu’à quel montant le logement inhabitable est-il couvert ?',
			hits
		);
		expect(prompt).toContain('[7] (Contract.pdf · page 16)');
		expect(prompt).toContain('[8] (Contract.pdf · page 16)');
		expect(prompt).toContain('au maximum un an');
	});

	it('keeps a decisive same-section continuation ahead of topical noise', () => {
		const hits = [
			{
				...hit(1),
				page: 24,
				seq: 24,
				text: 'Justificatifs généraux pour une demande d’indemnisation.'
			},
			{
				...hit(2),
				page: 5,
				seq: 5,
				text: 'Le complément de reconstruction peut atteindre 25 % après dépréciation.'
			},
			{
				...hit(3),
				page: 5,
				seq: 6,
				text: 'Il est payé après les travaux et sur présentation des factures.'
			}
		];
		const prompt = buildVerificationUserPrompt(
			'Comment fonctionne le complément de reconstruction de 25 % ?',
			hits
		);
		expect(prompt).toContain('[2] (Contract.pdf · page 5)');
		expect(prompt).toContain('[3] (Contract.pdf · page 5)');
	});

	it('verifies deadlines, exact details and qualified refusals', () => {
		expect(needsGroundedVerification('Dans quel délai faut-il déclarer le sinistre ?')).toBe(true);
		expect(needsGroundedVerification("Quel est le nom de l'enfant couvert ?")).toBe(true);
		expect(
			needsGroundedVerification(
				'La garantie est-elle ajoutée ?',
				"Je n'ai pas trouvé assez d'informations dans les documents joints pour répondre."
			)
		).toBe(true);
	});

	it('repairs deterministic arithmetic and consistency contradictions', () => {
		expect(
			enforceAnswerInvariants(
				'Douze mensualités font-elles la prime annuelle ?',
				"1. Oui, 14,91 € × 12 = 178,92 € et la prime vaut 185,50 € ; l'écart est de 6,58 €."
			)
		).toMatch(/^1\. Non,/);
		expect(
			enforceAnswerInvariants(
				'Are both totals equal?',
				'Yes, the first is 10 and the second is 12; the difference is 2.'
			)
		).toMatch(/^No,/);
		expect(
			enforceAnswerInvariants(
				'Le conseil et les choix sont-ils cohérents ?',
				"Le conseil est cohérent. Cependant, l'écart vient des options non ajoutées."
			)
		).toContain("n'est pas cohérent");
		expect(
			enforceAnswerInvariants(
				'La liste et le conseil sont-ils cohérents ?',
				'Le conseil est cohérent, or il recommande des options non ajoutées.'
			)
		).toContain("n'est pas cohérent");
		expect(
			enforceAnswerInvariants(
				'Douze mensualités font-elles la prime annuelle ?',
				"<think>calcul</think>1. Oui, 14,91 € × 12 = 178,92 € ; l'écart est de 6,58 €."
			)
		).toMatch(/^1\. Non,/);
	});

	it('answers the asker in the second person instead of echoing their possessive', () => {
		expect(
			enforceAnswerInvariants('Quel est mon solde ?', 'Mon solde est de 1 245,30 € [1].')
		).toBe('Votre solde est de 1 245,30 € [1].');
		expect(
			enforceAnswerInvariants('Quelles sont mes garanties ?', 'Mes garanties incluent le vol [1].')
		).toBe('Vos garanties incluent le vol [1].');
		expect(enforceAnswerInvariants('What is my balance?', 'My balance is 1,245.30 € [1].')).toBe(
			'Your balance is 1,245.30 € [1].'
		);
		// A product name keeps its own spelling, and third-person questions are
		// left alone entirely.
		expect(
			enforceAnswerInvariants('Que propose mon contrat ?', 'Mon Compte Épargne propose 2 % [1].')
		).toBe('Mon Compte Épargne propose 2 % [1].');
		expect(enforceAnswerInvariants('Quel est le solde ?', 'Mon solde est de 10 € [1].')).toBe(
			'Mon solde est de 10 € [1].'
		);
	});
});

describe('buildEvidenceInventory', () => {
	it('rebinds a form label split from its value across visual lines', async () => {
		const { buildEvidenceInventory } = await import('./prompt');
		const inventory = buildEvidenceInventory(
			'Donne le nom, la date et le lieu de naissance du souscripteur.',
			[
				{
					...hit(1),
					text: 'Identification du souscripteur :\nPrénom et Nom :\nCamille Moreau\nDate de naissance :\n03/04/1991',
					page: 69
				}
			]
		);
		expect(inventory).toContain('Prénom et Nom : Camille Moreau');
		expect(inventory).toContain('Date de naissance : 03/04/1991');
	});
});

describe('stripThink / isThinking', () => {
	it('removes closed think blocks', async () => {
		const { stripThink } = await import('./prompt');
		expect(stripThink('<think>reasoning here</think>The answer [1].')).toBe('The answer [1].');
	});

	it('hides an unclosed block and reports thinking state', async () => {
		const { stripThink, isThinking } = await import('./prompt');
		expect(stripThink('<think>still reason')).toBe('');
		expect(isThinking('<think>still reason')).toBe(true);
		expect(isThinking('<think>done</think> answer')).toBe(false);
	});
});

describe('resolveCitations', () => {
	it('preserves the cited useful fact in a qualified absence answer', () => {
		const sources = [
			{ ...hit(1), text: "L'assurance scolaire couvre les voyages de moins de trois mois." },
			{ ...hit(2), text: 'Assurance scolaire : non ajouté', page: 70 }
		];
		const result = resolveTargetedCitations(
			"Assurance scolaire : non ajouté. Cependant, le nom demandé n'est pas précisé [2].",
			sources,
			"Quel est le nom de l'enfant couvert par l'assurance scolaire ?"
		);
		expect(result.citations.map((citation) => citation.hit.page)).toEqual([70]);
	});

	it('keeps valid markers and collects citations once', () => {
		const { text, citations } = resolveCitations('Notice is 3 months [1]. See also [1][2].', [
			hit(1),
			hit(2)
		]);
		expect(text).toBe('Notice is 3 months [1]. See also [1][2].');
		expect(citations.map((c) => c.n)).toEqual([1, 2]);
	});

	it('drops hallucinated markers outside the retrieved range', () => {
		const { text, citations } = resolveCitations('Stated in [7]. Real one [2].', [hit(1), hit(2)]);
		expect(text).toBe('Stated in . Real one [1].');
		expect(citations.map((c) => c.n)).toEqual([1]);
		expect(citations[0].hit).toEqual(hit(2));
	});

	it('compacts sparse markers so answer chips and stored source rows stay aligned', () => {
		const { text, citations } = resolveCitations('Les parties sont Alice et Bob [2][3].', [
			hit(1),
			hit(2),
			hit(3)
		]);
		expect(text).toBe('Les parties sont Alice et Bob [1][2].');
		expect(citations.map((c) => [c.n, c.hit.chunkId])).toEqual([
			[1, 2],
			[2, 3]
		]);
	});

	it('repairs sparse markers in already persisted answers', () => {
		expect(compactCitationMarkers('Alice et Bob [2][3].', 2)).toBe('Alice et Bob [1][2].');
		expect(compactCitationMarkers('Unchanged [1][2].', 2)).toBe('Unchanged [1][2].');
	});

	it('rebinds a short factual answer to the passage supporting its actual names', () => {
		const irrelevant = { ...hit(1), text: 'Diagnostic plomb et amiante', page: 11 };
		const parties = {
			...hit(2),
			text: 'Vendeurs Cédric MARTIN et Hélène DUPUIS. Acquéreur Idrissa KONATÉ.',
			page: 1
		};
		const result = resolveTargetedCitations(
			'Cédric MARTIN et Hélène DUPUIS sont vendeurs, Idrissa KONATÉ est acquéreur [1].',
			[irrelevant, parties],
			'Qui sont les parties prenantes ?'
		);
		expect(result.text).toContain('[1]');
		expect(result.citations[0].hit.page).toBe(1);
	});

	it('preserves separate citations for coordinated multi-fact questions', () => {
		const price = { ...hit(1), text: 'Prix de vente 152 000 euros', page: 3 };
		const loan = { ...hit(2), text: 'Montant du prêt 152 000 euros', page: 19 };
		const result = resolveTargetedCitations(
			'Le prix est 152 000 € [1] et le prêt est 152 000 € [2].',
			[price, loan],
			'Quel est le prix et quel est le prêt ?'
		);
		expect(result.citations.map((citation) => citation.hit.page)).toEqual([3, 19]);
		expect(result.text).toContain('[1] et');
		expect(result.text).toContain('[2]');
	});

	it('passes through text with no markers', () => {
		const { text, citations } = resolveCitations('No idea.', [hit(1)]);
		expect(text).toBe('No idea.');
		expect(citations).toEqual([]);
	});

	it('canonicalizes an unsupported targeted answer into an uncited refusal', () => {
		const result = resolveTargetedCitations(
			'Le document ne précise pas cette information, car elle doit être fournie par le client [1].',
			[hit(1)],
			'Quel est son numéro personnel ?'
		);
		expect(result.text).toBe(
			"Je n'ai pas trouvé assez d'informations dans les documents joints pour répondre."
		);
		expect(result.citations).toEqual([]);
	});

	it('preserves a useful qualified answer when only the exact detail is absent', () => {
		const source = {
			...hit(1),
			text: 'Biens de valeur dont la valeur unitaire est supérieure à 5 000 euros : Oui.',
			page: 66
		};
		const result = resolveTargetedCitations(
			"L'objet exact n'est pas précisé, mais le document confirme un bien de valeur supérieure à 5 000 € [1].",
			[source],
			'Quel objet de valeur dépasse 5 000 € ?'
		);
		expect(result.text).toContain("L'objet exact n'est pas précisé");
		expect(result.citations[0].hit.page).toBe(66);
	});

	it('repairs a missing marker only when an exact structured identifier is supported', () => {
		const source = { ...hit(1), text: 'CRUSHED BASALT GRAVEL 1/4 MINUS 1/LP103' };
		const result = resolveTargetedCitations(
			'Le détail référencé est 1/LP103.',
			[source],
			'Quel détail est référencé pour 1/4 inch minus ?'
		);
		expect(result.text).toContain('[1]');
		expect(result.citations[0].hit).toEqual(source);
	});

	it('rebinds a numeric answer to the passage containing the value', () => {
		const generic = { ...hit(1), text: 'La prime est payable chaque mois.', page: 4 };
		const amount = { ...hit(2), text: 'Prime mensuelle : 14,91 EUR', page: 28 };
		const result = resolveTargetedCitations(
			'La prime mensuelle est de 14,91 € [1].',
			[generic, amount],
			'Quel est le montant de la prime mensuelle ?'
		);
		expect(result.citations[0].hit.page).toBe(28);
	});

	it('uses short exact numbers and inflection-tolerant wording for citation grounding', () => {
		const generic = {
			...hit(1),
			text: 'Les installations électriques couvertes sont situées après le compteur.',
			page: 38
		};
		const exclusion = {
			...hit(2),
			text: 'Les trottinettes électriques dont la vitesse est supérieure à 25 km/h ne sont pas couvertes.',
			page: 18
		};
		const result = resolveTargetedCitations(
			"Non, une trottinette électrique dépassant 25 km/h n'est pas couverte [1].",
			[generic, exclusion],
			'Une trottinette électrique dépassant 25 km/h est-elle couverte ?'
		);
		expect(result.citations[0].hit.page).toBe(18);
	});

	it('prefers the passage with the complete noun phrase over a neighboring analogue', () => {
		const electricity = {
			...hit(1),
			text: 'Intervention d’un électricien : Nous organisons et prenons en charge l’intervention d’un électricien. Sont couvertes les installations électriques intérieures situées après le compteur d’alimentation en électricité et les points de branchement des appareils en cas de panne ou coupure d’électricité. Sont exclus : les appareils alimentés par l’installation électrique, les pannes dues à un problème d’alimentation du fournisseur d’énergie ou une insuffisance de puissance installée, les travaux de mise en conformité de tout ou partie de l’installation électrique, les installations électriques nécessitant le déplacement de machines et de mobiliers lourds à l’aide d’équipements spéciaux.',
			page: 38
		};
		const gas = {
			...hit(2),
			text: 'Intervention d’un spécialiste du Gaz : Nous organisons et prenons en charge l’intervention d’un spécialiste du gaz. Sont couvertes les alimentations en gaz naturel après compteur.',
			page: 39
		};
		const grounding =
			"Quelle partie de l'alimentation en gaz est couverte par l'assistance ? L'assistance couvre les alimentations en gaz naturel situées après le compteur.";
		expect(citationGroundingCoverage(grounding, gas.text)).toBeGreaterThan(
			citationGroundingCoverage(grounding, electricity.text)
		);
		const result = resolveTargetedCitations(
			"L'assistance couvre l'alimentation en gaz naturel après compteur [1].",
			[electricity, gas],
			"Quelle partie de l'alimentation en gaz est couverte par l'assistance ?"
		);
		expect(result.citations[0].hit.page).toBe(39);
	});

	it('never lets a question-echoing definition outrank the clause the answer quotes', () => {
		const definition = {
			...hit(1),
			text: "Dysfonctionnement de l'installation gaz : défaillance ou panne complète du système d'alimentation en gaz à l'intérieur de Votre Domicile, le rendant inhabitable. L'assistance intervient pour ces évènements couverts.",
			page: 32,
			score: 9
		};
		const clause = {
			...hit(2),
			text: "Intervention d'un spécialiste du Gaz : Sont couvertes les alimentations en gaz naturel après compteur.",
			page: 39,
			score: 1
		};
		const result = resolveTargetedCitations(
			"L'assistance couvre les alimentations en gaz naturel après compteur [1].",
			[definition, clause],
			"Quelle partie de l'alimentation en gaz est couverte par l'assistance ?"
		);
		expect(result.citations[0].hit.page).toBe(39);
	});

	it('adds a missing citation when the answer wording is supported', () => {
		const source = { ...hit(1), text: 'Les moisissures ne sont pas couvertes.' };
		const result = resolveTargetedCitations(
			'Les moisissures ne sont pas couvertes.',
			[source],
			'Les moisissures sont-elles couvertes ?'
		);
		expect(result.text).toContain('[1]');
		expect(result.citations[0].hit).toEqual(source);
	});
});

describe('isDegenerateAnswer', () => {
	// Regression: a generation that died after one decoded token stored "1" as
	// the whole answer to "quel est le prix du devis ?" — no judge existed on
	// the reasoning-off path, and the verification pass adopted any non-empty
	// output. The boundary that matters: a terse CITED fact is legitimate.
	it('flags dead fragments', () => {
		expect(isDegenerateAnswer('1')).toBe(true);
		expect(isDegenerateAnswer('1.')).toBe(true);
		expect(isDegenerateAnswer('')).toBe(true);
		expect(isDegenerateAnswer('1. **Garantie')).toBe(true);
	});

	it('accepts terse cited facts and normal answers', () => {
		expect(isDegenerateAnswer('1 200,50 € [1].')).toBe(false);
		expect(isDegenerateAnswer('Le prix du devis est de 1 200,50 € TTC [1].')).toBe(false);
		expect(
			isDegenerateAnswer("Je n'ai pas trouvé assez d'informations dans les documents joints.")
		).toBe(false);
	});
});

describe('fitEvidenceToContext', () => {
	// Regression: a 16-excerpt coverage question assembled 4114 prompt tokens
	// against the model's 4096 window and MLC rejected it outright — the turn
	// died in an exception the retry then repeated.
	it('trims the lowest-ranked excerpts until the prompt fits', () => {
		const big = Array.from({ length: 16 }, (_, i) => ({
			...hit(i + 1),
			text: 'grande clause du contrat répétée pour peser lourd. '.repeat(24)
		}));
		const kept = fitEvidenceToContext('Quelle est la franchise ?', big);
		expect(kept.length).toBeLessThan(big.length);
		expect(kept.length).toBeGreaterThan(0);
		// Order preserved, prefix intact: citation numbers keep their meaning.
		expect(kept.map((h) => h.chunkId)).toEqual(big.slice(0, kept.length).map((h) => h.chunkId));
		const prompt = buildUserPrompt('Quelle est la franchise ?', kept);
		expect((SYSTEM_PROMPT.length + prompt.length) / 3).toBeLessThanOrEqual(3900);
	});

	it('leaves a fitting list untouched', () => {
		const small = [hit(1), hit(2)];
		expect(fitEvidenceToContext('Question ?', small)).toEqual(small);
	});
});

describe('isDegenerateAnswer — output that must never replace a draft', () => {
	it('rejects the verification checklist emitted instead of prose', () => {
		// Measured live: the verification prompt asks for this checklist to be
		// built *silently*, and a small local model printed it twelve times with
		// every field blank, under a real citation, replacing a correct draft.
		const scaffold = Array.from(
			{ length: 12 },
			() =>
				'- Requested subject: montant total [1]\n- Exact adjacent source label:\n- Value:\n- Unit:\n- Condition:\n- Exception:\n- Citation:'
		).join('\n');
		expect(isDegenerateAnswer(scaffold)).toBe(true);
	});

	it('rejects a collapsed repetition loop', () => {
		expect(
			isDegenerateAnswer(Array.from({ length: 10 }, () => 'Le montant est de 800 €.').join('\n'))
		).toBe(true);
	});

	it('keeps a real multi-line answer', () => {
		const answer = [
			'Le RAPO est facturé 1100 € HT [1].',
			'La saisine du tribunal administratif est facturée 900 € HT [2].',
			'Le référé-suspension est facturé 800 € HT pour un visa concerné [3].',
			'Le total des trois phases est donc de 2800 € HT.'
		].join('\n');
		expect(isDegenerateAnswer(answer)).toBe(false);
	});

	it('keeps a short answer that carries a citation', () => {
		expect(isDegenerateAnswer('800 € HT [1].')).toBe(false);
	});
});

describe('isRefusalLike — a refusal that blames the reader', () => {
	it('catches the model claiming the documents were not provided', () => {
		// Sixteen passages were in the prompt when this was produced, so the
		// sentence is false as well as rude; it must be replaced by the app's own
		// refusal rather than shown.
		expect(
			isRefusalLike(
				"Je ne peux pas fournir une réponse qui ne soit pas étayée par les documents fournis. Puisque vous n'avez pas fourni les documents, je ne peux pas répondre à votre question."
			)
		).toBe(true);
	});

	it('leaves a real answer alone', () => {
		expect(isRefusalLike('Le montant total est de 2800 € HT [1].')).toBe(false);
	});
});

describe('withoutRepeatedSentences', () => {
	it('drops a sentence an earlier passage already carried', () => {
		const seen = new Set<string>();
		const first =
			'La SELARL JURIS ne s’engage à aucune intervention avant paiement de cette provision. Le RAPO est facturé 1100 euros.';
		const second =
			'La SELARL JURIS ne s’engage à aucune intervention avant paiement de cette provision. Le référé est facturé 800 € HT.';
		expect(withoutRepeatedSentences(first, seen)).toBe(first);
		expect(withoutRepeatedSentences(second, seen)).toBe('Le référé est facturé 800 € HT.');
	});

	it('keeps a short repeated line: a shared label is not redundancy', () => {
		const seen = new Set<string>();
		withoutRepeatedSentences('Montant : 800 €.', seen);
		expect(withoutRepeatedSentences('Montant : 900 €.', seen)).toBe('Montant : 900 €.');
	});

	it('never empties a passage, so its citation number still says something', () => {
		const seen = new Set<string>();
		const passage =
			'Cette clause décrit précisément les modalités de règlement des provisions dues au cabinet.';
		withoutRepeatedSentences(passage, seen);
		expect(withoutRepeatedSentences(passage, seen)).toBe(passage);
	});
});

describe('hasCollapsedIntoRepetition', () => {
	it('catches the loop while it is still streaming', () => {
		// The shape measured live: the same two sentences, over and over, under a
		// real citation, for 86 seconds.
		const loop =
			"Le directeur d'agence est la Caisse Régionale de Banque Populaire Mutuel Grand Ouest. Le cabinet d'avocat s'appelle SELARL JURIS. ";
		expect(hasCollapsedIntoRepetition(loop.repeat(4))).toBe(true);
	});

	it('leaves a long answer that never repeats itself alone', () => {
		const answer = [
			'Le montant forfaitaire de base pour la phase administrative du recours est de 1100 € HT.',
			'La saisine du tribunal administratif de Nantes est facturée 900 € HT.',
			'Le référé-suspension coûte 800 € HT pour un visa concerné.',
			'Des provisions complémentaires sont adressées au fur et à mesure des interventions.'
		].join(' ');
		expect(hasCollapsedIntoRepetition(answer)).toBe(false);
	});

	it('says nothing about a stream too short to judge', () => {
		expect(hasCollapsedIntoRepetition('Le RAPO est de 1100 € HT.')).toBe(false);
	});
});

describe('signature block recovery when the parser glued the role to the footer', () => {
	it('pairs the name above a role line that carries the legal boilerplate', () => {
		const letter = {
			...hit(1),
			text:
				'BANQUE DU LITTORAL Nord – Agence : AGENCE DE CALAIS\n' +
				'Nous restons à votre disposition pour toute précision complémentaire.\n' +
				'MARTINE DUVAL\n' +
				"Votre Directrice d'Agence Caisse Régionale de Crédit Maritime Mutuel Société coopérative à capital variable, dont le siège social est 4 rue des Docks, 62100 CALAIS – 512 034"
		};
		const inventory = buildEvidenceInventory("Qui est la directrice d'agence ?", [letter]);
		expect(inventory).toContain("MARTINE DUVAL Votre Directrice d'Agence");
	});
});

describe('withoutRepeatedAnswerSentences', () => {
	it('drops the closing paragraph that restates every part already answered', () => {
		const answer =
			"Le directeur d'agence est MARTINE DUVAL [1].\n\n" +
			"Le cabinet d'avocat s'appelle SELARL DUPONT [2].\n\n" +
			"Le directeur d'agence est MARTINE DUVAL [1]. Le cabinet d'avocat s'appelle SELARL DUPONT [2].";
		expect(withoutRepeatedAnswerSentences(answer)).toBe(
			"Le directeur d'agence est MARTINE DUVAL [1].\n\n" +
				"Le cabinet d'avocat s'appelle SELARL DUPONT [2]."
		);
	});

	it('keeps short formulas and distinct sentences untouched', () => {
		const answer =
			'Oui [1].\n\nOui [2].\n\nLa garantie couvre le vol et le vandalisme dans la limite de 2 000 € [1].';
		expect(withoutRepeatedAnswerSentences(answer)).toBe(answer);
	});

	it('protects two identical short answers to two parts, and both boundary sides', () => {
		// Citations aside, "Oui" twice is two answers to two parts — kept.
		const twoParts = '1. Oui [1].\n2. Oui [2].';
		expect(withoutRepeatedAnswerSentences(twoParts)).toBe(twoParts);
		// A mid-answer verbatim self-repeat above the floor is dropped even
		// without a closing paragraph.
		expect(
			withoutRepeatedAnswerSentences(
				'Le délai de rétractation est de quatorze jours [1]. Le délai de rétractation est de quatorze jours [1]. Il court dès la signature [2].'
			)
		).toBe('Le délai de rétractation est de quatorze jours [1]. Il court dès la signature [2].');
	});
});

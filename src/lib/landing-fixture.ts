// The conversation shown on the landing and on the /dev/landing-stage sandbox.
// One fixture, both surfaces: the landing embeds the real answer-turn component
// with this data, so what the page shows is what the product renders.
//
// A furnished lease: the genre this product actually reads, with an amount and
// a delay so the answer can carry a bold figure and two citations.

import type { CitationRow, MessageExcerptRow } from '$lib/local-db/worker';

export interface LandingFixture {
	question: string;
	answer: string;
	doc: string;
	/** Substring of the first citation the landing paints as the highlight. */
	highlight: string;
	citations: CitationRow[];
	excerpts: MessageExcerptRow[];
	presendQ: string;
	presendHits: { text: string; page: number; heading: string }[];
	/** The sublet question answered, for the record window (Cloud turn). */
	subletAnswer: string;
	subletCitations: CitationRow[];
	/** Second document and its exchange, so the thread reads lived-in. */
	doc2: string;
	meterQ: string;
	meterAnswer: string;
	meterCitations: CitationRow[];
}

function rows(doc: string, snippets: string[]) {
	const citations: CitationRow[] = snippets.map((snippet) => ({
		messageId: 'stage',
		chunkId: null,
		snippet,
		documentName: doc,
		locator: 'p. 1'
	}));
	const excerpts: MessageExcerptRow[] = snippets.map((snippet) => ({
		messageId: 'stage',
		chunkId: null,
		sent: false,
		excluded: false,
		snippet,
		documentName: doc,
		locator: 'p. 1'
	}));
	return { citations, excerpts };
}

const FR_DOC = 'bail-location-meublee.pdf';
const FR = {
	question: 'Quel est le montant du dépôt de garantie, et dans quel délai est-il restitué ?',
	highlight: 'dépôt de garantie de 1 380 euros',
	answer:
		'Le dépôt de garantie est fixé à **1 380 €**, soit un mois de loyer hors charges [1]. Il est restitué dans un délai maximal d’un mois après la remise des clés si l’état des lieux de sortie est conforme, et de deux mois dans le cas contraire [2].',
	doc: FR_DOC,
	...rows(FR_DOC, [
		'Le locataire verse à la signature un dépôt de garantie de 1 380 euros, correspondant à un mois de loyer en principal.',
		'Il est restitué dans un délai maximal d’un mois à compter de la remise des clés lorsque l’état des lieux de sortie est conforme à l’état des lieux d’entrée, ou de deux mois dans le cas contraire.'
	]),
	doc2: 'etat-des-lieux.pdf',
	meterQ: 'Quels sont les relevés des compteurs à l’entrée ?',
	meterAnswer:
		'Le compteur électrique affichait **045 231 kWh** et le compteur d’eau froide 1 208,4 m³ à la remise des clés [1]. Deux jeux de clés ont été remis, dont un badge d’accès au hall [1].',
	meterCitations: [
		{
			messageId: 'stage',
			chunkId: null,
			snippet:
				'Compteur électrique : 045 231 kWh. Compteur d’eau froide : 1 208,4 m³. Deux jeux de clés remis, dont un badge d’accès au hall.',
			documentName: 'etat-des-lieux.pdf',
			locator: 'p. 1'
		}
	],
	presendQ: 'Le bail autorise-t-il la sous-location pour de courtes durées ?',
	subletAnswer:
		'Non, pas sans accord écrit et préalable du bailleur, y compris pour de courtes durées [1]. En cas de manquement, la clause résolutoire de l’article 14 peut être invoquée après mise en demeure restée sans effet un mois [2].',
	subletCitations: [
		{
			messageId: 'stage',
			chunkId: null,
			snippet:
				'Toute sous-location, totale ou partielle, est subordonnée à l’accord écrit et préalable du bailleur, y compris pour de courtes durées.',
			documentName: FR_DOC,
			locator: 'p. 2'
		},
		{
			messageId: 'stage',
			chunkId: null,
			snippet:
				'En cas de manquement aux obligations de l’article 9, le bailleur peut se prévaloir de la clause résolutoire prévue à l’article 14.',
			documentName: FR_DOC,
			locator: 'p. 3'
		}
	],
	presendHits: [
		{
			text: 'Toute sous-location, totale ou partielle, est subordonnée à l’accord écrit et préalable du bailleur, y compris pour de courtes durées. Le loyer au mètre carré du logement sous-loué ne peut excéder celui payé par le locataire principal.',
			page: 2,
			heading: 'Article 9 · Sous-location'
		},
		{
			text: 'En cas de manquement aux obligations de l’article 9, le bailleur peut se prévaloir de la clause résolutoire prévue à l’article 14, après mise en demeure restée infructueuse pendant un délai d’un mois.',
			page: 3,
			heading: 'Article 14 · Clause résolutoire'
		},
		{
			text: 'Le locataire jouit des lieux en bon père de famille et les occupe à titre de résidence principale au sens de l’article 2 de la loi du 6 juillet 1989.',
			page: 1,
			heading: 'Article 3 · Destination des lieux'
		}
	]
} satisfies LandingFixture;

const EN_DOC = 'furnished-lease.pdf';
const EN = {
	question: 'What is the security deposit, and how quickly is it returned?',
	highlight: 'security deposit of 1,380 euros',
	answer:
		'The security deposit is **€1,380**, one month of rent excluding charges [1]. It is returned within one month of the keys being handed back when the exit inventory matches, and within two months otherwise [2].',
	doc: EN_DOC,
	...rows(EN_DOC, [
		'The tenant pays on signature a security deposit of 1,380 euros, corresponding to one month of rent in principal.',
		'It is returned within a maximum of one month from the handover of the keys when the exit inventory matches the entry inventory, or two months otherwise.'
	]),
	doc2: 'inventory-report.pdf',
	meterQ: 'What were the meter readings on entry?',
	meterAnswer:
		'The electricity meter read **045,231 kWh** and the cold water meter 1,208.4 m³ when the keys were handed over [1]. Two sets of keys were provided, including one hall access badge [1].',
	meterCitations: [
		{
			messageId: 'stage',
			chunkId: null,
			snippet:
				'Electricity meter: 045,231 kWh. Cold water meter: 1,208.4 m³. Two sets of keys handed over, including one hall access badge.',
			documentName: 'inventory-report.pdf',
			locator: 'p. 1'
		}
	],
	presendQ: 'Does the lease allow subletting for short stays?',
	subletAnswer:
		'No, not without the landlord’s prior written consent, including for short stays [1]. In case of breach, the termination clause of article 14 can be invoked after formal notice has remained without effect for one month [2].',
	subletCitations: [
		{
			messageId: 'stage',
			chunkId: null,
			snippet:
				'Any subletting, in whole or in part, requires the prior written consent of the landlord, including for short stays.',
			documentName: EN_DOC,
			locator: 'p. 2'
		},
		{
			messageId: 'stage',
			chunkId: null,
			snippet:
				'In the event of a breach of the obligations of article 9, the landlord may invoke the termination clause provided in article 14.',
			documentName: EN_DOC,
			locator: 'p. 3'
		}
	],
	presendHits: [
		{
			text: 'Any subletting, in whole or in part, requires the prior written consent of the landlord, including for short stays. The rent per square metre of the sublet dwelling may not exceed that paid by the principal tenant.',
			page: 2,
			heading: 'Article 9 · Subletting'
		},
		{
			text: 'In the event of a breach of the obligations of article 9, the landlord may invoke the termination clause provided in article 14, after formal notice has remained without effect for one month.',
			page: 3,
			heading: 'Article 14 · Termination clause'
		},
		{
			text: 'The tenant shall occupy the premises with due care as their principal residence within the meaning of article 2 of the law of 6 July 1989.',
			page: 1,
			heading: 'Article 3 · Use of the premises'
		}
	]
} satisfies LandingFixture;

export const LANDING_FIXTURE: Record<'fr' | 'en', LandingFixture> = { fr: FR, en: EN };

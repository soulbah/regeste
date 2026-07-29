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
}

function rows(doc: string, snippets: string[]) {
	const citations: CitationRow[] = snippets.map((snippet) => ({
		messageId: 'stage',
		chunkId: null,
		snippet,
		documentName: doc,
		locator: 'p. 3'
	}));
	const excerpts: MessageExcerptRow[] = snippets.map((snippet) => ({
		messageId: 'stage',
		chunkId: null,
		sent: false,
		excluded: false,
		snippet,
		documentName: doc,
		locator: 'p. 3'
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
	presendQ: 'Le bail autorise-t-il la sous-location pour de courtes durées ?',
	presendHits: [
		{
			text: 'Toute sous-location, totale ou partielle, est subordonnée à l’accord écrit et préalable du bailleur, y compris pour de courtes durées. Le loyer au mètre carré du logement sous-loué ne peut excéder celui payé par le locataire principal.',
			page: 4,
			heading: 'Article 9 · Sous-location'
		},
		{
			text: 'En cas de manquement aux obligations de l’article 9, le bailleur peut se prévaloir de la clause résolutoire prévue à l’article 14, après mise en demeure restée infructueuse pendant un délai d’un mois.',
			page: 6,
			heading: 'Article 14 · Clause résolutoire'
		},
		{
			text: 'Le locataire jouit des lieux en bon père de famille et les occupe à titre de résidence principale au sens de l’article 2 de la loi du 6 juillet 1989.',
			page: 2,
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
	presendQ: 'Does the lease allow subletting for short stays?',
	presendHits: [
		{
			text: 'Any subletting, in whole or in part, requires the prior written consent of the landlord, including for short stays. The rent per square metre of the sublet dwelling may not exceed that paid by the principal tenant.',
			page: 4,
			heading: 'Article 9 · Subletting'
		},
		{
			text: 'In the event of a breach of the obligations of article 9, the landlord may invoke the termination clause provided in article 14, after formal notice has remained without effect for one month.',
			page: 6,
			heading: 'Article 14 · Termination clause'
		},
		{
			text: 'The tenant shall occupy the premises with due care as their principal residence within the meaning of article 2 of the law of 6 July 1989.',
			page: 2,
			heading: 'Article 3 · Use of the premises'
		}
	]
} satisfies LandingFixture;

export const LANDING_FIXTURE: Record<'fr' | 'en', LandingFixture> = { fr: FR, en: EN };

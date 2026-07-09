// O1 (spec 014): bundled fictional sample documents for the demo chat.
// Everything here is invented — names, addresses, amounts.

export interface DemoSample {
	name: string;
	content: string;
}

export const DEMO_SAMPLES: DemoSample[] = [
	{
		name: 'contrat-de-location.md',
		content: `# Contrat de location — appartement (document fictif)

Entre la société Alpha Immobilier, bailleur, et Madame Claire Dupont, locataire, il a été convenu ce qui suit pour l'appartement situé 12 rue des Lilas à Lyon.

## Durée du bail

Le bail est conclu pour une durée de trois ans à compter du premier septembre. Il se renouvelle tacitement par périodes de trois ans sauf congé donné dans les formes prévues.

## Loyer et charges

Le loyer mensuel est fixé à huit cent cinquante euros hors charges. Les provisions pour charges s'élèvent à quatre-vingt-dix euros par mois, régularisées chaque année.

## Résiliation et préavis

Le locataire peut résilier le bail à tout moment en adressant une lettre recommandée avec accusé de réception. Le préavis est de trois mois à compter de la réception de la lettre par le bailleur. En zone tendue, le préavis est réduit à un mois sur justificatif.

## Dépôt de garantie

Le dépôt de garantie correspond à un mois de loyer hors charges. Il est restitué dans un délai maximal de deux mois après la remise des clés, déduction faite des sommes justifiées.

## Assurance habitation

Le locataire est tenu de souscrire une assurance couvrant les risques locatifs et d'en justifier chaque année à la demande du bailleur.
`
	},
	{
		name: 'rental-agreement.md',
		content: `# Rental agreement — apartment (fictional document)

Between Alpha Properties Ltd, landlord, and Ms Claire Dupont, tenant, the following has been agreed for the apartment at 12 Lilac Street.

## Term of the lease

The lease is granted for a term of three years starting on the first of September. It renews automatically for further three-year periods unless notice is properly given.

## Rent and service charges

The monthly rent is eight hundred and fifty euros excluding charges. Service charge instalments are ninety euros per month, reconciled annually.

## Termination and notice period

The tenant may terminate the lease at any time by registered letter with acknowledgment of receipt. The notice period is three months from the date the landlord receives the letter. In high-demand areas the notice period is reduced to one month with supporting evidence.

## Security deposit

The security deposit equals one month of rent excluding charges. It is returned within two months of the keys being handed back, less any justified deductions.

## Home insurance

The tenant must hold insurance covering rental risks and provide proof of it every year on request.
`
	}
];

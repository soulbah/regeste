import type { AggregateOperation } from '$lib/analysis/query-router';
import type { QuestionRoute, SearchHit } from '$lib/types';

interface TransferSeed {
	page: number;
	id: string;
	date: string;
	sent: string;
	received: string;
	fee: string;
	total: string;
}

const TRANSFERS: TransferSeed[] = [
	{
		page: 1,
		id: 'TX-ALPHA-001',
		date: '20 juin 2026',
		sent: '120,00',
		received: '1 200 000',
		fee: '2,00',
		total: '122,00'
	},
	{
		page: 2,
		id: 'TX-BRAVO-002',
		date: '12 juin 2026',
		sent: '80,00',
		received: '800 000',
		fee: '2,00',
		total: '82,00'
	},
	{
		page: 3,
		id: 'TX-CHARLIE-003',
		date: '08 juin 2026',
		sent: '120,00',
		received: '1 212 000',
		fee: '2,00',
		total: '122,00'
	},
	{
		page: 4,
		id: 'TX-DELTA-004',
		date: '13 mai 2026',
		sent: '400,00',
		received: '4 120 000',
		fee: '3,00',
		total: '403,00'
	},
	{
		page: 5,
		id: 'TX-ECHO-005',
		date: '09 mai 2026',
		sent: '90,00',
		received: '927 000',
		fee: '1,00',
		total: '91,00'
	},
	{
		page: 6,
		id: 'TX-FOXTROT-006',
		date: '02 mai 2026',
		sent: '310,00',
		received: '3 193 000',
		fee: '2,00',
		total: '312,00'
	},
	{
		page: 7,
		id: 'TX-GOLF-007',
		date: '20 avril 2026',
		sent: '250,00',
		received: '2 600 000',
		fee: '0,00',
		total: '250,00'
	}
];

export const RECORD_STRESS_HITS: SearchHit[] = TRANSFERS.map((transfer) => ({
	chunkId: transfer.page,
	documentId: 'stress-transfers',
	documentName: 'repeated-transfers.pdf',
	seq: transfer.page - 1,
	page: transfer.page,
	headingPath: null,
	score: 1,
	text: `Récépissé de transfert
Expéditeur Exemple
Transaction
N° ${transfer.id} du ${transfer.date} à 10:30
Montant ${transfer.sent} € Montant reçu par le bénéficiaire ${transfer.received} GNF
Frais de transfert ${transfer.fee} €
Taux de change indicatif
Total ${transfer.total} €
Bénéficiaire Exemple
Motif Assistance familiale
Conditions générales identiques sur chaque récépissé.`
}));

export interface RecordStressCase {
	query: string;
	route: QuestionRoute;
	operation?: AggregateOperation;
	groups?: Array<{ currency: string; valueMinor: number; count: number }>;
	count?: number;
	pages?: number[];
	ambiguous?: boolean;
}

const group = (currency: string, valueMinor: number, count: number) => [
	{ currency, valueMinor, count }
];

export const RECORD_STRESS_CASES: RecordStressCase[] = [
	{
		query: 'Quelle est la somme totale envoyée en juin ?',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 32000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Combien ai-je envoyé en juin ?',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 32000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Somme des montants envoyés en juin 2026',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 32000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Total des transferts envoyés en juin',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 32000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Liste chaque montant envoyé en juin',
		route: 'aggregate',
		operation: 'list',
		groups: group('EUR', 32000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Quelle somme totale a été débitée en juin ?',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 32600, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Combien ai-je payé de frais en juin ?',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 600, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Quelle somme a été reçue en GNF en juin ?',
		route: 'aggregate',
		operation: 'sum',
		groups: group('GNF', 3212000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Combien de transferts ont été effectués en juin ?',
		route: 'aggregate',
		operation: 'count',
		count: 3,
		pages: [1, 2, 3]
	},
	{
		query: 'Quel est le montant moyen envoyé en juin ?',
		route: 'aggregate',
		operation: 'average',
		groups: group('EUR', 10667, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Quel est le minimum envoyé en juin ?',
		route: 'aggregate',
		operation: 'minimum',
		groups: group('EUR', 8000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Quel est le montant maximum envoyé en juin ?',
		route: 'aggregate',
		operation: 'maximum',
		groups: group('EUR', 12000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Somme envoyée en mai',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 80000, 3),
		pages: [4, 5, 6]
	},
	{
		query: 'Total débité en mai',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 80600, 3),
		pages: [4, 5, 6]
	},
	{
		query: 'Total des frais en mai',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 600, 3),
		pages: [4, 5, 6]
	},
	{
		query: 'Somme reçue en mai',
		route: 'aggregate',
		operation: 'sum',
		groups: group('GNF', 8240000, 3),
		pages: [4, 5, 6]
	},
	{
		query: 'Nombre de transactions en mai',
		route: 'aggregate',
		operation: 'count',
		count: 3,
		pages: [4, 5, 6]
	},
	{
		query: 'Moyenne des montants envoyés en mai',
		route: 'aggregate',
		operation: 'average',
		groups: group('EUR', 26667, 3),
		pages: [4, 5, 6]
	},
	{
		query: 'Montant minimum envoyé en mai',
		route: 'aggregate',
		operation: 'minimum',
		groups: group('EUR', 9000, 3),
		pages: [4, 5, 6]
	},
	{
		query: 'Montant le plus élevé envoyé en mai',
		route: 'aggregate',
		operation: 'maximum',
		groups: group('EUR', 40000, 3),
		pages: [4, 5, 6]
	},
	{
		query: 'Somme envoyée en avril',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 25000, 1),
		pages: [7]
	},
	{
		query: 'Total des frais en avril',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 0, 1),
		pages: [7]
	},
	{
		query: 'Somme envoyée pour toutes les transactions',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 137000, 7),
		pages: [1, 2, 3, 4, 5, 6, 7]
	},
	{
		query: 'Total débité pour tous les transferts',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 138200, 7),
		pages: [1, 2, 3, 4, 5, 6, 7]
	},
	{
		query: 'Somme de tous les frais',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 1200, 7),
		pages: [1, 2, 3, 4, 5, 6, 7]
	},
	{
		query: 'Somme reçue pour toutes les transactions',
		route: 'aggregate',
		operation: 'sum',
		groups: group('GNF', 14052000, 7),
		pages: [1, 2, 3, 4, 5, 6, 7]
	},
	{
		query: 'Combien de transactions au total ?',
		route: 'aggregate',
		operation: 'count',
		count: 7,
		pages: [1, 2, 3, 4, 5, 6, 7]
	},
	{
		query: 'Moyenne envoyée sur toutes les transactions',
		route: 'aggregate',
		operation: 'average',
		groups: group('EUR', 19571, 7),
		pages: [1, 2, 3, 4, 5, 6, 7]
	},
	{
		query: 'Plus petit montant envoyé parmi tous les transferts',
		route: 'aggregate',
		operation: 'minimum',
		groups: group('EUR', 8000, 7),
		pages: [1, 2, 3, 4, 5, 6, 7]
	},
	{
		query: 'Plus grand montant envoyé parmi tous les transferts',
		route: 'aggregate',
		operation: 'maximum',
		groups: group('EUR', 40000, 7),
		pages: [1, 2, 3, 4, 5, 6, 7]
	},
	{
		query: 'Somme envoyée du 01/06/2026 au 30/06/2026',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 32000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Total envoyé le 12/06/2026',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 8000, 1),
		pages: [2]
	},
	{
		query: 'Somme envoyée en 2026',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 137000, 7),
		pages: [1, 2, 3, 4, 5, 6, 7]
	},
	{
		query: 'How much was sent during June 2026?',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 32000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'What were all fees during June?',
		route: 'aggregate',
		operation: 'list',
		groups: group('EUR', 600, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'How many transfers were made in June?',
		route: 'aggregate',
		operation: 'count',
		count: 3,
		pages: [1, 2, 3]
	},
	{
		query: 'How much was received during June?',
		route: 'aggregate',
		operation: 'sum',
		groups: group('GNF', 3212000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'What was the average amount sent in June?',
		route: 'aggregate',
		operation: 'average',
		groups: group('EUR', 10667, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Combien ai je envoye en juin',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 32000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Somme totale envoyees en juin',
		route: 'aggregate',
		operation: 'sum',
		groups: group('EUR', 32000, 3),
		pages: [1, 2, 3]
	},
	{
		query: 'Détaillez chaque somme envoyée en juin',
		route: 'aggregate',
		operation: 'list',
		groups: group('EUR', 32000, 3),
		pages: [1, 2, 3]
	},
	{ query: 'Quel est le total en juin ?', route: 'aggregate', operation: 'sum', ambiguous: true },
	{
		query: 'Somme envoyée en juillet',
		route: 'aggregate',
		operation: 'sum',
		groups: [],
		pages: []
	},
	{ query: 'Quel est le montant de la transaction TX-BRAVO-002 ?', route: 'targeted' },
	{ query: 'Qui est le bénéficiaire ?', route: 'targeted' },
	{ query: 'Compare les transferts de mai et juin', route: 'synthesis' },
	{ query: 'Quel est le total de la facture F-102 ?', route: 'targeted' },
	{
		query: 'List each amount sent across all transfers',
		route: 'aggregate',
		operation: 'list',
		groups: group('EUR', 137000, 7),
		pages: [1, 2, 3, 4, 5, 6, 7]
	}
];

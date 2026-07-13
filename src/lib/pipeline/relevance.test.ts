import { describe, expect, it } from 'vitest';
import { hasAnswerBearingEvidence, isWeakMatch, relevancePercent } from './relevance';
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

	it('accepts typoed and bilingual attribute evidence', () => {
		expect(
			hasAnswerBearingEvidence('Quel est le prxi de vnete exct du bien Cpelle ?', [
				evidenceHit('Le prix de vente exact du bien Martin est 146.000,00 €.')
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

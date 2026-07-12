# Rapport fonctionnel — intelligence locale dans le navigateur

Date : 11 juillet 2026

## Conclusion

Le principal problème n’était pas seulement la taille du modèle. Le produit demandait à un petit LLM
de compenser trois faiblesses en amont : des passages trop larges, une recherche qui filtrait trop tard,
et des calculs exhaustifs confiés à une génération probabiliste. Ces trois responsabilités sont
maintenant séparées.

Le choix final est : recherche hybride locale rapide pour retrouver, chemin analytique déterministe
pour compter et calculer, LLM local seulement pour rédiger ou synthétiser. Aucun contenu du corpus de
test n’a quitté l’appareil.

## Problèmes trouvés

1. Les chunks pouvaient concentrer plusieurs faits sans contexte de fichier ou de section. Cela
   diminuait la précision des embeddings et augmentait le contexte envoyé au modèle.
2. La recherche vectorielle prenait auparavant un top global puis filtrait les documents sélectionnés.
   Un bon résultat pouvait donc disparaître avant le filtre. Le temps froid mélangeait aussi chargement
   du modèle, embedding de la question et recherche.
3. Un top 8 de passages ne peut pas garantir une réponse exhaustive sur 20 ou 100 factures. Même avec
   un meilleur LLM, une facture absente du contexte est impossible à additionner.
4. Les totaux étaient traités comme une question de rédaction. Les petits modèles sont fragiles sur
   l’arithmétique multi-étapes et sur la distinction TTC, HT, TVA et devises.
5. Qwen3 raisonnait parfois sur une question simple, ajoutant une latence cachée. Afficher cette chaîne
   brute aurait donné une fausse impression de preuve et exposé du texte spéculatif.
6. Le modèle local capable précédent, Qwen3-1.7B, restait trop faible pour les synthèses difficiles.

## Solutions et choix définitifs

### Index documentaire

- Chunks structurels ramenés à une enveloppe conservatrice de 1 000 caractères, avec 120 caractères
  de recouvrement seulement dans la même section.
- Le texte cité reste intact. Une représentation `search_text` séparée ajoute le nom du document et le
  chemin de titre pour la recherche.
- Les lignes visuelles PDF et les lignes de tableaux DOCX restent groupées afin de garder libellé et
  montant ensemble.
- EmbeddingGemma 300M q4, tronqué et renormalisé à 256 dimensions, devient le profil WebGPU. E5-small
  q8/384d reste le repli WASM. Un changement de modèle est visible et la reconstruction échange les
  index atomiquement.

EmbeddingGemma est conçu pour la recherche multilingue et fournit des embeddings redimensionnables ;
le choix 256d réduit stockage et coût de distance sans changer le texte source
([carte officielle](https://huggingface.co/google/embeddinggemma-300m)).

### Recherche

- FTS et vecteurs sont maintenant filtrés par documents **avant** le classement.
- La recherche lexicale démarre immédiatement pendant le calcul de l’embedding de la question.
- Les deux listes sont fusionnées par RRF ; les scores lexical, sémantique et fusionné restent
  disponibles pour le diagnostic.
- Aucun reranker supplémentaire n’est installé : il ajouterait un autre téléchargement de plusieurs
  centaines de Mo sans preuve de gain sur le corpus produit.

### Calculs exhaustifs

- Un routeur FR/EN reconnaît somme, moyenne, minimum, maximum et comptage sur un ensemble de documents.
- Ce chemin lit tous les chunks des documents activés, extrait les faits monétaires avec leur citation,
  met le cache à jour par version d’extracteur, puis calcule en centimes entiers.
- Les devises ne sont jamais additionnées ensemble. Les documents ambigus sont signalés et exclus au
  lieu d’être devinés.
- Le résultat ne dépend pas du LLM. Le modèle rédige uniquement les questions qui ne relèvent pas de ce
  chemin déterministe.

Cette architecture suit le constat des benchmarks de raisonnement financier : les questions sur des
documents combinent récupération, opérations numériques et preuves, ce que mesurent notamment
[TAT-QA](https://arxiv.org/abs/2105.07624) et
[FinanceBench](https://arxiv.org/abs/2311.11944).

### Modèle et raisonnement

- Qwen3.5-2B q4 est le niveau capable ; Qwen3.5-4B q4 est sélectionné sur les appareils les plus forts.
  Les petits niveaux Llama 1B et Qwen 0.6B CPU restent des replis.
- Question factuelle : réflexion explicitement désactivée.
- Comparaison ou synthèse : réflexion activée, avec la limite générale de 700 tokens.
- Calcul exhaustif : aucune réflexion LLM, puisque le moteur déterministe est plus fiable et plus rapide.

La carte officielle de Qwen3.5-2B rapporte un gain important sur MMLU-Pro par rapport à Qwen3-1.7B
([Qwen](https://huggingface.co/Qwen/Qwen3.5-2B)). WebLLM expose le contrôle `enable_thinking`
([API WebLLM](https://webllm.mlc.ai/docs/user/api_reference.html)). Les recommandations officielles
convergent aussi sur un point UX : la réflexion aide surtout les tâches complexes, mais les produits
exposent des résumés plutôt que la chaîne brute. Gemini fournit des _thought summaries_
([Google](https://ai.google.dev/gemini-api/docs/thinking)) et OpenAI indique ne pas montrer les chaînes
brutes aux utilisateurs ([OpenAI](https://openai.com/index/learning-to-reason-with-llms/)).

Le choix UX est donc un journal de travail factuel : « documents recherchés », « passages vérifiés »,
« valeurs calculées », « rédaction ». Il est visible pendant l’attente, se replie dès que la réponse
arrive, puis reste consultable au clavier. Le résumé persistant contient les opérations et le calcul,
jamais une narration interne du modèle.

## Benchmarks locaux

Chromium, même machine, corpus synthétique de 25 factures, après chargement des modèles :

| Mesure                      |       Résultat |
| --------------------------- | -------------: |
| Recall@5                    |          100 % |
| Exactitude du total         |          100 % |
| Couverture des citations    |          100 % |
| Recherche froide            |       27,73 ms |
| Recherche chaude p95        |       29,76 ms |
| Agrégation p95, cache chaud |        2,93 ms |
| Qwen3.5-4B TTFT             |         1,17 s |
| Qwen3.5-4B débit            | 13,28 tokens/s |
| Taille cache Qwen3.5-4B     |     2 269,7 Mo |
| Taille cache embeddings     |       342,2 Mo |
| Données envoyées            |        0 octet |

Test conversationnel : trois factures à 23,25 €, 24,25 € et 25,25 € donnent 72,75 €, avec trois
citations sur trois. Le modèle local répond correctement à la question factuelle ciblée et le journal
live s’affiche durant la génération.

## Limites restantes

- Le moteur analytique couvre aujourd’hui les montants usuels. Les remises complexes, retenues,
  échéanciers et tableaux comptables demandent de nouveaux extracteurs typés.
- Le 4B est excellent sur cette machine mais son téléchargement de 2,4 Go est trop lourd comme défaut
  universel ; le 2B reste le meilleur compromis capable.
- Les PDF scannés dépendent toujours du chantier OCR 023.
- Le corpus synthétique vérifie la régression fonctionnelle et la vitesse locale, pas la diversité de
  vraies mises en page. La prochaine campagne doit ajouter un corpus anonymisé de factures réelles et
  mesurer précision par champ, ambiguïtés et taux de refus.

## Validation

- Migration locale v8→v9 exécutée dans Chromium sans erreur console.
- Journal live, repli automatique, ouverture clavier/souris du résumé et citations vérifiés dans le chat.
- 42 tests passent.
- `bun run verify` passe : typecheck, lint, tests et build Cloudflare.

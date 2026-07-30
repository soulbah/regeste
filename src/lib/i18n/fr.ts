// French dictionary (spec 016). Typed against the English dictionary so a
// missing key fails typecheck. Vouvoiement; mode names say where the answer is
// computed and ARE translated (see modes.*.name).

import type { en } from './en';

export const fr: Record<keyof typeof en, string> = {
	// Common
	'common.cancel': 'Annuler',
	'common.close': 'Fermer',
	'disabled.chooseMode': "Choisissez d'abord un mode IA.",
	'disabled.modeNotReady': "Terminez d'abord la configuration de ce mode.",
	'disabled.needUrl': "Renseignez d'abord l'URL de base.",
	'disabled.emptyMessage': "Écrivez d'abord un message.",
	'disabled.indexing': 'Ce document est encore en cours de préparation.',
	'disabled.indexingChat': 'Attendez que le premier document soit prêt.',
	'disabled.needEmail': "Saisissez d'abord un email valide.",
	'disabled.selectPassages': 'Sélectionnez au moins un passage.',
	'disabled.selectDoc': 'Sélectionnez au moins un document.',
	'disabled.consentFirst': "Acceptez d'abord l'envoi des passages.",
	'common.save': 'Enregistrer',
	'common.send': 'Envoyer',
	'common.continue': 'Continuer',
	'common.delete': 'Supprimer',
	'common.page': 'page {n}',
	'common.pages': '{n} pages',
	'common.requests': '{count} requête{s}',
	'common.passages': '{count} passage{s}',
	'common.cloudAi': 'IA cloud',

	// Sidebar
	'sidebar.newChat': 'Nouvelle discussion',
	'sidebar.documents': 'Documents',
	'sidebar.search': 'Rechercher',
	'sidebar.privacyReport': 'Rapport de confidentialité',
	'sidebar.settings': 'Réglages',
	'sidebar.pinned': 'Épinglées',
	'sidebar.today': "Aujourd'hui",
	'sidebar.yesterday': 'Hier',
	'sidebar.previous': 'Précédentes',
	'sidebar.pin': 'Épingler',
	'sidebar.unpin': 'Désépingler',
	'sidebar.rename': 'Renommer',
	'sidebar.exportMarkdown': 'Exporter en Markdown',
	'sidebar.renameTitle': 'Renommer la discussion',
	'sidebar.chatTitleAria': 'Titre de la discussion',
	'sidebar.deleteTitle': 'Supprimer cette discussion ?',
	'sidebar.deleteDescription':
		'« {title} » et ses messages seront définitivement supprimés de cet appareil. Les documents restent dans votre bibliothèque.',
	'sidebar.resizeAria': 'Redimensionner la barre latérale',
	'sidebar.guest': 'Invité',
	'sidebar.localWorkspace': 'Espace de travail local',

	// Command palette
	'palette.placeholder': 'Rechercher discussions, documents, commandes…',
	'palette.noResults': 'Rien trouvé.',
	'palette.hint': 'Tapez pour tout rechercher.',
	'palette.chats': 'Discussions',
	'palette.documents': 'Documents',
	'palette.commands': 'Commandes',

	// Composer
	'composer.placeholder': 'Posez une question sur vos documents…',
	'composer.followUp': 'Poser une question de suivi…',
	'composer.attachFrom': 'Joindre depuis vos documents',
	'composer.footer': 'Les réponses citent vos documents',
	'composer.preparingOne': 'Préparation de {name}',
	'composer.preparingMany': 'Préparation de {count} documents',
	'composer.preparingStep': '{phase}, étape {step} sur 4',
	'composer.preparingAvailable': '{count} prêt, vous pouvez déjà poser une question',
	'composer.documentsReady': 'Vos documents sont prêts pour la recherche',
	'composer.waitPlaceholder': 'Écrivez votre question, elle partira dès que le document est prêt…',

	// Preset actions (R3)
	'actions.menu': 'Actions',
	'actions.summarize': 'Résumer',
	'actions.summarize.q': 'Résumez les documents joints en quelques phrases.',
	'actions.dates': 'Dates clés',
	'actions.dates.q': 'Listez les dates clés des documents, avec ce qui se passe à chacune.',
	'actions.amounts': 'Montants',
	'actions.amounts.q': 'Listez chaque montant des documents et ce qu’il couvre.',
	'actions.obligations': 'Obligations',
	'actions.obligations.q': 'Listez les obligations de chaque partie selon ces documents.',

	// Add documents popover
	'addDocs.choose': 'Mes documents',
	'addDocs.upload': 'Importer un fichier',

	// Mode selector — les noms disent OÙ la réponse est calculée (voir en.ts).
	'modes.private.name': 'Cet appareil',
	'modes.assisted.name': 'Cloud',
	'modes.myai.name': 'Votre serveur',
	'modes.private.description': 'Tout reste sur cet appareil.',
	'modes.assisted.description': 'Seuls les passages pertinents sont traités en ligne.',
	'modes.myai.description': "Utilisez votre propre fournisseur d'IA.",
	'modes.best': 'Idéal pour vous',
	'modes.bestReason.noGpu': "ce navigateur ne peut pas exécuter l'IA sur votre appareil",
	'modes.bestReason.local': "cet appareil peut exécuter l'IA localement",
	'modes.private.checking': 'Vérification de cet appareil…',
	'modes.private.unavailable': 'Indisponible sur cet appareil',
	'modes.private.download': 'Téléchargement unique de {size}, puis fonctionne hors ligne',
	'modes.private.downloadLite': 'Téléchargement unique de {size} · plus lent, tout reste ici',
	'modes.private.readyLite': 'Prêt · plus lent sur cet appareil, fonctionne hors ligne',
	'modes.private.preparing': "Préparation de l'IA privée… {pct}%",
	'modes.private.loading': "Chargement de l'IA privée…",
	'modes.private.ready': 'Prêt · fonctionne hors ligne',
	'modes.error': 'Un problème est survenu',
	'llm.error.ephemeral':
		'Une fenêtre privée ne peut pas stocker l’IA. Ouvrez ceci dans une fenêtre normale, ou choisissez Cloud ou Votre serveur.',
	'llm.error.storage':
		'Ce navigateur n’a plus de place pour l’IA. Libérez de l’espace disque et réessayez, ou choisissez Cloud ou Votre serveur.',
	'llm.error.memory':
		'Cet appareil n’a plus de mémoire pour préparer l’IA. Fermez d’autres onglets et réessayez.',
	'modes.locked': 'Verrouillé · cette discussion est privée uniquement',
	'modes.offlineOn': 'Le mode hors ligne est activé',
	'modes.choose': 'Mode de réponse',
	'onboard.chooseMode': 'Choisir le mode de réponse',
	'onboard.headline': 'Choisissez qui vous répond.',
	'onboard.headlineSub': 'Vous pourrez en changer à tout moment.',
	'onboard.pick': 'Utiliser',
	'onboard.cost.download': 'Téléchargement unique · {size}',
	'onboard.cost.signIn': 'Connexion · rien à installer',
	'onboard.cost.endpoint': 'Votre propre serveur · rien à installer',
	'onboard.downloading': 'Téléchargement en cours. Ajoutez un document en attendant.',
	'onboard.unfinished': 'Terminez la configuration pour obtenir des réponses.',
	'onboard.resume': 'Terminer',
	'onboard.needDownload': 'Téléchargez le modèle pour répondre sur cet appareil.',
	'onboard.needEndpoint': 'Configurez votre serveur pour obtenir des réponses.',
	'modes.state.ready': 'Prêt',
	'modes.state.setup': 'Configurer',
	'modes.state.signIn': 'Se connecter',
	'modes.activated': '{mode} est prêt et maintenant sélectionné.',
	'modes.aiSettings': 'Réglages IA…',
	// Sélecteur de modèle Cloud — l'unité est la réponse (voir en.ts).
	'cloudModel.label': 'Qualité des réponses',
	'cloudModel.balanced': 'Standard',
	'cloudModel.balanced.line': 'Le choix du quotidien, et quatre fois plus de questions.',
	'cloudModel.best': 'Approfondi',
	'cloudModel.best.line': 'Un modèle plus grand, pour moins de questions par jour.',
	'cloudModel.left': '≈ {count} restantes aujourd’hui',
	'cloudModel.perDay': '≈ {count} questions par jour',
	'cloudModel.spent': 'Plus rien aujourd’hui',

	// Page de connexion
	'auth.title': 'Connexion',
	'auth.checkInbox': 'Regardez votre boîte mail.',
	'auth.back': 'Retour à la discussion',
	'auth.backGeneric': 'Retour',
	'auth.headline': 'Connexion',
	'auth.body': 'Seul le mode Cloud demande un compte. Les deux autres, jamais.',
	'auth.email': 'Email',
	'auth.emailPlaceholder': 'vous@exemple.com',
	'auth.continue': 'Continuer',
	'auth.sending': 'Envoi…',
	'auth.or': 'ou',
	'auth.continueWith': 'Continuer avec {provider}',
	'auth.providerSoon': 'Pas encore disponible.',
	'auth.socialFailed': 'La connexion n’a pas abouti. Réessayez, ou utilisez un code.',
	'auth.codeSent': 'Saisissez le code à six chiffres envoyé à {email}.',
	'auth.changeEmail': 'Utiliser une autre adresse',
	'auth.footnote': 'Vos documents et vos discussions restent sur cet appareil dans tous les cas.',
	'modes.whatLeaves': "Ce qui quitte l'appareil dans chaque mode →",

	// My AI configuration
	'myai.baseUrl': 'URL de base compatible OpenAI',
	'myai.apiKey': 'Clé API (optionnelle)',
	'myai.keyPlaceholder': 'aucune pour les serveurs locaux',
	'myai.testing': 'Test…',
	'myai.test': 'Tester la connexion',
	'myai.noModels': "Connecté, mais l'endpoint ne liste aucun modèle.",
	'myai.pickModel': 'Choisissez un modèle',
	'myai.direct':
		'Les requêtes vont directement de ce navigateur à votre endpoint. Aucun serveur intermédiaire.',
	'myai.corsHint.ollama':
		"Lancez Ollama avec OLLAMA_ORIGINS réglé sur ce site (ou *) pour autoriser l'accès depuis le navigateur.",
	'myai.corsHint.lmstudio':
		'Dans LM Studio, activez CORS dans les réglages du serveur local avant de vous connecter.',
	'myai.corsHint.vllm': 'Lancez vLLM avec --allowed-origins incluant ce site (ou *).',
	'myai.error.key': "L'endpoint a refusé la clé API.",
	'myai.error.status': "L'endpoint a répondu avec une erreur ({status}).",
	'myai.error.unreachable':
		"Endpoint injoignable. Vérifiez l'URL, que le serveur tourne, et ses réglages CORS.",

	// Sources panel (in chat)
	'sources.title': 'Sources',
	'sources.subtitle': 'Jointes à cette discussion',
	// Documents (library page + shared rows)
	'docs.title': 'Documents',
	'docs.reviewSend': 'Toujours vérifier ce qui part de cette discussion',
	'docs.privateOnly': 'Privé uniquement : aucun mode cloud dans cette discussion',
	'docs.useAria': 'Utiliser {name} pour les questions',
	'docs.openAria': 'Ouvrir {name} dans la visionneuse',
	'docs.removeAria': 'Retirer {name} de cette discussion',
	'docs.empty': 'Aucun document dans cette discussion pour le moment.',
	'docs.emptyHint': 'Ajoutez-en un pour poser des questions dessus.',
	'docs.add': 'Ajouter des documents',
	'docs.optionsAria': 'Options de {name}',
	'docs.remove': 'Retirer de la discussion',
	'docs.searchLibrary': 'Chercher dans vos documents…',
	'docs.addCount': 'Ajouter {count} document{s}',
	'docs.alreadyAdded': 'Ajouté',

	// Document ingest statuses. Le travail sur les pages numérisées reprend Lecture.
	'status.received': 'Reçu',
	'status.ready': 'Prêt',
	'status.reading': 'Lecture',
	'status.splitting': 'Découpage',
	'status.indexing': 'Préparation',
	'status.failed': 'Échec',

	// Pre-send review panel
	'presend.title': 'Avant que ça parte',
	'presend.subtitle': 'Vérifiez ce qui quitte votre appareil',
	'presend.question': 'Votre question',
	'presend.context': 'Contexte de la discussion',
	'presend.passages': 'Passages trouvés dans vos documents',
	'presend.weak':
		'Ces passages ont peu de rapport avec la question. La réponse peut être peu fiable.',
	'presend.includeAria': 'Inclure ce passage',
	'presend.match': 'pertinence {pct}%',
	'presend.firstTime': 'Première fois que quelque chose quitte cet appareil',
	'presend.firstTimeBody':
		"Jusqu'ici, tout s'est passé sur votre appareil. Cet envoi transmet votre question et les passages cochés au service Cloud, jamais vos fichiers. Vous recevez votre réponse, et rien n'est stocké ni journalisé.",
	'presend.consent': "J'ai compris, continuer",
	'presend.count': '{selected}/{total} passages · {kb} Ko',
	'presend.footer':
		'Seuls les passages cochés et votre question sont envoyés. Vos fichiers restent ici.',
	'presend.footerWithContext':
		'Votre question, ce contexte et les passages cochés sont envoyés. Vos fichiers restent ici.',

	// Answer turn
	'turn.whatAiSaw': "Ce que l'IA a reçu",
	'turn.openSourceAria': 'Ouvrir la source {n}',
	'turn.copied': 'Copié',
	'turn.copy': 'Copier',
	'turn.regenerate': 'Réessayer',
	'turn.closest': "Sources les plus proches, aucune n'a permis de répondre",

	// Retrieval preview turn — langage clair ; la raison s'adapte à pourquoi aucune
	// réponse n'a été rédigée, et pointe vers les documents (chips-sources) affichés.
	'retrieval.found': 'Trouvés dans vos documents',
	'retrieval.reason.download': "Téléchargez l'IA sur votre appareil pour une réponse rédigée.",
	'retrieval.reason.setup': 'Configurez ce mode pour une réponse rédigée.',
	'retrieval.reason.loading': "L'IA sur votre appareil se prépare, réessayez dans un instant.",
	'retrieval.reason.ready': 'Reposez votre question pour une réponse rédigée.',
	'retrieval.reason.generic': 'Activez un mode IA pour une réponse rédigée.',
	'retrieval.noDocs':
		'Aucun document dans cette discussion. Ajoutez-en un pour poser des questions dessus.',
	'retrieval.noHits': 'Rien dans vos documents ne correspond à cette question.',
	'retrieval.weak':
		'Ces sources ont peu de rapport avec la question. Une réponse peut être peu fiable.',
	'retrieval.openAria': 'Ouvrir {name}',

	// What AI saw panel
	'wais.title': "Ce que l'IA a reçu",
	'wais.subtitle': 'Pour cette réponse · enregistré localement',
	'wais.destination': 'Destination',
	'wais.device': "cet appareil, rien n'a été envoyé",
	'wais.zeroBytes': '0 octet envoyé',
	'wais.kbSent': '{kb} Ko envoyés',
	'wais.excluded': 'Exclu par vous',
	'wais.sent': 'Envoyé',
	'wais.stayed': 'Resté',
	'wais.noPassages': 'Aucun passage de document. Seule votre question était concernée.',
	'wais.notRecorded':
		"Le détail des passages n'a pas été enregistré pour cette réponse plus ancienne.",
	'wais.nothing': "Rien d'enregistré pour cette réponse.",
	'wais.footer': "Rien d'autre n'a été partagé pour cette réponse.",

	// Viewer panel
	'viewer.document': 'Document',
	'viewer.removed': 'Plus disponible',
	'viewer.removedBody':
		'Ce document a été supprimé de votre bibliothèque. La citation a conservé un instantané du passage :',
	'viewer.missing': 'Fichier original indisponible',
	'viewer.missingBody':
		"Le fichier original n'a pas pu être lu depuis le stockage de cet appareil. Voici le passage enregistré :",
	'viewer.missingPdfBody':
		"Le PDF original n'a pas pu être lu depuis le stockage de cet appareil. Voici le passage enregistré :",
	'viewer.prevAria': 'Page précédente',
	'viewer.nextAria': 'Page suivante',
	'viewer.pageOf': 'page {n} / {total}',
	'viewer.citedPage': 'cité : p.{n}',

	// Home (new chat)
	'home.headline': 'Discutez avec vos documents.',
	'home.dropTitle': 'Déposez un document, ou cliquez pour parcourir',
	'home.pickLead': 'Interroger',
	'home.pickAll': 'Les {count} documents',
	'home.addNew': 'Ajouter un fichier',
	'home.sampleLead': 'Première fois ?',
	'home.sampleLink': 'Essayez avec un contrat d’exemple',
	'home.sub': 'Ajoutez des documents, posez des questions et voyez exactement ce qui est partagé.',
	'home.demoPreparing': 'Préparation de la démo…',
	'home.demoCta': 'Essayer avec un contrat fictif',
	'home.demoTitle': 'Démo · contrat fictif',
	'home.drop': 'Déposez pour démarrer une discussion',

	// Chat page
	'chat.fallback': 'Conversation',
	'chat.docCount': '{count} document{s}',
	'chat.cloudRequests': '{count} requête{s} cloud · {kb} Ko',
	'chat.zeroBytes': '0 octet envoyé',
	'chat.threadAria': 'Fil de la discussion',
	'chat.emptyTitle': 'Ajoutez un document à cette discussion',
	'chat.emptyBody':
		'Les réponses viennent des documents de cette discussion. Ajoutez-en un pour commencer, ou déposez un fichier ici.',
	'chat.drop': 'Déposez pour ajouter à cette discussion',
	'chat.fromSections': 'Depuis les sections de votre document',
	'chat.editAria': 'Modifier cette question',
	'chat.reviewing': 'En attente de votre vérification dans le panneau latéral',
	'chat.writing': 'Préparation de votre réponse…',
	'chat.reading': 'Recherche dans vos documents…',
	'chat.stop': 'Arrêter',
	'chat.meta': '{count} passage{s} · {kb} Ko · {dest}',
	'chat.editedAria': 'Question modifiée',
	'chat.resend': 'Renvoyer',

	// Documents page
	'docsPage.count': '{count} dans votre espace de travail',
	'docsPage.intro':
		"Chaque document est lu dans votre navigateur, rien n'en sort. Votre bibliothèque reste consultable même hors ligne.",
	'docsPage.introAction': 'Ajoutez un document à une discussion pour poser vos questions.',
	'docsPage.add': 'Ajouter des documents',
	'docsPage.drop': 'Déposez pour ajouter à votre bibliothèque',
	'docsPage.sortRecent': 'Plus récents',
	'docsPage.sortName': 'Nom',
	'docsPage.sortSize': 'Taille',
	'docsPage.filterAll': 'tous',
	'docsPage.search': 'Filtrer par nom…',
	'docsPage.emptyTitle': 'Votre bibliothèque est vide',
	'docsPage.types': 'PDF · Word · Markdown · Texte',
	'docsPage.added': 'ajouté le {date}',
	'docsPage.details': 'Détails',
	'docsPage.noMatch': 'Rien ne correspond à ce filtre.',
	'docsPage.error': 'échec',
	'docsPage.indexing': 'indexation en cours…',
	'docsPage.inChats': 'Dans {count} discussion{s}',
	'docsPage.openAria': 'Ouvrir les détails de {name}',
	'docsPage.deleteFromDevice': 'Supprimer de cet appareil',
	'docsPage.deleteTitle': 'Supprimer « {name} » de cet appareil ?',
	'docsPage.usedIn': 'Ce document est utilisé dans {count} discussion{s}.',
	'docsPage.deleteBody':
		'Le fichier et ses données de recherche seront définitivement supprimés. Cette action est irréversible.',
	'docsPage.deleteConfirm': 'Supprimer définitivement',

	// Document sheet
	'sheet.size': 'Taille',
	'sheet.pages': 'Pages',
	'sheet.indexed': 'Indexé',
	'sheet.model': 'Indexé avec',
	'sheet.fingerprint': 'Empreinte',
	'sheet.replacedLabel': 'Remplacé',
	'sheet.times': '{count} fois',
	'sheet.privacy': 'Confidentialité',
	'sheet.loading': 'Chargement…',
	'sheet.detailUnavailable': 'Les détails de ce document n’ont pas pu être lus pour l’instant.',
	'sheet.neverSent': 'Aucun passage n’a quitté votre appareil',
	'sheet.usedIn': 'Utilisé dans',
	'sheet.noChats': 'Aucune discussion pour le moment.',
	'sheet.open': 'Ouvrir',
	'sheet.reindex': 'Réindexer',
	'sheet.improveSearch': 'Améliorer la recherche',
	'sheet.reindexRecommended':
		'Un meilleur modèle de recherche local est disponible. L’index actuel reste utilisable jusqu’à sa reconstruction.',
	'sheet.replaceFile': 'Remplacer le fichier…',
	'sheet.replaceFailed': 'Impossible de remplacer par {name}',
	'sheet.replaceFailedNoText':
		'Aucun texte exploitable dans le nouveau fichier. La version actuelle reste active.',
	'sheet.replaceFailedKeep': 'La version actuelle reste active.',
	'sheet.replaced': 'Document remplacé',
	'sheet.replacedDesc': 'Les anciennes citations conservent leurs instantanés.',
	'sheet.egressLine': '{date} : passages envoyés à {dest}',
	'sheet.language': 'Langue',
	'sheet.sentCount': 'Envoyé {count} fois',
	'sheet.seeAll': 'Voir tout ({count})',
	'sheet.seeLess': 'Voir moins',
	'sheet.copyAria': "Copier l'empreinte",
	'sheet.copied': 'Empreinte copiée',
	'sheet.details': 'Détails',
	'sheet.usedInCount': 'Utilisé dans {count} discussion{s}',
	'sheet.stillIndexing': 'Indexation en cours',
	'sheet.openChatAria': 'Ouvrir la discussion {title}',
	'sheet.indexFailed': "Ce document n'a pas pu être indexé.",

	// Pagination
	'pagination.prev': 'Page précédente',
	'pagination.next': 'Page suivante',
	'pagination.first': 'Première page',
	'pagination.last': 'Dernière page',
	'pagination.goToPage': 'Aller à la page {n}',
	'pagination.range': '{from}–{to} sur {total}',
	'pagination.perPage': 'Par page',

	// Settings
	'settings.title': 'Réglages',
	'settings.subtitle': 'Stockage · confidentialité · hors ligne',
	'update.ready': 'Une nouvelle version est prête.',
	'update.cta': 'Recharger',
	'settings.storage.title': 'Stockage',
	'settings.storage.used': '{used} utilisés',
	'settings.storage.available': '{quota} disponibles',
	'settings.storage.persistent': "Persistant : le navigateur n'évincera pas vos documents",
	'settings.storage.notPersistent':
		'Non persistant : le navigateur peut évincer ces données en cas de manque de place',
	'settings.storage.ask': 'Demander au navigateur de persister',
	'settings.storage.unavailable': 'Détails du stockage indisponibles.',
	'settings.week.title': 'Partagé cette semaine',
	'settings.week.nothing': "Rien n'a quitté cet appareil ces 7 derniers jours.",
	'settings.week.fullHistory': 'Historique complet dans le',
	'settings.week.privacyReport': 'Rapport de confidentialité',
	'settings.week.howEachMode': 'fonctionnement de chaque mode :',
	'settings.week.dataFlows': 'flux de données',
	'settings.language.title': 'Langue',
	'addDocs.menuAria': 'Ajouter des documents et des actions',
	'composer.enterHint': '⏎ envoyer · ⇧⏎ à la ligne',
	'composer.sendAria': 'Envoyer',
	'turn.privateMeta': 'Privé · {count} passage{s}',
	'work.search.active': 'Recherche dans {count} documents',
	'work.search.done': 'Recherche faite dans {count} documents',
	'work.inspect.active': 'Vérification des passages pertinents',
	'work.inspect.done': '{count} passages vérifiés',
	'work.calculate.active': 'Calcul exact des valeurs',
	'work.calculate.done': '{count} valeurs calculées',
	'work.write.active': 'Rédaction de la réponse',
	'work.write.waiting': 'En attente de votre validation de ce qui part',
	'work.write.done': 'Réponse rédigée',
	'work.method': 'Comment ce résultat a été construit',
	'work.method.targeted': '{count} passages pertinents retrouvés et vérifiés.',
	'work.method.synthesis': '{count} passages pertinents comparés avant la réponse.',
	'work.method.aggregate':
		'Documents sélectionnés lus intégralement, puis calcul effectué sur {count} valeurs retenues.',
	'work.method.clarification':
		'Une précision a été demandée avant la recherche dans les documents.',
	'work.method.notes': 'Notes de travail',
	'work.method.notesAll': 'Tout afficher',
	'work.method.notesLess': 'Réduire',
	'turn.sourcesMore': '+{count}',
	'turn.sourcesLess': 'Réduire les sources',
	'turn.copyAria': 'Copier la réponse',
	'turn.prevVersion': 'Version précédente',
	'turn.nextVersion': 'Version suivante',
	'turn.quote': 'Citer',
	'related.title': 'Questions liées',
	'clarification.scope':
		'Faut-il calculer ce montant pour un seul relevé ou pour tous les documents sélectionnés ?',
	'clarification.financialRole':
		'Quel montant faut-il utiliser : envoyé, reçu, frais, taxes ou total débité ?',
	'clarification.intent':
		'Quel résultat souhaitez-vous obtenir à partir des documents sélectionnés ?',
	'clarification.time': 'Quelle date ou période exacte faut-il utiliser ?',
	'clarification.entity': 'De quelle personne ou de quel sujet précédent parlez-vous ?',
	'clarification.document': 'Quel document ou quelle version faut-il utiliser ?',
	'clarification.unitCurrency': 'Quelle devise ou unité cible faut-il utiliser ?',
	'clarification.multiPart': 'À quelle partie faut-il répondre en premier ?',
	// Page d'aide — le symptôme d'abord, c'est ce qu'on reconnaît.
	'help.title': 'Si le navigateur bloque',
	'help.kind.storage': 'Stockage',
	'help.kind.browser': 'Navigateur',
	'help.kind.network': 'Réseau',
	'help.allGuides': 'Tous les guides',
	'help.more': 'Autres guides',
	'help.intro':
		'Tout se passe dans votre navigateur, donc ses réglages font partie du fonctionnement. Voici les cas qui l’empêchent de tourner, et ce qui les débloque.',
	'help.cause': 'Pourquoi',
	'help.fix': 'Que faire',
	'help.footnote':
		'Aucun de ces réglages n’envoie vos documents où que ce soit. Ce sont des paramètres de votre machine, et ils sont tous réversibles.',

	'help.blocked.title': 'Rien ne peut être enregistré',
	'help.blocked.symptom':
		'Les documents refusent d’être ajoutés, ou l’app signale que le stockage est bloqué pour ce site.',
	'help.blocked.cause':
		'Vos documents vivent dans le navigateur, dans un espace appelé OPFS. Une fenêtre privée et un blocage de contenu strict le refusent tous les deux, et il n’y a pas de repli : sans espace de stockage, un document n’a nulle part où aller.',
	'help.blocked.fix1': 'Ouvrez l’app dans une fenêtre normale plutôt qu’une fenêtre privée.',
	'help.blocked.fix2':
		'Dans Firefox, cliquez sur le bouclier dans la barre d’adresse et désactivez les protections pour ce site. Dans Safari, autorisez le stockage pour ce site dans les réglages de confidentialité.',
	'help.blocked.fix3': 'Rechargez la page.',

	'help.tabs.title': 'Déjà ouvert dans un autre onglet',
	'help.tabs.symptom': 'L’app annonce qu’elle est déjà ouverte ailleurs et s’arrête de charger.',
	'help.tabs.cause':
		'Un seul onglet possède la base à la fois. Deux onglets qui écrivent dans le même espace, c’est ainsi qu’il se corrompt, donc le second refuse plutôt que de risquer vos données.',
	'help.tabs.fix1': 'Fermez l’autre onglet, puis rechargez celui-ci.',

	'help.eviction.title': 'Des documents ont disparu',
	'help.eviction.symptom':
		'Des documents ajoutés plus tôt ne sont plus là après un moment, ou après un redémarrage.',
	'help.eviction.cause':
		'Un navigateur reprend l’espace des sites qu’il juge inactifs, sauf si le site a demandé à être conservé. L’app le demande à chaque démarrage, et le navigateur l’accorde en silence une fois que vous l’avez utilisée quelques fois.',
	'help.eviction.fix1':
		'Réglages, puis Données, indique si le stockage est conservé. Sinon, le bouton présent redemande.',
	'help.eviction.fix2':
		'Exportez votre espace de travail depuis le même onglet pour garder une copie hors du navigateur.',

	'help.gpu.title': 'Le modèle local ne s’installe pas',
	'help.gpu.symptom':
		'Choisir Cet appareil affiche indisponible, ou le téléchargement se termine et le modèle refuse de démarrer.',
	'help.gpu.cause':
		'Faire tourner un modèle dans un onglet demande WebGPU, et les navigateurs diffèrent. Firefox autorise moins de buffers par shader que le modèle n’en demande. Safari ne prend pas en charge l’isolation dont le repli processeur a besoin.',
	'help.gpu.fix1':
		'Utilisez un navigateur Chromium pour Cet appareil : Chrome, Edge, Brave, Arc et Opera fonctionnent.',
	'help.gpu.fix2':
		'Ou gardez ce navigateur et choisissez Cloud ou Votre serveur, qui ne demandent aucun modèle local.',

	'help.network.title': 'Un téléchargement ou une réponse n’arrive jamais',
	'help.network.symptom':
		'Le téléchargement du modèle se fige, ou une réponse Cloud annonce le service injoignable.',
	'help.network.cause':
		'Un VPN, un proxy d’entreprise ou une extension peuvent bloquer les requêtes. Les poids du modèle viennent d’un CDN public, et les réponses Cloud vont vers l’endpoint de cette app ; les deux peuvent être filtrés.',
	'help.network.fix1': 'Désactivez le VPN ou l’extension de blocage pour ce site, puis réessayez.',
	'help.network.fix2':
		'Sur un réseau d’entreprise, demandez que ce site et le CDN du modèle soient autorisés, ou utilisez Cet appareil, qui n’a besoin du réseau qu’une fois.',

	'report.title': 'Signaler un problème',
	'report.intro': 'Écrivez-nous et nous répondrons, trois choses rendent la correction rapide.',
	'report.step1': 'Ce que vous faisiez, et ce qui s’est passé à la place.',
	'report.step2': 'Votre navigateur, et si vous l’aviez installé comme application.',
	'report.step3': 'Le mode de réponse utilisé, si le problème portait sur une réponse.',
	'report.copy': 'Copier',
	'report.copied': 'Copié',
	'report.write': 'Nous écrire',
	'report.github': 'Ou l’ouvrir sur GitHub',
	'report.subject': 'Signalement de problème',
	'app.whatToDo': 'Que faire',
	'app.dbBusy':
		'Vous avez déjà ceci ouvert dans un autre onglet. Fermez-le, puis rechargez cette page.',
	'app.dbBlocked':
		'Ce navigateur bloque le stockage pour ce site, donc rien ne peut être enregistré ici. Quittez la navigation privée, ou autorisez le stockage pour ce site, puis rechargez.',
	'app.workerFailed.title': "Cette page n'a pas fini de se charger",
	'app.workerFailed.body': 'Rechargez pour continuer.',
	'app.workerFailed.cta': 'Recharger',
	'app.workerFailed.dismiss': 'Masquer',
	'app.workerFailed.search': 'La recherche dans vos documents ne fonctionne plus.',
	'app.workerFailed.ocr': 'La reconnaissance de texte ne fonctionne plus.',
	'app.workerFailed.privateAi': "L'IA privée ne fonctionne plus.",
	'panel.backAria': 'Revenir aux documents',
	'panel.hideAria': 'Fermer le panneau',
	'chat.panelToggleAria': 'Ouvrir le panneau latéral',
	'chat.panelTip.show': 'Ouvrir le panneau · ⌘.',
	'chat.stopTip': 'Arrêter · échap',
	'composer.sendTip': 'Envoyer · ⏎',
	'sidebar.collapseTip': 'Réduire · ⌘B',
	'sidebar.expandTip': 'Ouvrir · ⌘B',
	'sidebar.chatOptionsAria': 'Options de la discussion',
	'menu.language': 'Langue',
	'menu.signIn': 'Se connecter',
	'settings.tabs.general': 'Général',
	'settings.tabs.data': 'Données',
	'settings.tabs.ai': 'IA',
	'settings.tabs.usage': 'Utilisation',
	'settings.usage.kicker': 'Mode Cloud',
	'settings.usage.left': 'réponses restantes aujourd’hui en {model}',
	'settings.usage.resets': 'Remise à zéro à {time}',
	'settings.usage.current': 'Sélectionné',
	'settings.review.title': 'Vérifier avant d’envoyer',
	'settings.review.desc':
		'Contrôlez les passages à chaque fois avant qu’ils partent. Désactivez et les réponses distantes partent directement.',
	'settings.tabs.account': 'Compte',
	'settings.defaultMode.title': 'Mode par défaut des nouvelles discussions',
	'settings.deleteChats.title': 'Supprimer toutes les discussions',
	'settings.deleteChats.desc':
		'Supprime de cet appareil toutes les discussions, leurs citations et leur historique de confidentialité. Les documents restent dans votre bibliothèque.',
	'settings.deleteChats.cta': 'Supprimer les discussions',
	'settings.deleteChats.confirmTitle': 'Supprimer toutes les discussions ?',
	'settings.myai.title': 'Serveur My AI',
	'settings.myai.connection': 'Connexion',
	'settings.myai.model': 'Modèle par défaut',
	'settings.models.benchTitle': 'Test de vitesse',
	'settings.ai.use': 'Utiliser ce mode',
	'settings.ai.model.title': 'IA locale',
	'settings.ai.download': 'Télécharger',
	'settings.ai.load': 'Charger',
	'settings.ai.status.ready': 'prêt',
	'settings.ai.status.setup': 'à configurer',
	'settings.ai.status.blocked': 'indisponible',
	'settings.ai.status.progress': 'préparation · {pct}%',
	'settings.ai.assisted.none': 'Aucun compte connecté.',
	'settings.account.logoutAll': 'Se déconnecter de tous les appareils',
	'settings.account.deleteTitle': 'Supprimer le compte',
	'settings.account.deleteDesc':
		"Supprime vos données de connexion et de quota du serveur. Vos documents et discussions n'y ont jamais été ; ils restent sur cet appareil.",
	'settings.account.deleteCta': 'Supprimer mon compte',
	'settings.account.deleteConfirm': 'Supprimer ce compte ?',
	'settings.account.guest': 'Aucun compte. Connectez-vous pour débloquer le mode Cloud.',
	'palette.themeLight': 'Thème : clair',
	'palette.themeDark': 'Thème : sombre',
	'palette.themeSystem': 'Thème : système',
	'palette.langEn': 'Langue : English',
	'palette.langFr': 'Langue : Français',
	'palette.navigate': 'naviguer',
	'palette.open': 'ouvrir',
	'palette.close': 'fermer',
	'settings.appearance.title': 'Apparence',
	'settings.appearance.system': 'Système',
	'settings.appearance.light': 'Clair',
	'settings.appearance.dark': 'Sombre',
	'settings.offline.title': 'Forcer le hors ligne',
	'settings.offline.label':
		'Bloque toute requête sortante. Les réponses sur cet appareil et vos documents continuent de fonctionner ; les modes distants et la connexion sont refusés avec un message clair.',
	'settings.offline.badge': 'Hors ligne · rien ne quitte cet appareil',
	'settings.workspace.title': 'Espace de travail',
	'settings.workspace.exportDesc':
		'Exportez vos documents, discussions, citations et historique de confidentialité dans un simple zip.',
	'settings.workspace.packing': 'Préparation…',
	'settings.workspace.export': 'Exporter mon espace de travail',
	'settings.workspace.quota': "Environ {answers} réponses restantes aujourd'hui",
	'settings.workspace.quotaSignIn': 'Votre réserve du jour apparaît ici une fois connecté.',
	'models.onDevice': 'Modèle sur cet appareil',
	'models.index': 'Modèle d’indexation',
	'settings.models.title': 'IA téléchargée',
	'settings.models.measuring': 'Mesure…',
	'settings.models.none': 'Rien de téléchargé pour le moment.',
	'settings.models.files': '{count} fichiers',
	'settings.models.delete': 'Supprimer',
	'settings.models.benchDesc':
		"Un court test privé mesure la vitesse de l'IA locale sur cet appareil.",
	'settings.models.testing': 'Test…',
	'settings.models.test': 'Tester mon appareil',
	'settings.models.prepareFirst':
		"Préparez d'abord le modèle local (sélecteur de mode → Cet appareil).",
	'settings.models.tps': '{tps} mots par seconde',
	'settings.models.comfortable': 'cet appareil répond confortablement tout seul.',
	'settings.models.slow': 'cet appareil est lent tout seul ; le Cloud sera nettement plus rapide.',
	'settings.wipe.title': 'Tout supprimer',
	'settings.wipe.desc':
		"Efface tous les documents, discussions, index et IA téléchargées de cet appareil. Rien n'existe ailleurs, cette action est donc irréversible.",
	'settings.wipe.cta': 'Tout supprimer',
	'settings.wipe.last': 'Dernière confirmation',
	'settings.wipe.confirmTitle': 'Tout supprimer ?',
	'settings.wipe.armedBody':
		"Ceci détruit définitivement chaque document, discussion, index et IA téléchargée stockée dans ce navigateur. Rien n'existe ailleurs. Vraiment supprimer ?",
	'settings.wipe.body':
		'Les documents, discussions, index de recherche et IA téléchargées seront effacés de ce navigateur. Votre compte survit ; il ne contient aucun contenu.',
	'settings.wipe.erasing': 'Effacement…',
	'settings.wipe.confirm': 'Oui, tout effacer',
	'settings.wipe.continue': 'Continuer',

	// Privacy Report
	'privacy.title': 'Rapport de confidentialité',
	'privacy.subtitle': 'Tout ce qui a quitté cet appareil, ou pas',
	'privacy.export': 'Exporter en JSON',
	'privacy.nothing': "Rien n'a quitté cet appareil.",
	'privacy.deviceSummary':
		'{count} réponse{s} générée{s} entièrement sur cet appareil. 0 octet envoyé.',
	'privacy.emptyBody':
		'Chaque document, index et discussion est stocké localement. Ce rapport ne se remplit que si vous choisissez un mode cloud.',
	'privacy.onDevice': 'Sur cet appareil',
	'privacy.privateAnswers': '{count} réponse{s} privée{s}',
	'privacy.leftDevice': 'Parti de cet appareil',
	'privacy.inRequests': 'en {count} requête{s}',
	'privacy.since': 'depuis le {date}',
	'privacy.stayedHere': 'Resté ici',
	'privacy.answersHere': 'réponses écrites sur cet appareil',
	'privacy.whereItWent': 'Où c’est parti',
	'privacy.col.destination': 'Destination',
	'privacy.col.requests': 'Requêtes',
	'privacy.col.sent': 'Envoyé',
	'privacy.thisDevice': 'cet appareil',
	'privacy.thisWeek': 'dont {bytes} sur les sept derniers jours.',
	'privacy.journal': 'Chaque événement',
	'privacy.event': '{count} passage{s} · {bytes} → {dest}',
	'privacy.errorTitle': "Ce rapport n'a pas pu être chargé",
	'privacy.errorBody': 'Fermez tout autre onglet où cette application est ouverte, puis réessayez.',

	// Landing
	'landing.nav.how': 'Comment ça marche',
	'landing.nav.guides': 'Guides',
	'landing.nav.github': 'GitHub',
	'landing.cta': 'Ouvrir le chat',
	'landing.cta.code': 'Voir le code',
	'landing.hero.title': 'Vos documents ont la réponse.',
	'landing.hero.sub':
		'Posez une question, recevez une réponse rédigée qui cite les passages exacts dont elle vient. Tout se passe dans votre navigateur, et avec le modèle sur l’appareil vos fichiers ne quittent jamais votre machine.',
	'landing.hero.facts': 'Gratuit et open source. Sans compte pour commencer.',
	'landing.modes.title': 'Choisissez où la réponse s’écrit.',
	'landing.modes.sub':
		'La lecture de vos documents et leur recherche se font dans ce navigateur. Les trois modes ne diffèrent que sur un point : qui rédige la réponse.',
	'landing.modes.private': 'Un petit modèle tourne dans l’onglet de votre navigateur.',
	'landing.modes.private.cost': 'Un téléchargement pour démarrer, et une réponse plus lente.',
	'landing.modes.assisted': 'Connectez-vous, la réponse s’écrit en ligne.',
	'landing.modes.assisted.cost': 'Un compte, et une réserve quotidienne.',
	'landing.modes.myai': 'Branchez votre propre serveur d’IA.',
	'landing.modes.myai.cost': 'Un serveur que vous gardez allumé.',
	'landing.cite.title': 'Chaque affirmation montre sa source.',
	'landing.cite.sub':
		'Les réponses portent des citations numérotées. Cliquez, le document s’ouvre sur le passage exact, surligné.',
	'landing.oss.title': 'Open source, de bout en bout',
	'landing.oss.sub':
		'Le code est public, sous licence AGPL. Faites-le tourner sur votre propre domaine, ou aidez à l’améliorer.',
	'landing.oss.cta': 'Contribuer sur GitHub',
	'landing.cite.f1': 'Les sources s’alignent au-dessus de la réponse.',
	'landing.cite.f2': 'Supprimez un document, les passages cités restent.',
	'landing.cite.fig': 'Fig. 02 · Une réponse, ses sources, et le bail ouvert sur la clause.',
	'landing.deck.title': 'Rien ne part tant que vous n’avez pas dit oui.',
	'landing.deck.sub':
		'Les passages retenus pour votre question s’alignent d’abord, et vous décochez ce qui reste ici. Ensuite la réponse garde la même liste, chaque passage marqué envoyé ou resté.',
	'landing.deck.before': 'Avant l’envoi',
	'landing.deck.after': 'La trace gardée',
	'landing.deck.intact': 'Rien n’est parti',
	'landing.deck.found': 'Trouvés dans vos documents',
	'landing.deck.keep': 'Vous en gardez',
	'landing.deck.ready': 'Prêts à partir',
	'landing.deck.gone': 'Partis de cet appareil',
	'landing.deck.stayed': 'Restés ici',
	'landing.deck.keptWith': 'Gardé avec la réponse',
	'landing.deck.keptWithValue': 'Aussi longtemps que la discussion',
	'landing.deck.kbUnit': 'Ko',
	'landing.deck.bring': 'Passer {name} devant',
	'landing.deck.f1':
		'Le consentement est demandé une fois, la première fois que quelque chose partirait.',
	'landing.deck.f2': 'Le Rapport de confidentialité en fait le total.',

	'policy.title': 'Confidentialité',
	'policy.updated': 'Dernière mise à jour le 30 juillet 2026',
	'policy.intro':
		'Cette page dit ce que cette application fait de vos données, dans l’ordre qui compte. La version courte : vos documents n’atteignent jamais un serveur. La version longue est en dessous.',

	'policy.device.title': 'Vos documents restent sur votre appareil',
	'policy.device.body':
		'Les fichiers que vous ajoutez sont lus, indexés et cherchés dans votre navigateur. Le texte, l’index construit à partir de lui, vos questions, les réponses et les noms de fichiers sont stockés dans ce navigateur uniquement. Rien n’est envoyé, aucun serveur n’en garde de copie. Coupez le réseau : l’application continue de répondre dans le mode qui répond sur votre appareil, et c’est la façon de le vérifier plutôt que de nous croire.',

	'policy.server.title': 'Ce que le serveur sait',
	'policy.server.body':
		'Il y a un serveur, et il existe pour les comptes et les quotas. À la connexion, il enregistre votre adresse email, un nom si la méthode de connexion en a fourni un, et des sessions. Une session contient l’adresse IP et l’identification du navigateur de la requête qui l’a créée, ce qui permet de distinguer une session volée de la vôtre. Il compte aussi votre usage quotidien du mode cloud : un nombre de requêtes et une mesure de consommation. Il n’existe aucune table pour les documents, les discussions, les messages, les passages ou les noms de fichiers, et en ajouter une casserait la garantie ci-dessus.',

	'policy.cloud.title': 'Quand vous demandez une réponse cloud',
	'policy.cloud.body':
		'Deux des trois modes de réponse ne contactent jamais ce serveur. Si vous choisissez le mode cloud, votre question et les passages que vous avez validés à l’étape de relecture traversent le serveur vers le modèle qui rédige la réponse, puis reviennent. Ils ne sont écrits dans aucune base et ne sont pas conservés. Ce qui est écrit est une ligne de compteurs : combien de passages, combien d’unités de facturation, la durée, la longueur de la réponse, et les premiers caractères de votre identifiant de compte. Aucune question et aucun passage n’y figure.',

	'policy.signin.title': 'La connexion',
	'policy.signin.body':
		'Seul le mode cloud demande un compte. Un code arrive par email depuis mail.regeste.com, et le message ne contient aucun lien. Si vous vous connectez avec Google, Google apprend que vous utilisez cette application, et cette application reçoit votre adresse email, votre nom et votre photo de profil. Rien de plus n’est demandé.',

	'policy.models.title': 'Le téléchargement du modèle',
	'policy.models.body':
		'Répondre sur votre appareil demande un fichier de modèle, téléchargé une fois et conservé dans ce navigateur. Il passe par ce domaine depuis un hébergeur public de modèles, parce que l’isolation dont le navigateur a besoin pour ce mode bloque la route directe. Seuls des fichiers de modèles publics empruntent ce chemin.',

	'policy.tracking.title': 'Aucun analytics',
	'policy.tracking.body':
		'Il n’y a aucun service d’analytics, aucun script de traçage et aucun code tiers dans cette application. Les emails ne contiennent aucune image, donc rien ne signale que vous en ouvrez un. Le seul cookie est celui qui vous garde connecté.',

	'policy.delete.title': 'Supprimer vos données',
	'policy.delete.body':
		'Tout ce qui est sur votre appareil se supprime depuis les réglages de l’application, ou en vidant le stockage de ce navigateur. Supprimer votre compte retire votre adresse email, vos sessions et vos compteurs d’usage du serveur. Comme le serveur n’a jamais détenu de document, il n’y a rien d’autre à vous retirer.',

	'policy.contact.title': 'Questions',
	'policy.contact.body': 'Écrivez-nous, nous répondrons.',
	'policy.source': 'Le code derrière chaque affirmation de cette page est public.',
	'landing.footer.copyright': '© 2026 · AGPL-3.0',

	// How it works
	'hiw.title': 'Comment circulent vos données',
	'hiw.intro':
		'Vos documents sont analysés, indexés et cherchés dans ce navigateur. Les modes ne diffèrent que sur un point : qui rédige la réponse, et donc ce qui doit partir.',
	'hiw.whatStays': 'Ce qui reste',
	'hiw.server': 'Le serveur',
	'hiw.private.leaves': "Rien. L'IA privée tourne dans votre navigateur (téléchargement unique).",
	'hiw.private.stays': "Documents, index, discussions, l'IA privée, vos questions et réponses.",
	'hiw.private.server': 'Jamais contacté pour répondre. Aucun compte requis.',
	'hiw.assisted.leaves':
		"Votre question et les passages approuvés à l'étape de vérification. Jamais les documents entiers, jamais les noms de fichiers.",
	'hiw.assisted.stays': 'Documents, index, discussions. Les passages que vous excluez.',
	'hiw.assisted.server':
		"Relaie les passages à l'IA et renvoie la réponse en continu. Stocke votre e-mail, votre offre et un compteur d'utilisation. Ne stocke ni ne journalise jamais de contenu.",
	'hiw.myai.leaves':
		"Votre question plus les passages pertinents, envoyés directement au serveur d'IA que vous avez configuré.",
	'hiw.myai.stays': 'Documents, index, discussions.',
	'hiw.myai.server':
		"Aucun serveur intermédiaire. Le trafic va de votre navigateur à votre serveur d'IA.",
	'hiw.step.document': 'Votre document',
	'hiw.step.parsing': 'Analyse',
	'hiw.step.chunking': 'Découpage',
	'hiw.step.embeddings': 'Encodage',
	'hiw.step.index': 'Index local',
	'hiw.step.question': 'Votre question',
	'hiw.step.search': 'Recherche locale',
	'hiw.step.passages': 'Meilleurs passages',
	'hiw.step.answer': 'Réponse + citations',
	'hiw.boundaryIntact': 'Rien ne traverse',
	'hiw.boundaryCrossed': 'Ce qui traverse',
	'hiw.frame': 'Ce navigateur',
	'hiw.lane.ingest': 'Ajouter un document',
	'hiw.lane.ask': 'Poser une question',
	'hiw.proofTitle': 'Vérifiez par vous-même',
	'hiw.proofBody':
		"Préparez le modèle local, puis coupez le Wi-Fi et posez à nouveau votre question. L'analyse, la recherche et la réponse continuent de fonctionner.",
	'hiw.footer':
		'Le code est open source. Inspectez-le, hébergez-le vous-même, ou gardez tout sur cet appareil sans réseau.',

	// Account
	'account.signedInAs': 'Connecté en tant que',
	'account.signOut': 'Se déconnecter',

	// Toasts (layout + uploads)
	'toast.ready': '{name} est prêt',
	'toast.failed': "{name} n'a pas pu être ajouté",
	'toast.failedGeneric': "Un problème est survenu pendant l'indexation de ce fichier.",
	'toast.added': '{name} ajouté à Mes documents',
	'toast.addedDesc': 'Disponible dans chaque discussion.',

	// Errors (stores + net)
	'error.offline': 'Le mode hors ligne est activé. Rien ne quitte cet appareil.',
	'error.sendCode': "Impossible d'envoyer le code",
	'error.invalidCode': 'Code invalide',

	// System notices, shown in the thread with their own styling
	'notice.retry': 'Réessayer',
	'notice.stopped': "La génération s'est arrêtée avant la réponse.",
	'notice.myaiUnreachable':
		"Votre serveur d'IA est injoignable. Vérifiez qu'il tourne, l'URL et ses réglages CORS.",
	'notice.quota': 'Votre réserve du jour est épuisée. Elle revient demain.',
	'notice.signIn': 'Connectez-vous pour utiliser le mode Cloud.',
	'notice.assistedDown': 'Le service Cloud est indisponible pour le moment.',
	'notice.assistedUnreachable': 'Le service Cloud est injoignable. Vérifiez votre connexion.',

	// Calculs exacts sur les documents
	'aggregate.ambiguous':
		'Plusieurs types de montants correspondent. Précisez si vous cherchez les montants envoyés, reçus, les frais ou les totaux débités.',
	'aggregate.ambiguousCalculation': 'Type de montant à préciser',
	'aggregate.none':
		'Je n’ai trouvé aucun montant suffisamment fiable à calculer dans les documents sélectionnés.',
	'aggregate.noneCalculation': 'Aucun montant retenu',
	'aggregate.count': 'Le nombre d’opérations correspondantes est {count}. {citations}',
	'aggregate.countCalculation': '{count} opération(s) correspondante(s)',
	'aggregate.list': 'Les montants sont {values}.',
	'column.first': '{label} : {value}, à la première ligne du tableau ({date}).',
	'column.last': '{label} : {value}, à la dernière ligne du tableau ({date}).',
	'column.typical': '{label} : {value}, sur {support} lignes du tableau.',
	'column.calculation': '{label}, lu ligne par ligne sur {considered} lignes',
	'aggregate.sum': 'La somme est',
	'aggregate.overValues': 'sur {count} valeurs',
	'aggregate.average': 'La moyenne est',
	'aggregate.minimum': 'Le minimum est',
	'aggregate.maximum': 'Le maximum est',
	'aggregate.excluded': '{count} document(s) ambigu(s) ont été exclus.'
};

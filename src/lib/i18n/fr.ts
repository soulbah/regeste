// French dictionary (spec 016). Typed against the English dictionary so a
// missing key fails typecheck. Vouvoiement; mode names (Private, Assisted,
// My AI) are product names and stay untranslated.

import type { en } from './en';

export const fr: Record<keyof typeof en, string> = {
	// Common
	'common.cancel': 'Annuler',
	'common.close': 'Fermer',
	'disabled.chooseMode': "Choisissez d'abord un mode IA.",
	'disabled.needUrl': "Renseignez d'abord l'URL de base.",
	'disabled.emptyMessage': "Écrivez d'abord un message.",
	'disabled.indexing': "Ce document est encore en cours d'indexation.",
	'disabled.needEmail': "Saisissez d'abord un email valide.",
	'disabled.selectExcerpts': 'Sélectionnez au moins un passage.',
	'disabled.consentFirst': "Acceptez d'abord l'envoi des passages.",
	'common.save': 'Enregistrer',
	'common.send': 'Envoyer',
	'common.continue': 'Continuer',
	'common.delete': 'Supprimer',
	'common.page': 'page {n}',
	'common.pages': '{n} pages',
	'common.requests': '{count} requête{s}',
	'common.excerpts': '{count} extrait{s}',
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
	'palette.noResults': 'Rien trouvé sur cet appareil.',
	'palette.hint': 'Tapez pour chercher partout sur cet appareil.',
	'palette.chats': 'Discussions',
	'palette.documents': 'Documents',
	'palette.commands': 'Commandes',

	// Composer
	'composer.placeholder': 'Posez une question sur vos documents…',
	'composer.followUp': 'Poser une question de suivi…',
	'composer.attachFrom': 'Joindre depuis vos documents',
	'composer.footer': 'Les réponses citent vos documents',

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

	// Mode selector
	'modes.private.description': 'Tout reste sur cet appareil.',
	'modes.assisted.description': 'Seuls les extraits pertinents sont traités en ligne.',
	'modes.myai.description': "Utilisez votre propre fournisseur d'IA.",
	'modes.best': 'Idéal pour cet appareil',
	'modes.bestReason.noGpu': "pas d'accès GPU dans ce navigateur",
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
	'modes.locked': 'Verrouillé · cette discussion est privée uniquement',
	'modes.offlineOn': 'Le mode hors ligne est activé',
	'modes.choose': "Choisir l'IA",
	'modes.state.ready': 'Prêt',
	'modes.state.setup': 'Configurer',
	'modes.state.signIn': 'Se connecter',
	'modes.activated': '{mode} est prêt et maintenant sélectionné.',
	'modes.aiSettings': 'Réglages IA…',
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
		'Les requêtes vont directement de ce navigateur à votre endpoint. Les serveurs de Folio ne sont jamais impliqués.',
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
	'docs.privateOnly': 'Privé uniquement : aucun mode cloud dans cette discussion',
	'docs.useAria': 'Utiliser {name} pour les questions',
	'docs.openAria': 'Ouvrir {name} dans la visionneuse',
	'docs.removeAria': 'Retirer {name} de cette discussion',
	'docs.empty': 'Aucun document dans cette discussion pour le moment.',

	// Document ingest statuses
	'status.ready': 'Prêt',
	'status.indexing': 'Indexation',
	'status.reading': 'Lecture',
	'status.splitting': 'Découpage',
	'status.scanned': 'Aucun texte extractible. OCR pas encore pris en charge',

	// Pre-send review panel
	'presend.title': 'Avant que ça parte',
	'presend.subtitle': "Vérifiez ce que l'IA va voir",
	'presend.question': 'Votre question',
	'presend.excerpts': 'Extraits trouvés dans vos documents',
	'presend.weak':
		'Ces passages ont peu de rapport avec la question. La réponse peut être peu fiable.',
	'presend.includeAria': 'Inclure cet extrait',
	'presend.match': 'pertinence {pct}%',
	'presend.firstTime': 'Première fois que quelque chose quitte cet appareil',
	'presend.firstTimeBody':
		"Jusqu'ici, tout s'est passé localement. Cet envoi transmet votre question et les extraits cochés au service Assisted, jamais vos fichiers. Il répond et oublie ; rien n'est stocké ni journalisé.",
	'presend.consent': "J'ai compris, continuer",
	'presend.count': '{selected}/{total} extraits · {kb} Ko',
	'presend.footer':
		'Seuls les extraits cochés et votre question sont envoyés. Vos fichiers restent ici.',

	// Answer turn
	'turn.whatAiSaw': "Ce que l'IA a vu",
	'turn.openSourceAria': 'Ouvrir la source {n}',
	'turn.copied': 'Copié',
	'turn.copy': 'Copier',
	'turn.regenerate': 'Réessayer',
	'turn.closest': "Passages les plus proches, aucun n'a permis de répondre",

	// Retrieval preview turn
	'retrieval.notice':
		'Pas encore de réponse IA : voici les passages de vos documents qui correspondent.',
	'retrieval.noDocs':
		'Aucun document dans cette discussion. Joignez-en un pour le consulter ; les réponses de culture générale arrivent avec les modes IA.',
	'retrieval.noHits':
		'Aucun passage des documents joints ne correspond vraiment à cette recherche.',
	'retrieval.weak':
		'Ces passages ont peu de rapport avec la question. Une réponse peut être peu fiable.',
	'retrieval.openAria': 'Ouvrir {name} à ce passage',

	// What AI saw panel
	'wais.title': "Ce que l'IA a vu",
	'wais.subtitle': 'Pour cette réponse · enregistré localement',
	'wais.destination': 'Destination',
	'wais.device': "cet appareil, rien n'a été envoyé",
	'wais.zeroBytes': '0 octet envoyé',
	'wais.kbSent': '{kb} Ko envoyés',
	'wais.excluded': 'Exclu par vous',
	'wais.sent': 'Envoyé',
	'wais.stayed': 'Resté sur cet appareil',
	'wais.noPassages': 'Aucun passage de document. Seule votre question était concernée.',
	'wais.notRecorded':
		"Le détail des passages n'a pas été enregistré pour cette réponse plus ancienne.",
	'wais.nothing': "Rien d'enregistré pour cette réponse.",
	'wais.footer': "Rien d'autre n'a été partagé pour cette réponse.",

	// Viewer panel
	'viewer.document': 'Document',
	'viewer.removed': 'Plus sur cet appareil',
	'viewer.removedBody':
		'Ce document a été supprimé de votre bibliothèque. La citation a conservé un instantané du passage :',
	'viewer.missing': 'Fichier original indisponible',
	'viewer.missingBody':
		"Le fichier original n'a pas pu être lu depuis le stockage de cet appareil. Voici le passage indexé :",
	'viewer.missingPdfBody':
		"Le PDF original n'a pas pu être lu depuis le stockage de cet appareil. Voici le passage indexé :",
	'viewer.prevAria': 'Page précédente',
	'viewer.nextAria': 'Page suivante',
	'viewer.pageOf': 'page {n} / {total}',
	'viewer.citedPage': 'cité : p.{n}',

	// Home (new chat)
	'home.headline': 'Discutez avec vos documents privés.',
	'home.sub':
		"Ajoutez des documents, posez des questions et voyez exactement ce à quoi l'IA peut accéder.",
	'home.demoPreparing': 'Préparation de la démo…',
	'home.demoCta': 'Essayer avec un contrat fictif',
	'home.demoTitle': 'Démo · contrat fictif',

	// Chat page
	'chat.fallback': 'Conversation',
	'chat.docCount': '{count} document{s}',
	'chat.cloudRequests': '{count} requête{s} cloud · {kb} Ko',
	'chat.zeroBytes': '0 octet envoyé',
	'chat.threadAria': 'Fil de la discussion',
	'chat.drop': 'Déposez pour ajouter à cette discussion',
	'chat.fromSections': 'Depuis les sections de votre document',
	'chat.editAria': 'Modifier cette question',
	'chat.reviewing': 'En attente de votre vérification dans le panneau latéral',
	'chat.writing': 'Rédaction…',
	'chat.reading': 'Lecture de vos documents…',
	'chat.stop': 'Arrêter',
	'chat.meta': '{count} extrait{s} · {kb} Ko · {dest}',
	'chat.editedAria': 'Question modifiée',
	'chat.resend': 'Renvoyer',

	// Documents page
	'docsPage.count': '{count} dans votre espace de travail',
	'docsPage.intro':
		"Chaque document est lu et indexé dans votre navigateur, rien n'en sort. Votre bibliothèque reste consultable même hors ligne.",
	'docsPage.introAction': 'Ajoutez un document à une discussion pour poser vos questions.',
	'docsPage.add': 'Ajouter des documents',
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
	'docsPage.noText': 'aucun texte extractible',
	'docsPage.error': 'erreur',
	'docsPage.sentOn': 'Extraits envoyés le {date}',
	'docsPage.neverSent': 'Jamais envoyé',
	'docsPage.inChats': 'Dans {count} discussion{s}',
	'docsPage.openAria': 'Ouvrir les détails de {name}',
	'docsPage.deleteFromDevice': 'Supprimer de cet appareil',
	'docsPage.deleteTitle': 'Supprimer « {name} » de cet appareil ?',
	'docsPage.usedIn': 'Ce document est utilisé dans {count} discussion{s}.',
	'docsPage.deleteBody':
		'Le fichier, son index et ses embeddings seront définitivement supprimés. Cette action est irréversible.',
	'docsPage.deleteConfirm': 'Supprimer définitivement',

	// Document sheet
	'sheet.stored': 'Stocké sur cet appareil',
	'sheet.size': 'Taille',
	'sheet.pages': 'Pages',
	'sheet.indexed': 'Indexé',
	'sheet.model': "Modèle d'embedding",
	'sheet.fingerprint': 'Empreinte',
	'sheet.replacedLabel': 'Remplacé',
	'sheet.times': '{count} fois',
	'sheet.privacy': 'Confidentialité',
	'sheet.loading': 'Chargement…',
	'sheet.neverSent': 'Jamais envoyé nulle part',
	'sheet.usedIn': 'Utilisé dans',
	'sheet.noChats': 'Aucune discussion pour le moment.',
	'sheet.open': 'Ouvrir',
	'sheet.reindex': 'Réindexer',
	'sheet.replaceFile': 'Remplacer le fichier…',
	'sheet.replaceFailed': 'Impossible de remplacer par {name}',
	'sheet.replaceFailedNoText':
		'Aucun texte exploitable dans le nouveau fichier. La version actuelle reste active.',
	'sheet.replaceFailedKeep': 'La version actuelle reste active.',
	'sheet.replaced': 'Document remplacé',
	'sheet.replacedDesc': 'Les anciennes citations conservent leurs instantanés.',
	'sheet.egressLine': '{date} : extraits envoyés à {dest}',

	// Settings
	'settings.title': 'Réglages',
	'settings.subtitle': 'Stockage · confidentialité · hors ligne',
	'settings.storage.title': 'Stockage sur cet appareil',
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
	'turn.sourcesMore': '+{count}',
	'turn.sourcesLess': 'Réduire les sources',
	'turn.copyAria': 'Copier la réponse',
	'turn.prevVersion': 'Version précédente',
	'turn.nextVersion': 'Version suivante',
	'turn.quote': 'Citer',
	'related.title': 'Questions liées',
	'app.dbBusy': 'Folio est déjà ouvert dans un autre onglet. Fermez-le, puis rechargez celui-ci.',
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
	'settings.tabs.account': 'Compte',
	'settings.defaultMode.title': 'Mode par défaut des nouvelles discussions',
	'settings.deleteChats.title': 'Supprimer toutes les discussions',
	'settings.deleteChats.desc':
		'Supprime de cet appareil toutes les discussions, leurs citations et leur historique de confidentialité. Les documents restent dans votre bibliothèque.',
	'settings.deleteChats.cta': 'Supprimer les discussions',
	'settings.deleteChats.confirmTitle': 'Supprimer toutes les discussions ?',
	'settings.myai.title': 'Endpoint My AI',
	'settings.myai.connection': 'Connexion',
	'settings.myai.model': 'Modèle par défaut',
	'settings.models.benchTitle': 'Test de vitesse',
	'settings.ai.use': 'Utiliser ce mode',
	'settings.ai.model.title': 'Modèle local',
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
	'settings.account.guest': 'Aucun compte. Connectez-vous pour débloquer le mode Assisted.',
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
		'Bloque toute requête sortante. Le mode Private et vos documents continuent de fonctionner ; les modes cloud et la connexion sont refusés avec un message clair.',
	'settings.offline.badge': 'Hors ligne · rien ne quitte cet appareil',
	'settings.workspace.title': 'Espace de travail',
	'settings.workspace.exportDesc':
		'Exportez vos documents, discussions, citations et historique de confidentialité dans un simple zip. Construit sur cet appareil, envoyé nulle part.',
	'settings.workspace.packing': 'Préparation…',
	'settings.workspace.export': 'Exporter mon espace de travail',
	'settings.workspace.quota': 'Utilisation Assisted ce mois-ci : {used} / {limit}',
	'settings.workspace.quotaSignIn': "L'utilisation Assisted apparaît ici une fois connecté.",
	'settings.models.title': 'Modèles IA sur cet appareil',
	'settings.models.measuring': 'Mesure…',
	'settings.models.none': 'Aucun modèle téléchargé pour le moment.',
	'settings.models.files': '{count} fichiers',
	'settings.models.delete': 'Supprimer',
	'settings.models.benchDesc':
		"Une courte génération privée mesure la vitesse de l'IA locale sur cet appareil.",
	'settings.models.testing': 'Test…',
	'settings.models.test': 'Tester mon appareil',
	'settings.models.prepareFirst': "Préparez d'abord l'IA privée (sélecteur de mode → Private).",
	'settings.models.tps': '{tps} tokens/seconde',
	'settings.models.comfortable': 'cet appareil exécute le mode Private confortablement.',
	'settings.models.slow':
		'cet appareil est lent pour le mode Private ; Assisted sera nettement plus rapide.',
	'settings.wipe.title': 'Tout supprimer',
	'settings.wipe.desc':
		"Efface tous les documents, discussions, index et modèles IA de cet appareil. Rien n'existe ailleurs, cette action est donc irréversible.",
	'settings.wipe.cta': 'Tout supprimer sur cet appareil',
	'settings.wipe.last': 'Dernière confirmation',
	'settings.wipe.confirmTitle': 'Tout supprimer sur cet appareil ?',
	'settings.wipe.armedBody':
		"Ceci détruit définitivement chaque document, discussion, index et modèle téléchargé stocké par Folio dans ce navigateur. Rien n'existe ailleurs. Vraiment supprimer ?",
	'settings.wipe.body':
		'Les documents, discussions, index de recherche et modèles IA seront effacés de ce navigateur. Votre compte survit ; il ne contient aucun contenu.',
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
	'privacy.event': '{count} extrait{s} · {bytes} → {dest}',

	// How it works
	'hiw.title': 'Comment circulent vos données',
	'hiw.subtitle': 'Par mode · vérifiable dans le code source',
	'hiw.intro':
		'Folio analyse, indexe et cherche dans vos documents dans ce navigateur. Les modes ne diffèrent que sur un point : qui rédige la réponse, et donc ce qui doit partir.',
	'hiw.whatLeaves': 'Ce qui part',
	'hiw.whatStays': 'Ce qui reste',
	'hiw.server': 'Le serveur',
	'hiw.private.leaves': 'Rien. Le modèle tourne dans votre navigateur (téléchargement unique).',
	'hiw.private.stays': "Documents, index, discussions, le modèle d'IA, vos questions et réponses.",
	'hiw.private.server': 'Jamais contacté pour répondre. Aucun compte requis.',
	'hiw.assisted.leaves':
		"Votre question et les extraits approuvés à l'étape de vérification. Jamais les documents entiers, jamais les noms de fichiers.",
	'hiw.assisted.stays': 'Documents, index, discussions. Les extraits que vous excluez.',
	'hiw.assisted.server':
		"Relaie les extraits à l'IA et renvoie la réponse en continu. Stocke votre e-mail, votre offre et un compteur d'utilisation. Ne stocke ni ne journalise jamais de contenu.",
	'hiw.myai.leaves':
		"Votre question plus les extraits pertinents, envoyés directement à l'endpoint que vous avez configuré.",
	'hiw.myai.stays': 'Documents, index, discussions.',
	'hiw.myai.server':
		'Les serveurs de Folio ne sont pas impliqués. Le trafic va de votre navigateur à votre endpoint.',
	'hiw.pipeline': 'Le pipeline',
	'hiw.step.document': 'Votre document',
	'hiw.step.parsing': 'Analyse',
	'hiw.step.chunking': 'Découpage',
	'hiw.step.embeddings': 'Embeddings',
	'hiw.step.index': 'Index local',
	'hiw.step.question': 'Votre question',
	'hiw.step.search': 'Recherche locale',
	'hiw.step.passages': 'Meilleurs passages',
	'hiw.step.modes': 'Private / Assisted / My AI',
	'hiw.step.answer': 'Réponse + citations',
	'hiw.frame': 'Ce navigateur',
	'hiw.onlyMode':
		"Seule l'étape du mode décide si quelque chose part, et seuls Assisted et My AI envoient les passages sélectionnés.",
	'hiw.proofTitle': 'Vérifiez par vous-même',
	'hiw.proofBody':
		"Préparez le mode Private, puis coupez le Wi-Fi et posez à nouveau votre question. L'analyse, la recherche et la réponse continuent de fonctionner.",
	'hiw.footer':
		'Le code est open source. Inspectez-le, hébergez-le vous-même, ou restez en mode Private sans réseau.',

	// Account
	'account.kicker': 'Folio · compte',
	'account.headline': 'Une adresse. Un code.',
	'account.body':
		'Un compte déverrouille le mode Assisted. Pas de mot de passe : nous envoyons un code à six chiffres à votre adresse e-mail. Vos documents et discussions restent sur cet appareil.',
	'account.signedInAs': 'Connecté en tant que',
	'account.signOut': 'Se déconnecter',
	'account.enterCode': 'Saisissez le code',
	'account.sentTo': 'Envoyé à {email} · valable 5 minutes',
	'account.otherAddress': 'Utiliser une autre adresse',
	'account.resend': 'Renvoyer le code',
	'account.email': 'E-mail',
	'account.sending': 'Envoi…',
	'account.sendCode': 'Recevoir un code',

	// Toasts (layout + uploads)
	'toast.ready': '{name} est prêt',
	'toast.failed': "{name} n'a pas pu être indexé",
	'toast.failedScanned': "Aucun texte extractible. L'OCR n'est pas encore pris en charge.",
	'toast.failedGeneric': 'Un problème est survenu pendant la lecture de ce fichier.',
	'toast.added': '{name} ajouté à Mes documents',
	'toast.addedDesc': 'Disponible dans chaque discussion, stocké sur cet appareil.',

	// Errors (stores + net)
	'error.offline': 'Le mode hors ligne est activé. Rien ne quitte cet appareil.',
	'error.sendCode': "Impossible d'envoyer le code",
	'error.invalidCode': 'Code invalide',

	// System notices, shown in the thread with their own styling
	'notice.retry': 'Réessayer',
	'notice.stopped': "La génération s'est arrêtée avant la réponse.",
	'notice.myaiUnreachable':
		"Votre endpoint IA est injoignable. Vérifiez qu'il tourne, l'URL et ses réglages CORS.",
	'notice.quota': 'Quota mensuel Assisted atteint. Il se réinitialise le mois prochain.',
	'notice.signIn': 'Connectez-vous pour utiliser le mode Assisted.',
	'notice.assistedDown': 'Le service Assisted est indisponible pour le moment.',
	'notice.assistedUnreachable': 'Le service Assisted est injoignable. Vérifiez votre connexion.'
};

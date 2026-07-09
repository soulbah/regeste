// French dictionary (spec 016). Typed against the English dictionary so a
// missing key fails typecheck. Vouvoiement; mode names (Private, Assisted,
// My AI) are product names and stay untranslated.

import type { en } from './en';

export const fr: Record<keyof typeof en, string> = {
	// Common
	'common.cancel': 'Annuler',
	'common.save': 'Enregistrer',
	'common.send': 'Envoyer',
	'common.continue': 'Continuer',
	'common.delete': 'Supprimer',
	'common.storedLocally': 'Stocké localement',
	'common.page': 'page {n}',
	'common.pages': '{n} pages',
	'common.requests': '{count} requête{s}',
	'common.excerpts': '{count} extrait{s}',
	'common.cloudAi': 'IA cloud',

	// Sidebar
	'sidebar.newChat': 'Nouvelle conversation',
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
	'sidebar.renameTitle': 'Renommer la conversation',
	'sidebar.chatTitleAria': 'Titre de la conversation',
	'sidebar.deleteTitle': 'Supprimer cette conversation ?',
	'sidebar.deleteDescription':
		'« {title} » et ses messages seront définitivement supprimés de cet appareil. Les documents restent dans votre bibliothèque.',
	'sidebar.guest': 'Invité',
	'sidebar.signedIn': 'Connecté · vos fichiers restent locaux',
	'sidebar.localWorkspace': 'Espace de travail local',

	// Command palette
	'palette.placeholder': 'Rechercher conversations, documents, commandes…',
	'palette.noResults': 'Rien trouvé sur cet appareil.',
	'palette.hint': 'Tapez pour chercher partout sur cet appareil.',
	'palette.chats': 'Conversations',
	'palette.documents': 'Documents',
	'palette.commands': 'Commandes',

	// Composer
	'composer.placeholder': 'Posez une question sur vos documents…',
	'composer.attachFrom': 'Joindre depuis vos documents',
	'composer.footer': 'Les réponses citent vos documents',

	// Add documents popover
	'addDocs.add': 'Ajouter',
	'addDocs.title': 'Ajouter à cette conversation',
	'addDocs.choose': 'Choisir parmi vos documents',
	'addDocs.chooseHint': 'Joignez un document déjà dans votre espace de travail.',
	'addDocs.upload': 'Importer depuis cet appareil',
	'addDocs.uploadHint': 'Ajouté à votre espace de travail et à cette conversation.',
	'addDocs.fromWorkspace': 'Depuis votre espace de travail',

	// Mode selector
	'modes.title': 'Réponse générée avec',
	'modes.private.description': 'Tout reste sur cet appareil.',
	'modes.assisted.description': 'Seuls les extraits pertinents sont traités en ligne.',
	'modes.myai.description': "Utilisez votre propre fournisseur d'IA.",
	'modes.best': 'Idéal pour cet appareil',
	'modes.bestReason.noGpu': "pas d'accès GPU dans ce navigateur",
	'modes.bestReason.local': "cet appareil peut exécuter l'IA localement",
	'modes.private.checking': 'Vérification de cet appareil…',
	'modes.private.unavailable': 'Indisponible sur cet appareil',
	'modes.private.prepared': 'Préparé · touchez pour charger',
	'modes.private.download': 'Téléchargement unique de {size}, puis fonctionne hors ligne',
	'modes.private.preparing': "Préparation de l'IA privée… {pct}%",
	'modes.private.loading': "Chargement de l'IA privée…",
	'modes.private.ready': 'Prêt · fonctionne hors ligne',
	'modes.error': 'Un problème est survenu',
	'modes.locked': 'Verrouillé · cette conversation est privée uniquement',
	'modes.offlineOn': 'Le mode hors ligne est activé',
	'modes.assisted.ready': 'Prêt · extraits uniquement, jamais les documents entiers',
	'modes.assisted.signIn': 'Connexion requise',
	'modes.myai.notConfigured': 'Non configuré →',
	'modes.changeMyai': "Changer l'endpoint ou le modèle My AI…",
	'modes.whatLeaves': "Ce qui quitte l'appareil dans chaque mode →",

	// My AI configuration
	'myai.title': 'My AI · votre propre endpoint',
	'myai.backAria': 'Retour aux modes',
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

	// Documents panel (in chat)
	'docs.title': 'Documents',
	'docs.subtitle': 'Joints à cette conversation · stockés localement',
	'docs.privateOnly': 'Privé uniquement : aucun mode cloud dans cette conversation',
	'docs.useAria': 'Utiliser {name} pour les questions',
	'docs.openAria': 'Ouvrir {name} dans la visionneuse',
	'docs.removeAria': 'Retirer {name} de cette conversation',
	'docs.empty': 'Aucun document dans cette conversation pour le moment.',

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
	'turn.nothingLeft': "Folio · rien n'a quitté cet appareil",
	'turn.assisted': 'Folio · Assisted',
	'turn.myai': 'Folio · My AI',
	'turn.whatAiSaw': "Ce que l'IA a vu",
	'turn.openSourceAria': 'Ouvrir la source {n}',
	'turn.copied': 'Copié',
	'turn.copy': 'Copier',
	'turn.copyText': 'Copier le texte',
	'turn.copyWithSources': 'Copier avec les sources',
	'turn.regenerate': 'Régénérer',
	'turn.closest': "Passages les plus proches, aucun n'a permis de répondre",

	// Retrieval preview turn
	'retrieval.badge': 'Aperçu de la recherche · les réponses IA arrivent avec le mode Private',
	'retrieval.noDocs':
		'Aucun document dans cette conversation. Joignez-en un pour le consulter ; les réponses de culture générale arrivent avec les modes IA.',
	'retrieval.noHits':
		"Je n'ai pas trouvé assez d'informations dans les documents joints pour cela.",
	'retrieval.weak':
		'Ces passages ont peu de rapport avec la question. Une réponse peut être peu fiable.',
	'retrieval.openAria': 'Ouvrir {name} à ce passage',

	// What AI saw panel
	'wais.title': "Ce que l'IA a vu",
	'wais.subtitle': 'Pour cette réponse · enregistré localement',
	'wais.closeAria': 'Fermer le panneau',
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
	'viewer.stored': 'stocké sur cet appareil',
	'viewer.closeAria': 'Fermer la visionneuse',
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
	'home.noDocs': 'Aucun document pour le moment',
	'home.headline': 'Discutez avec vos documents privés.',
	'home.sub':
		"Ajoutez des documents, posez des questions et voyez exactement ce à quoi l'IA peut accéder.",
	'home.filesLocal': 'Vos fichiers restent sur cet appareil · documents PDF et Word',
	'home.demoPreparing': 'Préparation de la démo…',
	'home.demoCta': 'Essayer avec un contrat fictif',
	'home.demoTitle': 'Démo · contrat fictif',
	'home.proof': 'Préparez le mode Private, puis coupez le Wi-Fi : tout continue de fonctionner.',

	// Chat page
	'chat.fallback': 'Conversation',
	'chat.docCount': '{count} document{s}',
	'chat.cloudRequests': '{count} requête{s} cloud · {kb} Ko',
	'chat.zeroBytes': '0 octet envoyé',
	'chat.threadAria': 'Fil de la conversation',
	'chat.drop': 'Déposez pour ajouter à cette conversation',
	'chat.fromSections': 'Depuis les sections de votre document',
	'chat.editAria': 'Modifier cette question',
	'chat.reviewing': 'En attente de votre vérification dans le panneau latéral',
	'chat.writing': 'Rédaction…',
	'chat.reading': 'Lecture de vos documents…',
	'chat.stop': 'Arrêter',
	'chat.meta': '{count} extrait{s} · {kb} Ko · {dest}',
	'chat.editTitle': 'Modifier votre question',
	'chat.editDescription': 'La réponse précédente sera remplacée.',
	'chat.editedAria': 'Question modifiée',
	'chat.resend': 'Renvoyer',

	// Documents page
	'docsPage.count': '{count} dans votre espace de travail',
	'docsPage.intro':
		'Chaque document ajouté à Folio vit ici et reste sur cet appareil. Ajoutez-en un à une conversation pour commencer à poser des questions dessus.',
	'docsPage.add': 'Ajouter des documents',
	'docsPage.sortRecent': 'Plus récents',
	'docsPage.sortName': 'Nom',
	'docsPage.sortSize': 'Taille',
	'docsPage.filterAll': 'tous',
	'docsPage.ready': 'prêt',
	'docsPage.noText': 'aucun texte extractible',
	'docsPage.error': 'erreur',
	'docsPage.sentOn': 'Extraits envoyés le {date}',
	'docsPage.neverSent': 'Jamais envoyé',
	'docsPage.inChats': 'Dans {count} conversation{s}',
	'docsPage.openAria': 'Ouvrir les détails de {name}',
	'docsPage.deleteFromDevice': 'Supprimer de cet appareil',
	'docsPage.empty':
		'Aucun document pour le moment. Ajoutez des fichiers PDF, Word, Markdown ou texte.',
	'docsPage.deleteTitle': 'Supprimer « {name} » de cet appareil ?',
	'docsPage.usedIn': 'Ce document est utilisé dans {count} conversation{s}.',
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
	'sheet.noChats': 'Aucune conversation pour le moment.',
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
	'settings.language.title': 'Language / Langue',
	'settings.offline.title': 'Forcer le hors ligne',
	'settings.offline.label':
		'Bloque toute requête sortante. Le mode Private et vos documents continuent de fonctionner ; les modes cloud et la connexion sont refusés avec un message clair.',
	'settings.offline.badge': 'Hors ligne · rien ne quitte cet appareil',
	'settings.workspace.title': 'Espace de travail',
	'settings.workspace.exportDesc':
		'Exportez vos documents, conversations, citations et historique de confidentialité dans un simple zip. Construit sur cet appareil, envoyé nulle part.',
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
		"Efface tous les documents, conversations, index et modèles IA de cet appareil. Rien n'existe ailleurs, cette action est donc irréversible.",
	'settings.wipe.cta': 'Tout supprimer sur cet appareil',
	'settings.wipe.last': 'Dernière confirmation',
	'settings.wipe.confirmTitle': 'Tout supprimer sur cet appareil ?',
	'settings.wipe.armedBody':
		"Ceci détruit définitivement chaque document, conversation, index et modèle téléchargé stocké par Folio dans ce navigateur. Rien n'existe ailleurs. Vraiment supprimer ?",
	'settings.wipe.body':
		'Les documents, conversations, index de recherche et modèles IA seront effacés de ce navigateur. Votre compte survit ; il ne contient aucun contenu.',
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
		'Chaque document, index et conversation est stocké localement. Ce rapport ne se remplit que si vous choisissez un mode cloud.',
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
	'hiw.private.stays':
		"Documents, index, conversations, le modèle d'IA, vos questions et réponses.",
	'hiw.private.server': 'Jamais contacté pour répondre. Aucun compte requis.',
	'hiw.assisted.leaves':
		"Votre question et les extraits approuvés à l'étape de vérification. Jamais les documents entiers, jamais les noms de fichiers.",
	'hiw.assisted.stays': 'Documents, index, conversations. Les extraits que vous excluez.',
	'hiw.assisted.server':
		"Relaie les extraits à l'IA et renvoie la réponse en continu. Stocke votre e-mail, votre offre et un compteur d'utilisation. Ne stocke ni ne journalise jamais de contenu.",
	'hiw.myai.leaves':
		"Votre question plus les extraits pertinents, envoyés directement à l'endpoint que vous avez configuré.",
	'hiw.myai.stays': 'Documents, index, conversations.',
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
	'hiw.allBrowser': 'tout dans ce navigateur',
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
		'Un compte déverrouille le mode Assisted. Pas de mot de passe : nous envoyons un code à six chiffres à votre adresse e-mail. Vos documents et conversations restent sur cet appareil.',
	'account.signedInAs': 'Connecté en tant que',
	'account.signOut': 'Se déconnecter',
	'account.enterCode': 'Saisissez le code',
	'account.sentTo': 'Envoyé à {email} · valable 5 minutes',
	'account.otherAddress': 'Utiliser une autre adresse',
	'account.resend': 'Renvoyer le code',
	'account.email': 'E-mail',
	'account.sending': 'Envoi…',
	'account.sendCode': 'Recevoir un code',
	'account.filesLocal': 'Vos fichiers restent sur cet appareil',

	// Toasts (layout + uploads)
	'toast.ready': '{name} est prêt',
	'toast.readyDesc': "Indexé localement. Votre fichier n'a jamais quitté cet appareil.",
	'toast.failed': "{name} n'a pas pu être indexé",
	'toast.failedScanned': "Aucun texte extractible. L'OCR n'est pas encore pris en charge.",
	'toast.failedGeneric': 'Un problème est survenu pendant la lecture de ce fichier.',
	'toast.added': '{name} ajouté à Mes documents',
	'toast.addedDesc': 'Disponible dans chaque conversation, stocké sur cet appareil.',

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

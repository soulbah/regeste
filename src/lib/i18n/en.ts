// English dictionary (spec 016). Values are the product's exact English copy.
// Keys are dot-namespaced by surface. {slot} placeholders are filled by t().

export const en = {
	// Common
	'common.cancel': 'Cancel',
	'common.save': 'Save',
	'common.send': 'Send',
	'common.continue': 'Continue',
	'common.delete': 'Delete',
	'common.page': 'page {n}',
	'common.pages': '{n} pages',
	'common.requests': '{count} request{s}',
	'common.excerpts': '{count} excerpt{s}',
	'common.cloudAi': 'Cloud AI',

	// Sidebar
	'sidebar.newChat': 'New chat',
	'sidebar.documents': 'Documents',
	'sidebar.search': 'Search',
	'sidebar.privacyReport': 'Privacy Report',
	'sidebar.settings': 'Settings',
	'sidebar.pinned': 'Pinned',
	'sidebar.today': 'Today',
	'sidebar.yesterday': 'Yesterday',
	'sidebar.previous': 'Previous',
	'sidebar.pin': 'Pin',
	'sidebar.unpin': 'Unpin',
	'sidebar.rename': 'Rename',
	'sidebar.exportMarkdown': 'Export as Markdown',
	'sidebar.renameTitle': 'Rename chat',
	'sidebar.chatTitleAria': 'Chat title',
	'sidebar.deleteTitle': 'Delete this chat?',
	'sidebar.deleteDescription':
		'"{title}" and its messages will be permanently removed from this device. Documents stay in your library.',
	'sidebar.guest': 'Guest',
	'sidebar.localWorkspace': 'Local workspace',

	// Command palette
	'palette.placeholder': 'Search chats, documents, commands…',
	'palette.noResults': 'Nothing found on this device.',
	'palette.hint': 'Type to search everything on this device.',
	'palette.chats': 'Chats',
	'palette.documents': 'Documents',
	'palette.commands': 'Commands',

	// Composer
	'composer.placeholder': 'Ask anything about your documents…',
	'composer.followUp': 'Ask a follow-up…',
	'composer.attachFrom': 'Attach from your documents',
	'composer.footer': 'Answers cite your documents',

	// Preset actions (R3) — read-only templates, sent as normal questions
	'actions.menu': 'Actions',
	'actions.summarize': 'Summarize',
	'actions.summarize.q': 'Summarize the attached documents in a few sentences.',
	'actions.dates': 'Find key dates',
	'actions.dates.q': 'List the key dates in the documents, with what happens on each.',
	'actions.amounts': 'Find amounts',
	'actions.amounts.q': 'List every amount in the documents and what it covers.',
	'actions.obligations': 'Find obligations',
	'actions.obligations.q': 'List the obligations of each party under these documents.',

	// Add documents popover
	'addDocs.choose': 'My documents',
	'addDocs.upload': 'Upload a file',

	// Mode selector
	'modes.title': 'Answer generated with',
	'modes.private.description': 'Everything stays on this device.',
	'modes.assisted.description': 'Only relevant excerpts are processed online.',
	'modes.myai.description': 'Use your own configured AI provider.',
	'modes.best': 'Best for this device',
	'modes.bestReason.noGpu': 'no GPU access in this browser',
	'modes.bestReason.local': 'this device can run the AI locally',
	'modes.private.checking': 'Checking this device…',
	'modes.private.unavailable': 'Unavailable on this device',
	'modes.private.prepared': 'Prepared · tap to load',
	'modes.private.download': 'One-time download of {size}, then works offline',
	'modes.private.downloadLite': 'One-time download of {size} · slower, everything stays here',
	'modes.private.readyLite': 'Ready · slower on this device, works offline',
	'modes.private.preparing': 'Preparing private AI… {pct}%',
	'modes.private.loading': 'Loading private AI…',
	'modes.private.ready': 'Ready · works offline',
	'modes.error': 'Something went wrong',
	'modes.locked': 'Locked · this chat is private-only',
	'modes.offlineOn': 'Offline mode is on',
	'modes.assisted.ready': 'Ready · excerpts only, never full documents',
	'modes.assisted.signIn': 'Sign in required',
	'modes.myai.notConfigured': 'Not configured →',
	'modes.changeMyai': 'Change My AI endpoint or model…',
	'modes.whatLeaves': 'What leaves the device in each mode →',

	// My AI configuration
	'myai.title': 'My AI · your own endpoint',
	'myai.backAria': 'Back to modes',
	'myai.baseUrl': 'OpenAI-compatible base URL',
	'myai.apiKey': 'API key (optional)',
	'myai.keyPlaceholder': 'none for local servers',
	'myai.testing': 'Testing…',
	'myai.test': 'Test connection',
	'myai.noModels': 'Connected, but the endpoint lists no models.',
	'myai.pickModel': 'Pick a model',
	'myai.direct':
		"Requests go straight from this browser to your endpoint. Folio's servers are never involved.",
	'myai.corsHint.ollama':
		'Start Ollama with OLLAMA_ORIGINS set to this site (or *) to allow browser access.',
	'myai.corsHint.lmstudio':
		'In LM Studio, enable CORS in the local server settings before connecting.',
	'myai.corsHint.vllm': 'Start vLLM with --allowed-origins including this site (or *).',
	'myai.error.key': 'The endpoint refused the API key.',
	'myai.error.status': 'The endpoint answered with an error ({status}).',
	'myai.error.unreachable':
		'Endpoint unreachable. Check the URL, that the server is running, and its CORS settings.',

	// Sources panel (in chat)
	'sources.title': 'Sources',
	'sources.subtitle': 'Attached to this chat',
	// Documents (library page + shared rows)
	'docs.title': 'Documents',
	'docs.privateOnly': 'Private only: no cloud mode in this chat',
	'docs.useAria': 'Use {name} for questions',
	'docs.openAria': 'Open {name} in the viewer',
	'docs.removeAria': 'Remove {name} from this chat',
	'docs.empty': 'No documents in this chat yet.',

	// Document ingest statuses
	'status.ready': 'Ready',
	'status.indexing': 'Indexing',
	'status.reading': 'Reading',
	'status.splitting': 'Splitting',
	'status.scanned': 'No extractable text. OCR is not supported yet',

	// Pre-send review panel
	'presend.title': 'Before it leaves',
	'presend.subtitle': 'Review what the AI will see',
	'presend.question': 'Your question',
	'presend.excerpts': 'Excerpts found in your documents',
	'presend.weak': 'These passages barely match the question. The answer may be unreliable.',
	'presend.includeAria': 'Include this excerpt',
	'presend.match': 'match {pct}%',
	'presend.firstTime': 'First time anything leaves this device',
	'presend.firstTimeBody':
		'Until now, everything happened locally. Sending this transmits your question and the checked excerpts to the Assisted service, never your files. It answers and forgets; nothing is stored or logged.',
	'presend.consent': 'I understand, continue',
	'presend.count': '{selected}/{total} excerpts · {kb} KB',
	'presend.footer': 'Only the checked excerpts and your question are sent. Your files stay here.',

	// Answer turn
	'turn.whatAiSaw': 'What AI saw',
	'turn.openSourceAria': 'Open source {n}',
	'turn.copied': 'Copied',
	'turn.copy': 'Copy',
	'turn.regenerate': 'Try again',
	'turn.closest': 'Closest passages, none supported an answer',

	// Retrieval preview turn
	'retrieval.badge': 'Retrieval preview · AI answers arrive with Private mode',
	'retrieval.noDocs':
		'No documents in this chat. Attach one to search it; AI answers from general knowledge arrive with the AI modes.',
	'retrieval.noHits': "I couldn't find enough information in the attached documents for this.",
	'retrieval.weak': 'These passages barely match the question. An answer may be unreliable.',
	'retrieval.openAria': 'Open {name} at this passage',

	// What AI saw panel
	'wais.title': 'What AI saw',
	'wais.subtitle': 'For this answer · recorded locally',
	'wais.destination': 'Destination',
	'wais.device': 'this device, nothing sent',
	'wais.zeroBytes': '0 bytes sent',
	'wais.kbSent': '{kb} KB sent',
	'wais.excluded': 'Excluded by you',
	'wais.sent': 'Sent',
	'wais.stayed': 'Stayed on this device',
	'wais.noPassages': 'No document passages. Only your question was involved.',
	'wais.notRecorded': 'Passage details were not recorded for this older answer.',
	'wais.nothing': 'Nothing recorded for this answer.',
	'wais.footer': 'Nothing else was shared for this answer.',

	// Viewer panel
	'viewer.document': 'Document',
	'viewer.removed': 'No longer on this device',
	'viewer.removedBody':
		'This document was removed from your library. The citation kept a snapshot of the passage:',
	'viewer.missing': 'Original file unavailable',
	'viewer.missingBody':
		"The original file could not be read from this device's storage. Here is the indexed passage:",
	'viewer.missingPdfBody':
		"The original PDF could not be read from this device's storage. Here is the indexed passage:",
	'viewer.prevAria': 'Previous page',
	'viewer.nextAria': 'Next page',
	'viewer.pageOf': 'page {n} / {total}',
	'viewer.citedPage': 'cited: p.{n}',

	// Home (new chat)
	'home.headline': 'Chat with your private documents.',
	'home.sub': 'Add documents, ask questions, and see exactly what the AI can access.',
	'home.demoPreparing': 'Preparing the demo…',
	'home.demoCta': 'Try with a sample contract',
	'home.demoTitle': 'Demo · sample contract',

	// Chat page
	'chat.fallback': 'Chat',
	'chat.docCount': '{count} document{s}',
	'chat.cloudRequests': '{count} cloud request{s} · {kb} KB',
	'chat.zeroBytes': '0 bytes sent',
	'chat.threadAria': 'Chat thread',
	'chat.drop': 'Drop to add to this chat',
	'chat.fromSections': "From your document's sections",
	'chat.editAria': 'Edit this question',
	'chat.reviewing': 'Waiting for your review in the side panel',
	'chat.writing': 'Writing…',
	'chat.reading': 'Reading your documents…',
	'chat.stop': 'Stop',
	'chat.meta': '{count} excerpt{s} · {kb} KB · {dest}',
	'chat.editedAria': 'Edited question',
	'chat.resend': 'Resend',

	// Documents page
	'docsPage.count': '{count} in your workspace',
	'docsPage.intro':
		"Every document you've added to Folio lives here and stays on this device. Add one to a chat to start asking questions about it.",
	'docsPage.add': 'Add documents',
	'docsPage.sortRecent': 'Most recent',
	'docsPage.sortName': 'Name',
	'docsPage.sortSize': 'Size',
	'docsPage.filterAll': 'all',
	'docsPage.ready': 'ready',
	'docsPage.noText': 'no extractable text',
	'docsPage.error': 'error',
	'docsPage.sentOn': 'Excerpts sent {date}',
	'docsPage.neverSent': 'Never sent',
	'docsPage.inChats': 'In {count} chat{s}',
	'docsPage.openAria': 'Open details for {name}',
	'docsPage.deleteFromDevice': 'Delete from this device',
	'docsPage.empty': 'No documents yet. Add PDF, Word, Markdown or text files.',
	'docsPage.deleteTitle': 'Delete "{name}" from this device?',
	'docsPage.usedIn': 'This document is used in {count} chat{s}.',
	'docsPage.deleteBody':
		'The file, its index and its embeddings will be permanently removed. This cannot be undone.',
	'docsPage.deleteConfirm': 'Delete permanently',

	// Document sheet
	'sheet.stored': 'Stored on this device',
	'sheet.size': 'Size',
	'sheet.pages': 'Pages',
	'sheet.indexed': 'Indexed',
	'sheet.model': 'Embedding model',
	'sheet.fingerprint': 'Fingerprint',
	'sheet.replacedLabel': 'Replaced',
	'sheet.times': '{count} time{s}',
	'sheet.privacy': 'Privacy',
	'sheet.loading': 'Loading…',
	'sheet.neverSent': 'Never sent anywhere',
	'sheet.usedIn': 'Used in',
	'sheet.noChats': 'No chats yet.',
	'sheet.open': 'Open',
	'sheet.reindex': 'Re-index',
	'sheet.replaceFile': 'Replace file…',
	'sheet.replaceFailed': 'Could not replace with {name}',
	'sheet.replaceFailedNoText': 'No usable text in the new file. The current version stays active.',
	'sheet.replaceFailedKeep': 'The current version stays active.',
	'sheet.replaced': 'Document replaced',
	'sheet.replacedDesc': 'Old citations keep their snapshots.',
	'sheet.egressLine': '{date}: excerpts sent to {dest}',

	// Settings
	'settings.title': 'Settings',
	'settings.subtitle': 'Storage · privacy · offline',
	'settings.storage.title': 'Storage on this device',
	'settings.storage.used': '{used} used',
	'settings.storage.available': '{quota} available',
	'settings.storage.persistent': "Persistent: the browser won't evict your documents",
	'settings.storage.notPersistent':
		'Not persistent: the browser may evict this data under storage pressure',
	'settings.storage.ask': 'Ask the browser to persist',
	'settings.storage.unavailable': 'Storage details unavailable.',
	'settings.week.title': 'Shared this week',
	'settings.week.nothing': 'Nothing left this device in the last 7 days.',
	'settings.week.fullHistory': 'Full history in the',
	'settings.week.privacyReport': 'Privacy Report',
	'settings.week.howEachMode': 'how each mode works:',
	'settings.week.dataFlows': 'data flows',
	'settings.language.title': 'Language / Langue',
	'addDocs.menuAria': 'Add documents and actions',
	'composer.enterHint': '⏎ send · ⇧⏎ new line',
	'composer.sendAria': 'Send',
	'turn.privateMeta': 'Private · {count} passage{s}',
	'turn.sourcesMore': '+{count}',
	'turn.sourcesLess': 'Show fewer sources',
	'turn.copyAria': 'Copy the answer',
	'turn.prevVersion': 'Previous version',
	'turn.nextVersion': 'Next version',
	'turn.quote': 'Reply',
	'related.title': 'Related',
	'app.dbBusy': 'Folio is already open in another tab. Close it, then reload this one.',
	'panel.backAria': 'Back to documents',
	'panel.hideAria': 'Hide the panel',
	'chat.panelToggleAria': 'Show or hide the side panel',
	'chat.panelTip.show': 'Show panel · ⌘.',
	'chat.panelTip.hide': 'Hide panel · ⌘.',
	'chat.stopTip': 'Stop · esc',
	'composer.sendTip': 'Send · ⏎',
	'sidebar.collapseTip': 'Collapse · ⌘B',
	'sidebar.expandTip': 'Expand · ⌘B',
	'sidebar.chatOptionsAria': 'Chat options',
	'settings.appearance.title': 'Appearance',
	'settings.appearance.system': 'System',
	'settings.appearance.light': 'Light',
	'settings.appearance.dark': 'Dark',
	'settings.offline.title': 'Force offline',
	'settings.offline.label':
		'Block every outgoing request. Private mode and your documents keep working; cloud modes and sign-in are refused with a clear message.',
	'settings.offline.badge': 'Offline · nothing leaves this device',
	'settings.workspace.title': 'Workspace',
	'settings.workspace.exportDesc':
		'Export your documents, chats, citations and privacy history as a plain zip. Built on this device, sent nowhere.',
	'settings.workspace.packing': 'Packing…',
	'settings.workspace.export': 'Export my workspace',
	'settings.workspace.quota': 'Assisted usage this month: {used} / {limit}',
	'settings.workspace.quotaSignIn': "Assisted usage appears here once you're signed in.",
	'settings.models.title': 'AI models on this device',
	'settings.models.measuring': 'Measuring…',
	'settings.models.none': 'No models downloaded yet.',
	'settings.models.files': '{count} files',
	'settings.models.delete': 'Delete',
	'settings.models.benchDesc':
		'A short private generation measures how fast this device runs the local AI.',
	'settings.models.testing': 'Testing…',
	'settings.models.test': 'Test my device',
	'settings.models.prepareFirst': 'Prepare the private AI first (mode selector → Private).',
	'settings.models.tps': '{tps} tokens/second',
	'settings.models.comfortable': 'this device runs Private mode comfortably.',
	'settings.models.slow': 'this device is slow for Private mode; Assisted will feel much faster.',
	'settings.wipe.title': 'Delete everything',
	'settings.wipe.desc':
		'Erases every document, chat, index and downloaded model from this device. Nothing exists anywhere else, so this cannot be undone.',
	'settings.wipe.cta': 'Delete everything on this device',
	'settings.wipe.last': 'Last confirmation',
	'settings.wipe.confirmTitle': 'Delete everything on this device?',
	'settings.wipe.armedBody':
		'This permanently destroys every document, chat, index and downloaded model stored by Folio in this browser. Nothing exists anywhere else. Really delete?',
	'settings.wipe.body':
		'Documents, chats, search indexes and AI models will be erased from this browser. Your account survives; it holds no content.',
	'settings.wipe.erasing': 'Erasing…',
	'settings.wipe.confirm': 'Yes, erase it all',
	'settings.wipe.continue': 'Continue',

	// Privacy Report
	'privacy.title': 'Privacy Report',
	'privacy.subtitle': "Everything that left this device, or didn't",
	'privacy.export': 'Export JSON',
	'privacy.nothing': 'Nothing has left this device.',
	'privacy.deviceSummary':
		'{count} answer{s} generated entirely on this device. 0 bytes sent anywhere.',
	'privacy.emptyBody':
		'Every document, index and conversation is stored locally. This report fills up only if you choose a cloud mode.',
	'privacy.onDevice': 'On this device',
	'privacy.privateAnswers': '{count} private answer{s}',
	'privacy.event': '{count} excerpt{s} · {bytes} → {dest}',

	// How it works
	'hiw.title': 'How your data flows',
	'hiw.subtitle': 'Per mode · verifiable in the source',
	'hiw.intro':
		'Folio parses, indexes and searches your documents in this browser. The modes differ on one point: who writes the answer, and so what has to leave.',
	'hiw.whatLeaves': 'What leaves',
	'hiw.whatStays': 'What stays',
	'hiw.server': 'The server',
	'hiw.private.leaves': 'Nothing. The model runs in your browser (one-time download).',
	'hiw.private.stays': 'Documents, index, chats, the AI model, your questions and answers.',
	'hiw.private.server': 'Never contacted for answering. No account needed.',
	'hiw.assisted.leaves':
		'Your question and the excerpts you approved in the review step. Never full documents, never file names.',
	'hiw.assisted.stays': 'Documents, index, chats. The excerpts you exclude.',
	'hiw.assisted.server':
		'Relays the excerpts to the AI and streams the answer back. Stores your email, plan and a usage counter. Never stores or logs content.',
	'hiw.myai.leaves':
		'Your question plus the relevant excerpts, sent straight to the endpoint you configured.',
	'hiw.myai.stays': 'Documents, index, chats.',
	'hiw.myai.server':
		"Folio's servers are not involved. Traffic goes from your browser to your endpoint.",
	'hiw.pipeline': 'The pipeline',
	'hiw.step.document': 'Your document',
	'hiw.step.parsing': 'Parsing',
	'hiw.step.chunking': 'Chunking',
	'hiw.step.embeddings': 'Embeddings',
	'hiw.step.index': 'Local index',
	'hiw.step.question': 'Your question',
	'hiw.step.search': 'Local search',
	'hiw.step.passages': 'Top passages',
	'hiw.step.modes': 'Private / Assisted / My AI',
	'hiw.step.answer': 'Answer + citations',
	'hiw.allBrowser': 'all in this browser',
	'hiw.onlyMode':
		'Only the mode step decides whether anything leaves, and only Assisted and My AI send the selected passages.',
	'hiw.proofTitle': 'Check it yourself',
	'hiw.proofBody':
		'Prepare Private mode, then turn off Wi-Fi and ask again. Parsing, search and the answer keep working.',
	'hiw.footer':
		'The code is open source. Inspect it, self-host it, or stay in Private mode with the network off.',

	// Account
	'account.kicker': 'Folio · account',
	'account.headline': 'One address. One code.',
	'account.body':
		'An account unlocks Assisted mode. No password: we send a six-digit code to your email. Your documents and chats stay on this device.',
	'account.signedInAs': 'Signed in as',
	'account.signOut': 'Sign out',
	'account.enterCode': 'Enter the code',
	'account.sentTo': 'Sent to {email} · valid 5 minutes',
	'account.otherAddress': 'Use another address',
	'account.resend': 'Resend code',
	'account.email': 'Email',
	'account.sending': 'Sending…',
	'account.sendCode': 'Send me a code',

	// Toasts (layout + uploads)
	'toast.ready': '{name} is ready',
	'toast.failed': '{name} could not be indexed',
	'toast.failedScanned': 'No extractable text. OCR is not supported yet.',
	'toast.failedGeneric': 'Something went wrong while reading this file.',
	'toast.added': '{name} added to My documents',
	'toast.addedDesc': 'Available to every chat, stored on this device.',

	// Errors (stores + net)
	'error.offline': 'Offline mode is on. Nothing leaves this device.',
	'error.sendCode': 'Could not send the code',
	'error.invalidCode': 'Invalid code',

	// System notices, shown in the thread with their own styling
	'notice.retry': 'Retry',
	'notice.stopped': 'Generation stopped before an answer came through.',
	'notice.myaiUnreachable':
		'Your AI endpoint is unreachable. Check that it is running, the URL, and its CORS settings.',
	'notice.quota': 'Monthly Assisted quota reached. It resets next month.',
	'notice.signIn': 'Sign in to use Assisted mode.',
	'notice.assistedDown': 'The Assisted service is unavailable right now.',
	'notice.assistedUnreachable': 'The Assisted service is unreachable. Check your connection.'
} as const;

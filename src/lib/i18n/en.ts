// English dictionary (spec 016). Values are the product's exact English copy.
// Keys are dot-namespaced by surface. {slot} placeholders are filled by t().

export const en = {
	// Common
	'common.cancel': 'Cancel',
	'common.close': 'Close',
	'disabled.chooseMode': 'Choose an answer mode first.',
	'disabled.modeNotReady': 'Finish setting up this mode first.',
	'disabled.needUrl': 'Enter the base URL first.',
	'disabled.emptyMessage': 'Write a message first.',
	'disabled.indexing': 'This document is still being prepared.',
	'disabled.indexingChat': 'Wait until the first document is ready.',
	'disabled.needEmail': 'Enter a valid email first.',
	'disabled.selectPassages': 'Select at least one passage.',
	'disabled.selectDoc': 'Select at least one document.',
	'disabled.consentFirst': 'Accept sending passages first.',
	'common.save': 'Save',
	'common.send': 'Send',
	'common.continue': 'Continue',
	'common.delete': 'Delete',
	'common.page': 'page {n}',
	'common.pages': '{n} pages',
	'common.requests': '{count} request{s}',
	'common.passages': '{count} passage{s}',
	'common.cloudAi': 'Cloud AI',

	// Sidebar
	'sidebar.newChat': 'New chat',
	'sidebar.documents': 'Documents',
	'sidebar.search': 'Search',
	'sidebar.privacyReport': 'Privacy report',
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
	'sidebar.resizeAria': 'Resize the sidebar',
	'sidebar.guest': 'Guest',
	'sidebar.localWorkspace': 'Local workspace',

	// Command palette
	'palette.placeholder': 'Search chats, documents, commands…',
	'palette.noResults': 'Nothing found.',
	'palette.hint': 'Type to search everything.',
	'palette.chats': 'Chats',
	'palette.documents': 'Documents',
	'palette.commands': 'Commands',

	// Composer
	'composer.placeholder': 'Ask anything about your documents…',
	'composer.followUp': 'Ask a follow-up…',
	'composer.attachFrom': 'Attach from your documents',
	'composer.footer': 'Answers cite your documents',
	'composer.preparingOne': 'Preparing {name}',
	'composer.preparingMany': 'Preparing {count} documents',
	'composer.preparingStep': '{phase}, step {step} of 4',
	'composer.preparingAvailable': '{count} ready, you can ask a question now',
	'composer.documentsReady': 'Your documents are ready to search',
	'composer.waitPlaceholder': 'Write your question, it sends once your document is ready…',

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

	// Mode selector.
	//
	// The names say WHERE the answer is computed, because that is the only thing
	// that actually differs and the only thing a user can verify (turn off the
	// network: one of the three keeps working). "Private" claimed a virtue the
	// other two also have — your own server is no less private — while
	// "Assisted" said nothing at all about the one mode that leaves the device.
	// Research is consistent that users assume an AI feature runs locally and
	// are usually wrong, so the label has to carry the location.
	'app.unexpected': 'Something went wrong.',
	'viewer.renderFailed': 'This page could not be drawn. Try again.',
	'toast.originalNotKept':
		'The original file could not be kept. Answers still work; the page view for this document will show its passages instead.',
	'modes.private.name': 'This device',
	'modes.assisted.name': 'Cloud',
	'modes.myai.name': 'Your server',
	'modes.private.description': 'Everything stays on this device.',
	'modes.assisted.description': 'Only relevant passages are processed online.',
	'modes.myai.description': 'Use your own configured AI provider.',
	'modes.best': 'Best for you',
	'modes.bestReason.noGpu': "this browser can't run the AI on your device",
	'modes.bestReason.local': 'this device can run the model itself',
	'modes.private.checking': 'Checking this device…',
	'modes.private.unavailable': 'Unavailable on this device',
	'modes.private.download': 'One-time download of {size}, then works offline',
	'modes.private.downloadLite': 'One-time download of {size} · slower, everything stays here',
	'modes.private.readyLite': 'Ready · slower on this device, works offline',
	'modes.private.preparing': 'Preparing the local model… {pct}%',
	'modes.private.loading': 'Loading the local model…',
	'modes.private.ready': 'Ready · works offline',
	'modes.error': 'Something went wrong',
	// The three ways preparing the on-device AI fails, told apart because the
	// remedies have nothing in common.
	'storageRisk.title': 'This window will not keep the download',
	'storageRisk.body':
		'The model is a {size} file, and this browser has refused to commit to storing it. Starting now would very likely fail partway.',
	'storageRisk.reason1':
		'A private window. It cannot keep large files, whatever it reports, and everything is dropped when you close it.',
	'storageRisk.reason2': 'Or the disk is nearly full, and the browser is protecting what is left.',
	'storageRisk.alternative':
		'Opening this in a normal window fixes it. Cloud and Your server answer without any download.',
	'storageRisk.anyway': 'Download anyway',
	'llm.error.tooLarge':
		'This device could not load a download that large. A smaller one of {size} is available.',
	'llm.error.tooLarge.cta': 'Download the smaller one',
	'llm.error.ephemeral':
		'A private window cannot store the model. Open this in a normal window, or pick Cloud or Your server.',
	'llm.error.storage':
		'This browser ran out of storage for the model. Free up disk space and retry, or pick Cloud or Your server.',
	'llm.error.memory':
		'This device ran out of memory preparing the model. Close other tabs and retry.',
	'modes.locked': 'Locked · this chat is private-only',
	'modes.offlineOn': 'Offline mode is on',
	'modes.choose': 'Answer mode',
	'onboard.chooseMode': 'Choose answer mode',
	'onboard.headline': 'Choose where the answer is written.',
	'onboard.headlineSub': 'You can change this at any time.',
	'onboard.pick': 'Use this',
	'onboard.cost.download': 'One-time download · {size}',
	'onboard.cost.signIn': 'Sign in · nothing to install',
	'onboard.cost.endpoint': 'Your own server · nothing to install',
	'onboard.downloading': 'Downloading. Add a document while you wait.',
	'onboard.unfinished': 'Finish setting up to get answers.',
	'onboard.resume': 'Finish',
	'onboard.needDownload': 'Download the model to answer on this device.',
	'onboard.needEndpoint': 'Set up your server to get answers.',
	'modes.state.ready': 'Ready',
	'modes.state.setup': 'Set up',
	'modes.state.signIn': 'Sign in',
	'modes.activated': '{mode} is ready and now selected.',
	'modes.aiSettings': 'AI settings…',
	// Cloud model picker. The unit is the answer, never a made-up currency and
	// never the platform's billing unit: the same daily budget shown as a
	// number of answers per model is the trade, stated in the only word that
	// needs no explaining.
	'cloudModel.label': 'Answer quality',
	'cloudModel.balanced': 'Standard',
	'cloudModel.balanced.line': 'The everyday choice, and four times more of them.',
	'cloudModel.best': 'Thorough',
	'cloudModel.best.line': 'A larger model, for fewer questions a day.',
	'cloudModel.left': '≈ {count} left today',
	'cloudModel.perDay': '≈ {count} questions a day',
	'cloudModel.spent': 'Nothing left today',

	// Sign-in page
	'auth.title': 'Sign in',
	'auth.checkInbox': 'Check your inbox.',
	'auth.back': 'Back to chat',
	// Where you were, when that was somewhere other than the chat.
	'auth.backGeneric': 'Back',
	'auth.headline': 'Sign in',
	'auth.body': 'Only the Cloud mode needs an account. The other two never do.',
	'auth.email': 'Email',
	'auth.emailPlaceholder': 'you@example.com',
	'auth.continue': 'Continue',
	'auth.sending': 'Sending…',
	'auth.or': 'or',
	'auth.continueWith': 'Continue with {provider}',
	'auth.providerSoon': 'Not available yet.',
	'auth.socialFailed': 'That sign-in did not complete. Try again, or use a code.',
	'auth.codeSent': 'Enter the six-digit code sent to {email}.',
	'auth.changeEmail': 'Use another address',
	'auth.footnote': 'Your documents and chats stay on this device either way.',
	'modes.whatLeaves': 'What leaves the device in each mode →',

	// My AI configuration
	'myai.baseUrl': 'OpenAI-compatible base URL',
	'myai.apiKey': 'API key (optional)',
	'myai.keyPlaceholder': 'none for local servers',
	'myai.testing': 'Testing…',
	'myai.test': 'Test connection',
	'myai.noModels': 'Connected, but your server lists no models.',
	'myai.pickModel': 'Pick a model',
	'myai.direct': 'Requests go straight from this browser to your server. Nothing in between.',
	'myai.corsHint.ollama':
		'Start Ollama with OLLAMA_ORIGINS set to this site (or *) to allow browser access.',
	'myai.corsHint.lmstudio':
		'In LM Studio, enable CORS in the local server settings before connecting.',
	'myai.corsHint.vllm': 'Start vLLM with --allowed-origins including this site (or *).',
	'myai.error.key': 'Your server refused the API key.',
	'myai.error.status': 'Your server answered with an error ({status}).',
	'myai.error.unreachable':
		'Your server is unreachable. Check the URL, that it is started, and its CORS settings.',

	// Sources panel (in chat)
	'sources.title': 'Sources',
	'sources.subtitle': 'Attached to this chat',
	// Documents (library page + shared rows)
	'docs.title': 'Documents',
	'docs.reviewSend': 'Always check what leaves this chat',
	'docs.privateOnly': 'This device only: no cloud mode in this chat',
	'docs.useAria': 'Use {name} for questions',
	'docs.openAria': 'Open {name} in the viewer',
	'docs.removeAria': 'Remove {name} from this chat',
	'docs.empty': 'No documents in this chat yet.',
	'docs.emptyHint': 'Add one to ask questions about it.',
	'docs.add': 'Add documents',
	'docs.optionsAria': 'Options for {name}',
	'docs.remove': 'Remove from chat',
	'docs.searchLibrary': 'Search your documents…',
	'docs.addCount': 'Add {count} document{s}',
	'docs.alreadyAdded': 'Added',

	// Document ingest statuses. Scanned-page work deliberately reuses Reading.
	'status.received': 'Received',
	'status.ready': 'Ready',
	'status.reading': 'Reading',
	'status.splitting': 'Splitting',
	'status.indexing': 'Preparing',
	'status.failed': 'Failed',

	// Pre-send review panel
	'presend.title': 'Before it leaves',
	'presend.subtitle': 'Review what leaves your device',
	'presend.question': 'Your question',
	'presend.context': 'Conversation context',
	'presend.passages': 'Passages found in your documents',
	'presend.weak': 'These passages barely match the question. The answer may be unreliable.',
	'presend.includeAria': 'Include this passage',
	'presend.match': 'match {pct}%',
	'presend.firstTime': 'First time anything leaves this device',
	'presend.firstTimeBody':
		'Until now, everything happened on your device. Sending this transmits your question and the checked passages to the Cloud service, never your files. You get your answer back, and nothing is stored or logged.',
	'presend.consent': 'I understand, continue',
	'presend.count': '{selected}/{total} passages · {kb} KB',
	'presend.footer': 'Only the checked passages and your question are sent. Your files stay here.',
	'presend.footerWithContext':
		'Your question, this context, and the checked passages are sent. Your files stay here.',

	// Answer turn
	'turn.whatAiSaw': 'What the AI received',
	'turn.openSourceAria': 'Open source {n}',
	'turn.copied': 'Copied',
	'turn.copy': 'Copy',
	'turn.regenerate': 'Try again',
	'turn.closest': 'Closest sources, none supported an answer',

	// Retrieval preview turn — plain language; the reason adapts to why no answer
	// was written, and points at the documents (source chips) the user sees.
	'retrieval.found': 'Found in your documents',
	'retrieval.reason.download': 'Download the local model for a written answer.',
	'retrieval.reason.setup': 'Set up this mode for a written answer.',
	'retrieval.reason.loading': 'The local model is getting ready, try again in a moment.',
	'retrieval.reason.ready': 'Ask again for a written answer.',
	'retrieval.reason.generic': 'Pick an answer mode to get a written answer.',
	'retrieval.noDocs': 'No documents in this chat. Add one to ask questions about it.',
	'retrieval.noHits': 'Nothing in your documents matches this question.',
	'retrieval.weak': 'These sources barely match the question. An answer may be unreliable.',
	'retrieval.openAria': 'Open {name}',

	// What AI saw panel
	'wais.title': 'What the AI received',
	'wais.subtitle': 'For this answer · recorded locally',
	'wais.destination': 'Destination',
	'wais.device': 'this device, nothing sent',
	'wais.zeroBytes': '0 bytes sent',
	'wais.kbSent': '{kb} KB sent',
	'wais.excluded': 'Excluded by you',
	'wais.sent': 'Sent',
	'wais.stayed': 'Stayed',
	'wais.noPassages': 'No document passages. Only your question was involved.',
	'wais.notRecorded': 'Passage details were not recorded for this older answer.',
	'wais.nothing': 'Nothing recorded for this answer.',
	'wais.footer': 'Nothing else was shared for this answer.',

	// Viewer panel
	'viewer.document': 'Document',
	'viewer.removed': 'No longer available',
	'viewer.removedBody':
		'This document was removed from your library. The citation kept a snapshot of the passage:',
	'viewer.missing': 'Original file unavailable',
	'viewer.missingBody':
		"The original file could not be read from this device's storage. Here is the saved passage:",
	'viewer.missingPdfBody':
		"The original PDF could not be read from this device's storage. Here is the saved passage:",
	'viewer.prevAria': 'Previous page',
	'viewer.nextAria': 'Next page',
	'viewer.pageOf': 'page {n} / {total}',
	'viewer.citedPage': 'cited: p.{n}',

	// Home (new chat)
	'home.headline': 'Chat with your documents.',
	'home.dropTitle': 'Drop a document, or click to browse',
	'home.pickLead': 'Ask about',
	'home.pickAll': 'All {count} documents',
	'home.addNew': 'Add a file',
	'home.sampleLead': 'New here?',
	'home.sampleLink': 'Try with a sample contract',
	'home.sub': 'Add documents, ask questions, and see exactly what gets shared.',
	'home.demoPreparing': 'Preparing the demo…',
	'home.demoCta': 'Try with a sample contract',
	'home.demoTitle': 'Demo · sample contract',
	'home.drop': 'Drop to start a chat',

	// Chat page
	'chat.fallback': 'Chat',
	'chat.docCount': '{count} document{s}',
	'chat.cloudRequests': '{count} cloud request{s} · {kb} KB',
	'chat.zeroBytes': '0 bytes sent',
	'chat.threadAria': 'Chat thread',
	'chat.emptyTitle': 'Add a document to this chat',
	'chat.emptyBody':
		'Answers come from the documents in this chat. Add one to start, or drop a file here.',
	'chat.drop': 'Drop to add to this chat',
	'chat.fromSections': "From your document's sections",
	'chat.editAria': 'Edit this question',
	'chat.reviewing': 'Waiting for your review in the side panel',
	'chat.writing': 'Preparing your answer…',
	'chat.reading': 'Searching your documents…',
	'chat.stop': 'Stop',
	'chat.meta': '{count} passage{s} · {kb} KB · {dest}',
	'chat.editedAria': 'Edited question',
	'chat.resend': 'Resend',

	// Documents page
	'docsPage.count': '{count} in your workspace',
	'docsPage.intro':
		'Everything you add is read right in your browser and never leaves it. Your library stays searchable at any time, even offline.',
	'docsPage.introAction': 'Add a document to a chat to start asking questions.',
	'docsPage.add': 'Add documents',
	'docsPage.drop': 'Drop to add to your library',
	'docsPage.sortRecent': 'Most recent',
	'docsPage.sortName': 'Name',
	'docsPage.sortSize': 'Size',
	'docsPage.filterAll': 'all',
	'docsPage.search': 'Filter by name…',
	'docsPage.emptyTitle': 'Your library is empty',
	'docsPage.types': 'PDF · Word · Markdown · Text',
	'docsPage.added': 'added {date}',
	'docsPage.details': 'Details',
	'docsPage.noMatch': 'Nothing matches this filter.',
	'docsPage.error': 'failed',
	'docsPage.indexing': 'indexing…',
	'docsPage.inChats': 'In {count} chat{s}',
	'docsPage.openAria': 'Open details for {name}',
	'docsPage.deleteFromDevice': 'Delete from this device',
	'docsPage.deleteTitle': 'Delete "{name}" from this device?',
	'docsPage.usedIn': 'This document is used in {count} chat{s}.',
	'docsPage.deleteBody':
		'The file and its search data will be permanently removed. This cannot be undone.',
	'docsPage.deleteConfirm': 'Delete permanently',

	// Document sheet
	'sheet.size': 'Size',
	'sheet.pages': 'Pages',
	'sheet.indexed': 'Indexed',
	'sheet.model': 'Indexed with',
	'sheet.fingerprint': 'Fingerprint',
	'sheet.replacedLabel': 'Replaced',
	'sheet.times': '{count} time{s}',
	'sheet.privacy': 'Privacy',
	'sheet.loading': 'Loading…',
	'sheet.detailUnavailable': "This document's details couldn't be read right now.",
	'sheet.neverSent': 'No passage has left your device',
	'sheet.usedIn': 'Used in',
	'sheet.noChats': 'No chats yet.',
	'sheet.open': 'Open',
	'sheet.reindex': 'Re-index',
	'sheet.improveSearch': 'Improve search',
	'sheet.reindexRecommended':
		'A newer search model is available. The current index remains usable until you rebuild it.',
	'sheet.replaceFile': 'Replace file…',
	'sheet.replaceFailed': 'Could not replace with {name}',
	'sheet.replaceFailedNoText': 'No usable text in the new file. The current version stays active.',
	'sheet.replaceFailedKeep': 'The current version stays active.',
	'sheet.replaced': 'Document replaced',
	'sheet.replacedDesc': 'Old citations keep their snapshots.',
	'sheet.egressLine': '{date}: passages sent to {dest}',
	'sheet.language': 'Language',
	'sheet.sentCount': 'Sent {count} time{s}',
	'sheet.seeAll': 'See all ({count})',
	'sheet.seeLess': 'See less',
	'sheet.copyAria': 'Copy fingerprint',
	'sheet.copied': 'Fingerprint copied',
	'sheet.details': 'Details',
	'sheet.usedInCount': 'Used in {count} chat{s}',
	'sheet.stillIndexing': 'Still indexing',
	'sheet.openChatAria': 'Open the chat {title}',
	'sheet.indexFailed': "This document couldn't be indexed.",

	// Pagination
	'pagination.prev': 'Previous page',
	'pagination.next': 'Next page',
	'pagination.first': 'First page',
	'pagination.last': 'Last page',
	'pagination.goToPage': 'Go to page {n}',
	'pagination.range': '{from}–{to} of {total}',
	'pagination.perPage': 'Per page',

	// Settings
	'settings.title': 'Settings',
	'settings.subtitle': 'Storage · privacy · offline',
	'advisory.eviction':
		'This browser has not committed to keeping your documents, so it may clear them to reclaim space. Installing the app, or allowing storage, settles it.',
	'update.ready': 'A new version is ready.',
	'update.cta': 'Reload',
	'settings.storage.title': 'Storage',
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
	'settings.week.privacyReport': 'Privacy report',
	'settings.week.howEachMode': 'how each mode works:',
	'settings.week.dataFlows': 'data flows',
	'settings.language.title': 'Language',
	'addDocs.menuAria': 'Add documents and actions',
	'composer.enterHint': '⏎ send · ⇧⏎ new line',
	'composer.sendAria': 'Send',
	'turn.privateMeta': '{mode} · {count} passage{s}',
	'work.search.active': 'Searching {count} documents',
	'work.search.done': 'Searched {count} documents',
	'work.inspect.active': 'Checking relevant passages',
	'work.inspect.done': 'Checked {count} passages',
	'work.calculate.active': 'Calculating exact values',
	'work.calculate.done': 'Calculated {count} values',
	'work.write.active': 'Writing the answer',
	'work.write.waiting': 'Waiting for you to approve what leaves',
	'work.write.done': 'Answer written',
	'work.verify.active': 'Checking the answer against the sources',
	'work.verify.done': 'Answer checked',
	'work.method': 'How this result was built',
	'work.method.targeted': 'Retrieved and checked {count} relevant passages.',
	'work.method.synthesis': 'Compared {count} relevant passages before answering.',
	'work.method.aggregate':
		'Read the selected documents exhaustively and calculated from {count} retained values.',
	'work.method.clarification': 'Asked for the missing detail before searching the documents.',
	'work.method.notes': 'Draft notes',
	'work.method.notesAll': 'Show all',
	'work.method.notesLess': 'Show less',
	'turn.sourcesMore': '+{count}',
	'turn.sourcesLess': 'Show fewer sources',
	'turn.copyAria': 'Copy the answer',
	'turn.prevVersion': 'Previous version',
	'turn.nextVersion': 'Next version',
	'turn.quote': 'Quote',
	'related.title': 'Related',
	'clarification.scope': 'Should I calculate this for one record or across all selected documents?',
	'clarification.financialRole':
		'Which amount should I use: sent, received, fees, taxes, or the total charged?',
	'clarification.intent': 'What result do you want from the selected documents?',
	'clarification.time': 'Which exact date or period should I use?',
	'clarification.entity': 'Which person or earlier subject do you mean?',
	'clarification.document': 'Which document or revision should I use?',
	'clarification.unitCurrency': 'Which target currency or unit should I use?',
	'clarification.multiPart': 'Which part should I answer first?',
	// Help page. Symptom first, because that is what someone recognises.
	'help.title': 'When the browser blocks',
	'help.modelStorage.title': 'When the AI download stops partway',
	'help.modelStorage.symptom':
		'The download for the on-device AI fails at some percentage, with a message about storage.',
	'help.modelStorage.cause':
		'The AI is a large file this browser stores locally, and the browser refused the space. The two usual reasons: a private window, which cannot keep large files no matter what it reports, or a disk that is nearly full.',
	'help.modelStorage.fix1': 'Open the app in a normal window rather than a private one.',
	'help.modelStorage.fix2': 'Free a few gigabytes of disk space, then retry the download.',
	'help.modelStorage.fix3':
		'Or skip the download: the Cloud and Your server modes answer without it.',
	'help.kind.storage': 'Storage',
	'help.kind.browser': 'Browser',
	'help.kind.network': 'Network',
	'help.allGuides': 'All guides',
	'help.more': 'Other guides',
	'help.intro':
		'Everything here runs in your browser, so your browser settings are part of how it runs. These are the cases that stop it, and what changes each one.',
	'help.cause': 'Why',
	'help.fix': 'What to do',
	'help.footnote':
		'None of these send your documents anywhere. They are settings on your machine, and you can undo any of them.',

	'help.blocked.title': 'Nothing can be saved',
	'help.blocked.symptom':
		'Documents refuse to be added, or the app reports that storage is blocked for this site.',
	'help.blocked.cause':
		'Your documents live in the browser, in a store called OPFS. A private window and strict content blocking both refuse it, and there is no fallback: with no store, there is nowhere to put a document.',
	'help.blocked.fix1': 'Open the app in a normal window rather than a private one.',
	'help.blocked.fix2':
		'In Firefox, click the shield in the address bar and turn protections off for this site. In Safari, allow storage for this site in the privacy settings.',
	'help.blocked.fix3': 'Reload the page.',

	'help.privateWindow.title': 'Everything disappears when the window closes',
	'help.privateWindow.symptom':
		'Documents you added are gone the next time you open the app, along with the chats about them.',
	'help.privateWindow.cause':
		'A private window keeps nothing once you close it. Chrome and Edge still let documents be added there and read normally, so nothing looks wrong until the window closes and the whole library goes with it. Firefox and Safari refuse the storage from the start, which at least fails where you can see it.',
	'help.privateWindow.fix1': 'Open the app in a normal window and add your documents again.',
	'help.privateWindow.fix2':
		'In a normal window, Settings then Data reads Persistent once the browser has committed to keeping your library.',
	'help.privateWindow.fix3':
		'If you cannot leave the private window, export your workspace from Settings before closing it.',
	'help.tabs.title': 'Open in another tab',
	'help.tabs.symptom': 'The app says it is already open somewhere else and stops loading.',
	'help.tabs.cause':
		'One tab owns the database at a time. Two tabs writing to the same store is how a store gets corrupted, so the second one refuses rather than risk it.',
	'help.tabs.fix1': 'Close the other tab, then reload this one.',

	'help.eviction.title': 'Documents disappeared',
	'help.eviction.symptom': 'Documents added earlier are gone after a while, or after a restart.',
	'help.eviction.cause':
		'A browser reclaims space from sites it considers idle unless the site asked to be kept. The app asks on every start, and the browser grants it silently once you have used the app a few times.',
	'help.eviction.fix1':
		'Settings, then Data, shows whether storage is kept. If it is not, the button there asks again.',
	'help.eviction.fix2':
		'Export your workspace from the same tab to keep a copy outside the browser.',

	'help.gpu.title': 'The on-device model will not install',
	'help.gpu.symptom':
		'Choosing This device says it is unavailable, or the download finishes and the model fails to start.',
	'help.gpu.cause':
		'Running a model in a tab needs WebGPU, and the browsers differ. Firefox allows fewer buffers per shader than the model needs. Safari does not support the isolation the processor fallback requires.',
	'help.gpu.fix1':
		'Use a Chromium browser for This device: Chrome, Edge, Brave, Arc and Opera all work.',
	'help.gpu.fix2':
		'Or keep this browser and pick Cloud or Your server, which need no local model at all.',

	'help.network.title': 'A download or an answer never arrives',
	'help.network.symptom':
		'The model download stalls, or a Cloud answer reports the service as unreachable.',
	'help.network.cause':
		'A VPN, a company proxy or an extension can block the requests. The model weights come from a public CDN, and Cloud answers go through this app’s own server; either can be filtered.',
	'help.network.fix1': 'Turn the VPN or the blocking extension off for this site and retry.',
	'help.network.fix2':
		'On a company network, ask for this site and the model CDN to be allowed, or use This device, which needs the network only once.',

	'report.title': 'Report a problem',
	'report.intro': 'Write to us and we will answer. Three things make it quick to fix.',
	'report.step1': 'What you were doing, and what happened instead.',
	'report.step2': 'Your browser and whether you had it installed as an app.',
	'report.step3': 'The answer mode you were on, if the problem was an answer.',
	'report.copy': 'Copy',
	'report.copied': 'Copied',
	'report.write': 'Write to us',
	'report.github': 'Or open an issue on GitHub',
	'report.subject': 'Problem report',
	'app.whatToDo': 'What to do',
	'app.dbBusy': 'You already have this open in another tab. Close it there, then reload.',
	'app.dbBlocked':
		'This browser is blocking storage for this site, so nothing can be saved here. Leave private browsing, or allow storage for this site, then reload.',
	'app.workerFailed.title': "This page didn't finish loading",
	'app.workerFailed.body': 'Reload to continue.',
	'app.workerFailed.cta': 'Reload',
	'app.workerFailed.dismiss': 'Dismiss',
	'app.workerFailed.search': 'Document search stopped working.',
	'app.workerFailed.ocr': 'Text recognition stopped working.',
	'app.workerFailed.privateAi': 'The local model stopped working.',
	'panel.backAria': 'Back to documents',
	'panel.hideAria': 'Close the panel',
	'chat.panelToggleAria': 'Open the side panel',
	'chat.panelTip.show': 'Open panel · ⌘.',
	'chat.stopTip': 'Stop · esc',
	'composer.sendTip': 'Send · ⏎',
	'sidebar.collapseTip': 'Collapse · ⌘B',
	'sidebar.expandTip': 'Expand · ⌘B',
	'sidebar.chatOptionsAria': 'Chat options',
	'menu.language': 'Language',
	'menu.signIn': 'Sign in',
	'work.model.downloading.title': 'Downloading the model',
	'work.model.downloading.body':
		'One download of {size}. It then stays on this device and works offline.',
	'work.model.loading.title': 'Starting the model',
	'work.model.loading.body':
		'The file is here. It is being placed in memory, which is the slow part and happens once per session.',
	'reindex.title': 'Rereading your documents',
	'reindex.body':
		'This version changed how documents are indexed, so each one is read again from the copy on this device. Answers keep working meanwhile, and improve as each document finishes.',
	'settings.rerank.title': 'Deeper search',
	'settings.rerank.body':
		"Finds the passage that answers you even when your words are not the document's. A fee schedule says « montant forfaitaire » where you would say « combien ça coûte », and searching on words alone walks past it.",
	'settings.rerank.cost': 'ONE-TIME DOWNLOAD · 544 MB',
	'settings.rerank.on': 'On',
	'settings.rerank.turnOn': 'Turn on deeper search',
	'settings.rerank.turnOff': 'Turn off',
	'settings.tabs.general': 'General',
	'settings.tabs.data': 'Data',
	'settings.tabs.ai': 'AI',
	'settings.tabs.usage': 'Usage',
	'settings.usage.kicker': 'Cloud mode',
	'settings.usage.left': 'answers left today on {model}',
	'settings.usage.resets': 'Resets at {time}',
	'settings.usage.current': 'Selected',
	'settings.review.title': 'Review before sending',
	'settings.review.desc':
		'Check the passages each time before they leave. Turn this off and remote answers send straight away.',
	'settings.tabs.account': 'Account',
	'settings.defaultMode.title': 'Default mode for new chats',
	'settings.deleteChats.title': 'Delete all chats',
	'settings.deleteChats.desc':
		'Removes every chat, its citations and its privacy history from this device. Documents stay in your library.',
	'settings.deleteChats.cta': 'Delete all chats',
	'settings.deleteChats.confirmTitle': 'Delete all chats?',
	'settings.myai.title': 'Your server',
	'settings.myai.connection': 'Connection',
	'settings.myai.model': 'Default model',
	'settings.models.benchTitle': 'Speed test',
	'settings.ai.use': 'Use this mode',
	'settings.ai.model.title': 'Local model',
	'settings.ai.download': 'Download',
	'settings.ai.load': 'Load',
	'settings.ai.status.ready': 'ready',
	'settings.ai.status.setup': 'to set up',
	'settings.ai.status.blocked': 'unavailable',
	'settings.ai.status.progress': 'preparing · {pct}%',
	'settings.ai.assisted.none': 'No account connected.',
	'settings.account.logoutAll': 'Log out of all devices',
	'settings.account.deleteTitle': 'Delete account',
	'settings.account.deleteDesc':
		'Removes your sign-in and quota data from the server. Your documents and chats never were there; they stay on this device.',
	'settings.account.deleteCta': 'Delete my account',
	'settings.account.deleteConfirm': 'Delete this account?',
	'settings.account.guest': 'No account. Sign in to unlock the Cloud mode.',
	'palette.themeLight': 'Theme: light',
	'palette.themeDark': 'Theme: dark',
	'palette.themeSystem': 'Theme: system',
	'palette.langEn': 'Language: English',
	'palette.langFr': 'Language: Français',
	'palette.navigate': 'navigate',
	'palette.open': 'open',
	'palette.close': 'close',
	'settings.appearance.title': 'Appearance',
	'settings.appearance.system': 'System',
	'settings.appearance.light': 'Light',
	'settings.appearance.dark': 'Dark',
	'settings.offline.title': 'Force offline',
	'settings.offline.label':
		'Block every outgoing request. Answering on this device and your documents keep working; the remote modes and sign-in are refused with a clear message.',
	'settings.offline.badge': 'Offline · nothing leaves this device',
	'settings.workspace.title': 'Workspace',
	'settings.workspace.exportDesc':
		'Export your documents, chats, citations and privacy history as a plain zip.',
	'settings.workspace.packing': 'Packing…',
	'settings.workspace.export': 'Export my workspace',
	'settings.workspace.quota': 'About {answers} answers left today',
	'settings.workspace.quotaSignIn': "Your daily allowance appears here once you're signed in.",
	'models.onDevice': 'Local model',
	'models.index': 'Document index model',
	'settings.models.title': 'Downloaded AI',
	'settings.models.measuring': 'Measuring…',
	'settings.models.none': 'Nothing downloaded yet.',
	'settings.models.files': '{count} files',
	'settings.models.delete': 'Delete',
	'settings.models.benchDesc': 'A short test measures how fast this device runs the local model.',
	'settings.models.testing': 'Testing…',
	'settings.models.test': 'Test my device',
	'settings.models.prepareFirst': 'Download the local model first, from the mode selector.',
	'settings.models.tps': '{tps} words a second',
	'settings.models.comfortable': 'this device answers comfortably on its own.',
	'settings.models.slow': 'this device is slow on its own; Cloud will feel much faster.',
	'settings.wipe.title': 'Delete everything',
	'settings.wipe.desc':
		'Erases every document, chat, search index and downloaded AI from this device. Nothing exists anywhere else, so this cannot be undone.',
	'settings.wipe.cta': 'Delete everything',
	'settings.wipe.last': 'Last confirmation',
	'settings.wipe.confirmTitle': 'Delete everything?',
	'settings.wipe.armedBody':
		'This permanently destroys every document, chat, index and downloaded AI stored in this browser. Nothing exists anywhere else. Really delete?',
	'settings.wipe.body':
		'Documents, chats, search indexes and downloaded AI will be erased from this browser. Your account survives; it holds no content.',
	'settings.wipe.erasing': 'Erasing…',
	'settings.wipe.confirm': 'Yes, erase it all',
	'settings.wipe.continue': 'Continue',

	// Privacy Report
	'privacy.title': 'Privacy report',
	'privacy.subtitle': "Everything that left this device, or didn't",
	'privacy.export': 'Export JSON',
	'privacy.nothing': 'Nothing has left this device.',
	'privacy.deviceSummary':
		'{count} answer{s} generated entirely on this device. 0 bytes sent anywhere.',
	'privacy.emptyBody':
		'Your documents, your indexes and your chats are all stored locally. This report fills up only if you choose a cloud mode.',
	'privacy.onDevice': 'On this device',
	'privacy.privateAnswers': '{count} answer{s} on this device',
	'privacy.leftDevice': 'Left this device',
	'privacy.inRequests': 'in {count} request{s}',
	'privacy.since': 'since {date}',
	'privacy.stayedHere': 'Stayed here',
	'privacy.answersHere': 'answers written on this device',
	'privacy.whereItWent': 'Where it went',
	'privacy.col.destination': 'Destination',
	'privacy.col.requests': 'Requests',
	'privacy.col.sent': 'Sent',
	'privacy.thisDevice': 'this device',
	'privacy.thisWeek': '{bytes} of that in the last seven days.',
	'privacy.journal': 'Every event',
	'privacy.event': '{count} passage{s} · {bytes} → {dest}',
	'privacy.errorTitle': "This report couldn't be loaded",
	'privacy.errorBody': 'Close any other tab with this app open, then try again.',

	// Landing
	'landing.nav.how': 'How it works',
	'landing.nav.guides': 'Guides',
	'landing.nav.github': 'GitHub',
	'landing.cta': 'Open the chat',
	'landing.cta.code': 'View the code',
	'landing.meta.title': 'Ask questions about your documents, in your browser',
	'landing.hero.title': 'Your documents have the answer.',
	'landing.hero.sub':
		'Ask a question and get a written answer that cites the exact passages it came from. Everything runs in your browser, and with the on-device model your files never leave your machine.',
	'landing.hero.facts': 'Free and open source. No account to start.',
	'landing.modes.title': 'Choose where the answer is written.',
	'landing.modes.sub':
		'Reading your documents and searching them happen in this browser. The three modes differ on one point: who writes the answer.',
	'landing.modes.private': 'A small model runs inside your browser tab.',
	'landing.modes.show': 'See this one',
	'landing.modes.showing': 'Showing',
	'landing.modes.private.cost': 'One download to start, and a slower answer.',
	'landing.modes.assisted': 'Sign in, and the answer is written online.',
	'landing.modes.assisted.cost': 'An account, and a daily allowance.',
	'landing.modes.myai': 'For an AI you already run yourself, like Ollama or LM Studio.',
	'landing.modes.myai.cost': 'A server you keep running.',
	'landing.cite.title': 'Every claim shows its source.',
	'landing.cite.sub':
		'Answers carry numbered citations. Click one and the document opens on the exact passage, highlighted.',
	'landing.oss.title': 'Open source, end to end',
	'landing.oss.sub':
		'The code is public, under the AGPL. Run it on your own domain, or help improve it.',
	'landing.oss.cta': 'Contribute on GitHub',
	'landing.cite.f1': 'Sources line up above the answer.',
	'landing.cite.f2': 'Delete a document and the passages it was quoted for stay.',
	'landing.cite.fig': 'Fig. 02 · An answer, its sources, and the lease open on the clause.',
	'landing.deck.title': 'Nothing leaves until you say so.',
	'landing.deck.sub':
		'The passages picked for your question line up first, and you untick what stays here. Afterwards the answer keeps the same list, each passage marked sent or stayed.',
	'landing.deck.before': 'Before it leaves',
	'landing.deck.after': 'The record it keeps',
	'landing.deck.intact': 'Nothing has left',
	'landing.deck.found': 'Found in your documents',
	'landing.deck.keep': 'You keep back',
	'landing.deck.ready': 'Ready to leave',
	'landing.deck.gone': 'Left this device',
	'landing.deck.stayed': 'Stayed here',
	'landing.deck.keptWith': 'Kept with the answer',
	'landing.deck.keptWithValue': 'As long as the chat',
	// The unit only. Every figure beside it is computed from the real payload.
	'landing.deck.kbUnit': 'KB',
	'landing.deck.bring': 'Bring {name} forward',
	'landing.deck.f1': 'Consent is asked once, the first time anything would leave.',
	'landing.deck.f2': 'The Privacy Report adds them all up.',

	// Privacy policy (/privacy). Required by Google to publish an OAuth consent
	// screen, and honest work regardless. Every claim here was read off the code:
	// the D1 schema, the assisted endpoint's log line, the absence of any
	// analytics dependency.
	'policy.title': 'Privacy',
	'policy.updated': 'Last updated 30 July 2026',
	'policy.intro':
		'This page says what this app does with your data, in the order that matters. The short version is that your documents never reach a server, and the long version is below.',

	'policy.device.title': 'Your documents stay on your device',
	'policy.device.body':
		'Files you add are read, indexed and searched inside your browser. The text, the index built from it, your questions, the answers and the file names are stored in this browser only. None of it is uploaded, and no server holds a copy. Turning off the network leaves the app working in the mode that answers on your device, which is the way to check this rather than take it on trust.',

	'policy.server.title': 'What the server knows',
	'policy.server.body':
		'There is one server, and it exists for accounts and quotas. When you sign in it stores your email address, a name if the sign-in method gave one, and session records. A session record includes the IP address and browser identification of the request that created it, which is how a stolen session can be told apart from yours. It also counts your daily use of the cloud answer mode: a number of requests and a usage figure. There is no table for documents, chats, messages, passages or file names, and adding one would break the guarantee above.',

	'policy.cloud.title': 'When you ask for a cloud answer',
	'policy.cloud.body':
		'Two of the three answer modes never contact this server. If you pick the cloud mode, your question and the passages you approved in the review step pass through the server to the model that writes the answer, and come back. They are not written to any database and not kept. What is written is a line of counters: how many passages, how many billing units, how long it took, how long the answer was, and the first characters of your account identifier. No question and no passage appears in it.',

	'policy.signin.title': 'Signing in',
	'policy.signin.body':
		'Only the cloud mode needs an account. A code arrives by email from mail.regeste.com, and the message contains no links. If you sign in with Google instead, Google learns that you use this app, and this app receives your email address, your name and your profile picture. Nothing more is requested.',

	'policy.models.title': 'The model download',
	'policy.models.body':
		'Answering on your device needs a model file, which is downloaded once and kept in this browser. It is fetched through this domain from a public model host, because the isolation the browser needs for that mode blocks the direct route. Only public model files travel that path.',

	'policy.tracking.title': 'No analytics',
	'policy.tracking.body':
		'There is no analytics service, no tracking script and no third-party code in this app. The emails carry no images, so nothing reports when you open one. The only cookie is the one that keeps you signed in.',

	'policy.delete.title': 'Deleting your data',
	'policy.delete.body':
		'Everything on your device is deleted from the app’s own settings, or by clearing this browser’s storage. Deleting your account removes your email address, your sessions and your usage counters from the server. Since the server never held a document, there is nothing else of yours to remove.',

	'policy.contact.title': 'Questions',
	'policy.contact.body': 'Write to us and we will answer.',
	'policy.source': 'The code behind every claim on this page is public.',
	'landing.footer.copyright': '© 2026 · AGPL-3.0',

	// How it works
	'hiw.title': 'How your data flows',
	'hiw.intro':
		'Your documents are read, indexed and searched in this browser. The modes differ on one point: who writes the answer, and so what has to leave.',
	'hiw.whatStays': 'What stays',
	'hiw.server': 'The server',
	'hiw.private.leaves': 'Nothing. The local model runs in your browser, downloaded once.',
	'hiw.private.stays': 'Documents, index, chats, the local model, your questions and answers.',
	'hiw.private.server': 'Never contacted for answering. No account needed.',
	'hiw.assisted.leaves':
		'Your question and the passages you approved in the review step. Never full documents, never file names.',
	'hiw.assisted.stays': 'Documents, index, chats. The passages you exclude.',
	'hiw.assisted.server':
		'Relays the passages to the AI and streams the answer back. Stores your email, plan and a usage counter. Never stores or logs content.',
	'hiw.myai.leaves':
		'Your question plus the relevant passages, sent straight to the AI server you configured.',
	'hiw.myai.stays': 'Documents, index, chats.',
	'hiw.myai.server': 'No server in between. Traffic goes from your browser to your AI server.',
	'hiw.step.document': 'Your document',
	'hiw.step.parsing': 'Reading',
	'hiw.step.chunking': 'Splitting',
	'hiw.step.embeddings': 'Encoding',
	'hiw.step.index': 'Local index',
	'hiw.step.question': 'Your question',
	'hiw.step.search': 'Local search',
	'hiw.step.passages': 'Top passages',
	'hiw.step.answer': 'Answer + citations',
	'hiw.boundaryIntact': 'Nothing crosses',
	'hiw.boundaryCrossed': 'What crosses',
	'hiw.frame': 'This browser',
	'hiw.lane.ingest': 'Adding a document',
	'hiw.lane.answer': 'Writing the answer',
	'hiw.zone.unused': 'Not used',
	'hiw.lane.ask': 'Asking a question',
	'hiw.proofTitle': 'Check it yourself',
	'hiw.proofBody':
		'Prepare the on-device model, then turn off Wi-Fi and ask again. Reading, search and the answer keep working.',
	'hiw.footer':
		'The code is open source. Inspect it, self-host it, or keep it on this device with the network off.',

	// Account. The sign-in copy moved to auth.* with the page itself.
	'account.signedInAs': 'Signed in as',
	'account.signOut': 'Sign out',

	// Toasts (layout + uploads)
	'toast.ready': '{name} is ready',
	'toast.failed': "{name} couldn't be added",
	'toast.failedGeneric': 'Something went wrong while indexing this file.',
	'toast.added': '{name} added to My documents',
	'toast.addedDesc': 'Available to every chat.',

	// Errors (stores + net)
	'error.offline': 'Offline mode is on. Nothing leaves this device.',
	'error.sendCode': 'Could not send the code',
	'error.invalidCode': 'Invalid code',

	// System notices, shown in the thread with their own styling
	'notice.retry': 'Retry',
	'notice.stopped': 'Generation stopped before an answer came through.',
	'notice.myaiUnreachable':
		'Your AI server is unreachable. Check that it is running, plus the URL and its CORS settings.',
	'notice.quota': "Today's allowance is spent. It comes back tomorrow.",
	'notice.signIn': 'Sign in to use the Cloud mode.',
	'notice.assistedDown': 'The Cloud service is unavailable right now.',
	'notice.assistedUnreachable': 'The Cloud service is unreachable. Check your connection.',

	// Exact document analytics
	'aggregate.ambiguous':
		'Several amount types match. Specify whether you need sent amounts, received amounts, fees, or debited totals.',
	'aggregate.ambiguousCalculation': 'Amount type required',
	'aggregate.none': 'No amount reliable enough to calculate was found in the selected documents.',
	'aggregate.noneCalculation': 'No amount retained',
	'aggregate.count': 'There are {count} matching record(s). {citations}',
	'aggregate.countCalculation': '{count} matching record(s)',
	'aggregate.list': 'The amounts are {values}.',
	'aggregate.sum': 'The sum is',
	'aggregate.overValues': 'across {count} values',
	'column.first': '{label}: {value}, on the first row of the table ({date}).',
	'column.last': '{label}: {value}, on the last row of the table ({date}).',
	'column.typical': '{label}: {value}, on {support} rows of the table.',
	'column.calculation': '{label}, read row by row across {considered} rows',
	'aggregate.average': 'The average is',
	'aggregate.minimum': 'The minimum is',
	'aggregate.maximum': 'The maximum is',
	'aggregate.excluded': '{count} ambiguous document(s) set aside.'
} as const;

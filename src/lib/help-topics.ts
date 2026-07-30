// Every environment this app can fail in, and what to do about each.
//
// It runs entirely in the browser, so the browser's own settings are part of
// its runtime: a private window, strict content blocking, a second tab, a VPN
// that intercepts downloads. Each of those produces a failure the app cannot
// fix, and the only useful thing it can do is say which one happened and what
// changes it.
//
// One list, used twice: the help page renders it, and every in-app failure
// deep-links to the entry that explains it. Keeping them in one place is what
// stops a message and its explanation drifting apart.

import type { MessageKey } from '$lib/i18n/index.svelte';

export interface HelpTopic {
	/** URL segment, and the id a failure links to. */
	id: string;
	/** Shown as a chip above the title, so the index reads as a library rather
	 * than a list of complaints. */
	kind: MessageKey;
	/** i18n keys. `fix` is a list of steps. */
	title: MessageKey;
	symptom: MessageKey;
	cause: MessageKey;
	fix: MessageKey[];
}

export const HELP_TOPICS: HelpTopic[] = [
	{
		id: 'model-storage',
		kind: 'help.kind.storage',
		title: 'help.modelStorage.title',
		symptom: 'help.modelStorage.symptom',
		cause: 'help.modelStorage.cause',
		fix: ['help.modelStorage.fix1', 'help.modelStorage.fix2', 'help.modelStorage.fix3']
	},
	{
		id: 'storage-blocked',
		kind: 'help.kind.storage',
		title: 'help.blocked.title',
		symptom: 'help.blocked.symptom',
		cause: 'help.blocked.cause',
		fix: ['help.blocked.fix1', 'help.blocked.fix2', 'help.blocked.fix3']
	},
	{
		id: 'two-tabs',
		kind: 'help.kind.storage',
		title: 'help.tabs.title',
		symptom: 'help.tabs.symptom',
		cause: 'help.tabs.cause',
		fix: ['help.tabs.fix1']
	},
	{
		id: 'eviction',
		kind: 'help.kind.storage',
		title: 'help.eviction.title',
		symptom: 'help.eviction.symptom',
		cause: 'help.eviction.cause',
		fix: ['help.eviction.fix1', 'help.eviction.fix2']
	},
	{
		id: 'no-webgpu',
		kind: 'help.kind.browser',
		title: 'help.gpu.title',
		symptom: 'help.gpu.symptom',
		cause: 'help.gpu.cause',
		fix: ['help.gpu.fix1', 'help.gpu.fix2']
	},
	{
		id: 'network',
		kind: 'help.kind.network',
		title: 'help.network.title',
		symptom: 'help.network.symptom',
		cause: 'help.network.cause',
		fix: ['help.network.fix1', 'help.network.fix2']
	}
];

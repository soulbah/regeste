// The last net: no failure may exist only in the console.
//
// Every known failure already has its own surface — the mode selector's blocked
// line, the document row's error status, the thread's notice, the worker-failure
// banner, the two database toasts. This module catches what none of them saw:
// the uncaught exception and the unhandled rejection, which today reach the
// console and stop there. A visitor does not read the console; for them the app
// just did nothing.
//
// Restraint is the design constraint. A funnel that toasts every hiccup teaches
// people to dismiss it, so: known-benign noise is dropped, each distinct message
// fires once per session, and the whole funnel says at most three things before
// going quiet. The toast leads to the report dialog, which is the one place a
// reader can do something useful with an error they cannot fix.

import { toast } from 'svelte-sonner';
import { t } from '$lib/i18n/index.svelte';
import { uiStore } from '$lib/state/ui.svelte';

const seen = new Set<string>();
const MAX_TOASTS = 3;

/** Noise with no user-facing consequence, silenced deliberately:
 * - ResizeObserver's loop warning is a browser artefact, not a failure.
 * - AbortError is the sound of a navigation or a cancelled fetch working.
 * - "script error." is a cross-origin stub carrying zero information.
 * - RenderingCancelledException is pdf.js discarding a superseded frame. */
const BENIGN =
	/ResizeObserver loop|AbortError|^script error\.?$|RenderingCancelledException|The user aborted/i;

function surface(message: string): void {
	if (BENIGN.test(message)) return;
	const key = message.slice(0, 120);
	if (seen.has(key) || seen.size >= MAX_TOASTS) return;
	seen.add(key);
	toast.error(t('app.unexpected'), {
		description: message.slice(0, 160),
		duration: 10_000,
		action: {
			label: t('report.title'),
			onClick: () => (uiStore.reportOpen = true)
		}
	});
}

/** Idempotent; the root layout installs it once in the browser. */
export function installErrorFunnel(): void {
	if ((window as { __regesteFunnel?: boolean }).__regesteFunnel) return;
	(window as { __regesteFunnel?: boolean }).__regesteFunnel = true;

	window.addEventListener('error', (event) => {
		surface(event.message || String(event.error ?? 'unknown error'));
	});
	window.addEventListener('unhandledrejection', (event) => {
		const reason = event.reason;
		surface(reason instanceof Error ? reason.message : String(reason ?? 'unhandled rejection'));
	});
}

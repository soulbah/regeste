<script lang="ts">
	// Two surfaces, because the two failures are not the same event. Losing the
	// database means nothing behind a dialog is reachable, so blocking costs the
	// user nothing and stops them typing into a page that will never answer.
	// Losing OCR or the private AI leaves an app that still reads and browses; a
	// modal there would be a false emergency, so it gets the banner the app
	// already uses for "persistent, one action" (update-banner.svelte).
	//
	// The dialog keeps a dismiss path on purpose. A single-button modal is only an
	// acceptable focus trap while that button really is the way out, and a reload
	// that lands on the same missing file would put the user straight back in it.
	// Dismissing falls through to the banner, so the failure stays visible.
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/index.svelte';
	import { workerHealth, type WorkerFeature } from '$lib/state/worker-health.svelte';

	// Explicit rather than interpolated: the dictionary key is a literal union, so
	// a template string would silently opt this out of the missing-key check.
	const LINE = {
		db: 'app.workerFailed.title',
		search: 'app.workerFailed.search',
		ocr: 'app.workerFailed.ocr',
		privateAi: 'app.workerFailed.privateAi'
	} as const satisfies Record<WorkerFeature, string>;

	let dismissed = $state(false);

	const failed = $derived(workerHealth.failed);
	const blocking = $derived(failed === 'db' && !dismissed);
	const line = $derived(failed ? LINE[failed] : null);

	function reload() {
		window.location.reload();
	}
</script>

<!-- Mounted empty and filled later: a live region inserted already populated is
	 not a content change, and most screen readers stay silent for it. -->
<p role="alert" class="sr-only">{line ? t(line) : ''}</p>

<AlertDialog.Root open={blocking} onOpenChange={(open) => !open && (dismissed = true)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{t('app.workerFailed.title')}</AlertDialog.Title>
			<AlertDialog.Description>{t('app.workerFailed.body')}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{t('app.workerFailed.dismiss')}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={reload}>{t('app.workerFailed.cta')}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

{#if failed && !blocking}
	<div
		class="bg-card fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-3 py-2 shadow-md"
	>
		<p class="text-xs">{line ? t(line) : ''}</p>
		<Button size="sm" onclick={reload}>{t('app.workerFailed.cta')}</Button>
	</div>
{/if}

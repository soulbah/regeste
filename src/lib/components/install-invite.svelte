<script lang="ts">
	// Spec 030 — offered once, dismissibly, at the moment a large download is
	// about to commit data to this device. Never on load, never a persistent
	// banner: web.dev's rule is to ask when critical data is being saved, in a
	// user gesture. On iOS this ordering is not cosmetic — an installed app has
	// a storage sandbox separate from Safari, so installing afterwards would
	// mean paying the download twice.
	import { Button } from '$lib/components/ui/button';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { t } from '$lib/i18n/index.svelte';
	import { pwaStore } from '$lib/state/pwa.svelte';

	let dismissed = $state(false);
	const show = $derived(!dismissed && pwaStore.shouldInviteInstall);
	/** No beforeinstallprompt outside Chromium: iOS/Safari get instructions. */
	const canPrompt = $derived(pwaStore.installAvailable);

	async function install() {
		const outcome = await pwaStore.promptInstall();
		if (outcome === 'accepted') return;
		dismiss();
	}

	function dismiss() {
		dismissed = true;
		pwaStore.dismissInvite();
	}
</script>

{#if show}
	<div class="bg-background/40 rounded-lg border p-4">
		<div class="flex items-start gap-2.5">
			<DownloadIcon class="text-muted-foreground mt-0.5 size-4 shrink-0" />
			<div class="min-w-0 flex-1 space-y-2">
				<p class="text-sm font-medium">{t('install.title')}</p>
				<p class="text-muted-foreground text-xs leading-relaxed">
					{canPrompt ? t('install.body') : t('install.bodyIos')}
				</p>
				<div class="flex items-center gap-2 pt-0.5">
					{#if canPrompt}
						<Button size="sm" onclick={install}>{t('install.cta')}</Button>
					{/if}
					<Button variant="ghost" size="sm" onclick={dismiss}>{t('install.dismiss')}</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

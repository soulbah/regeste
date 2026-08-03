<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { t, type MessageKey } from '$lib/i18n/index.svelte';
	import { performPanicWipe, type PanicWipePhase } from '$lib/panic-wipe';

	const PHASE_LINE = {
		stopping: 'settings.wipe.progress.stopping',
		clearing: 'settings.wipe.progress.clearing',
		finishing: 'settings.wipe.progress.finishing'
	} as const satisfies Record<PanicWipePhase, MessageKey>;

	let phase = $state<PanicWipePhase>('stopping');
	let failed = $state(false);
	let started = false;

	async function run() {
		failed = false;
		phase = 'stopping';
		try {
			await performPanicWipe((next) => (phase = next));
			window.location.replace(resolve('/chat'));
		} catch (error) {
			console.error('[regeste] local wipe failed:', error);
			failed = true;
		}
	}

	$effect(() => {
		if (started) return;
		started = true;
		void run();
	});
</script>

<main class="bg-background flex min-h-svh items-center justify-center p-6">
	<section class="w-full max-w-md" aria-live="polite" aria-busy={!failed}>
		<p class="font-display text-3xl tracking-tight">{t('settings.wipe.progress.title')}</p>
		<p class="text-muted-foreground mt-2 text-sm leading-relaxed">
			{failed ? t('settings.wipe.progress.failed') : t(PHASE_LINE[phase])}
		</p>

		{#if failed}
			<Button class="mt-6" onclick={run}>{t('settings.wipe.progress.retry')}</Button>
		{:else}
			<div class="bg-secondary mt-6 h-1 overflow-hidden rounded-full" aria-hidden="true">
				<div class="wipe-indicator bg-primary/70 h-full w-1/3 rounded-full"></div>
			</div>
		{/if}
	</section>
</main>

<style>
	.wipe-indicator {
		animation: wipe-progress 1.4s ease-in-out infinite;
	}

	@keyframes wipe-progress {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(400%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.wipe-indicator {
			width: 100%;
			opacity: 0.35;
			animation: none;
		}
	}
</style>

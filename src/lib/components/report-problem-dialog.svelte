<script lang="ts">
	// Reporting a problem, as a short brief rather than a bare mail link.
	//
	// Two reasons it is a dialog. First, mailto's documented failure is silence: a
	// visitor whose browser has no registered mail client clicks and nothing
	// happens, and someone who had decided to write does not try twice. Printed
	// here, the address survives that — it can be read and copied. Second, a
	// report that says "it does not work" costs a round trip to answer, and the
	// three things worth including take one line to ask for.
	//
	// Nothing is prefilled from the session. A report carrying a passage of
	// someone's document would be the one leak this product cannot afford, so the
	// subject is a constant and the body is left to the person writing it.
	import ClipboardIcon from '@lucide/svelte/icons/clipboard';
	import CheckIcon from '@lucide/svelte/icons/check';
	import MailIcon from '@lucide/svelte/icons/mail';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import GithubIcon from '$lib/components/github-icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { CONTACT_EMAIL, GITHUB } from '$lib/links';
	import { NEW_TAB } from '$lib/external-page';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const STEPS = ['report.step1', 'report.step2', 'report.step3'] as const;

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	async function copy() {
		try {
			await navigator.clipboard.writeText(CONTACT_EMAIL);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard permission refused. The address is on screen either way,
			// which is the whole reason it is printed rather than hidden in a href.
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{t('report.title')}</Dialog.Title>
			<Dialog.Description>{t('report.intro')}</Dialog.Description>
		</Dialog.Header>

		<!-- Numbered, because it is a sequence to follow and not a list of
		     features. Mono numerals keep them out of the reading line. -->
		<ol class="space-y-2.5">
			{#each STEPS as step, i (step)}
				<li class="flex gap-3 text-sm leading-relaxed">
					<span class="text-muted-foreground mt-px font-mono text-[11px] tabular-nums">
						0{i + 1}
					</span>
					<span class="flex-1">{t(step)}</span>
				</li>
			{/each}
		</ol>

		<div class="border-border bg-muted/40 flex items-center gap-2 rounded-md border p-2 pl-3">
			<span class="min-w-0 flex-1 truncate font-mono text-sm">{CONTACT_EMAIL}</span>
			<Button variant="ghost" size="sm" class="shrink-0 gap-1.5" onclick={copy}>
				{#if copied}
					<CheckIcon class="text-ring size-3.5!" />
					{t('report.copied')}
				{:else}
					<ClipboardIcon class="size-3.5!" />
					{t('report.copy')}
				{/if}
			</Button>
		</div>

		<Dialog.Footer class="sm:justify-between">
			<!-- For anyone who would rather file it in the open. Second, not first:
			     it needs an account, and most people reporting a problem do not have
			     one. -->
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground gap-1.5"
				href={`${GITHUB}/issues`}
				{...NEW_TAB}
			>
				<GithubIcon class="size-3.5" />
				{t('report.github')}
			</Button>
			<Button
				class="gap-1.5"
				href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('report.subject'))}`}
			>
				<MailIcon class="size-4!" />
				{t('report.write')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

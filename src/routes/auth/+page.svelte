<script lang="ts">
	// Signing in gets its own screen rather than a card inside the app.
	//
	// It is a detour with one job, and the app behind it is noise while you are
	// reading a six-digit code out of your inbox: the sidebar, the composer and
	// the document list all offer things you cannot do until this finishes. The
	// way back is one link, always present, because nothing here is mandatory —
	// This device and Your server never ask anyone to sign in.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import * as InputOTP from '$lib/components/ui/input-otp';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { t } from '$lib/i18n/index.svelte';
	import { sessionStore } from '$lib/state/session.svelte';

	let email = $state('');
	let otp = $state('');
	const emailValid = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()));

	async function requestCode(e: SubmitEvent) {
		e.preventDefault();
		if (emailValid) await sessionStore.sendCode(email.trim());
	}

	async function verify() {
		if (otp.length !== 6) return;
		const ok = await sessionStore.verifyCode(otp);
		if (ok) goto(resolve('/chat'));
		else otp = '';
	}

	$effect(() => {
		if (otp.length === 6) verify();
	});

	// Already signed in: nothing to do here.
	$effect(() => {
		if (!sessionStore.loading && sessionStore.user) goto(resolve('/chat'));
	});
</script>

<svelte:head><title>{t('auth.title')} · Regeste</title></svelte:head>

<div class="bg-background flex min-h-svh flex-col">
	<header class="flex h-14 shrink-0 items-center px-4">
		<Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" href={resolve('/chat')}>
			<ArrowLeftIcon class="size-3.5!" />
			{t('auth.back')}
		</Button>
	</header>

	<div class="flex flex-1 items-center justify-center px-6 pb-20">
		<div class="w-full max-w-sm">
			<div class="mb-8 text-center">
				<h1 class="font-display text-3xl tracking-tight">{t('auth.headline')}</h1>
				<p class="text-muted-foreground mt-2 text-sm leading-relaxed">{t('auth.body')}</p>
			</div>

			{#if sessionStore.otpSentTo}
				<div class="space-y-4 text-center">
					<p class="text-muted-foreground text-sm">
						{t('auth.codeSent', { email: sessionStore.otpSentTo ?? '' })}
					</p>
					<div class="flex justify-center">
						<InputOTP.Root maxlength={6} bind:value={otp}>
							{#snippet children({ cells })}
								<InputOTP.Group>
									{#each cells as cell (cell)}
										<InputOTP.Slot {cell} />
									{/each}
								</InputOTP.Group>
							{/snippet}
						</InputOTP.Root>
					</div>
					{#if sessionStore.error}
						<p class="text-destructive text-sm">{sessionStore.error}</p>
					{/if}
					<Button variant="ghost" size="sm" onclick={() => sessionStore.reset()}>
						{t('auth.changeEmail')}
					</Button>
				</div>
			{:else}
				<form class="space-y-3" onsubmit={requestCode}>
					<div class="space-y-1.5">
						<Label for="auth-email">{t('auth.email')}</Label>
						<Input
							id="auth-email"
							type="email"
							autocomplete="email"
							placeholder={t('auth.emailPlaceholder')}
							bind:value={email}
						/>
					</div>
					<!-- Disabled until the address is plausible, with the reason named:
					     the repo's rule for every state-blocked control. -->
					<Tooltip.Provider delayDuration={300}>
						<Tooltip.Root>
							<Tooltip.Trigger class="block w-full">
								<Button type="submit" class="w-full" disabled={!emailValid || sessionStore.sending}>
									{sessionStore.sending ? t('auth.sending') : t('auth.continue')}
								</Button>
							</Tooltip.Trigger>
							{#if !emailValid}
								<Tooltip.Content>{t('disabled.needEmail')}</Tooltip.Content>
							{/if}
						</Tooltip.Root>
					</Tooltip.Provider>
					{#if sessionStore.error}
						<p class="text-destructive text-sm">{sessionStore.error}</p>
					{/if}
				</form>

				<div class="my-6 flex items-center gap-3">
					<Separator class="flex-1" />
					<span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
						{t('auth.or')}
					</span>
					<Separator class="flex-1" />
				</div>

				<!-- Shown disabled rather than hidden: the two providers are coming,
				     and a screen that grows new sign-in methods later is worse than
				     one that says now what it will offer. Each names why it is off. -->
				<div class="space-y-2">
					<Tooltip.Provider delayDuration={300}>
						{#each [{ id: 'google', label: 'Google' }, { id: 'github', label: 'GitHub' }] as provider (provider.id)}
							<Tooltip.Root>
								<Tooltip.Trigger class="block w-full">
									<Button variant="outline" class="w-full" disabled>
										{t('auth.continueWith', { provider: provider.label })}
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>{t('auth.providerSoon')}</Tooltip.Content>
							</Tooltip.Root>
						{/each}
					</Tooltip.Provider>
				</div>
			{/if}

			<p class="text-muted-foreground/70 mt-8 text-center text-xs leading-relaxed">
				{t('auth.footnote')}
			</p>
		</div>
	</div>
</div>

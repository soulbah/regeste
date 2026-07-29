<script lang="ts">
	// Signing in gets its own screen, outside the (app) group, so none of the
	// application's chrome comes with it. A sidebar behind a sign-in form offers
	// a dozen things you cannot do until the form is finished.
	//
	// The composition is one column on an otherwise empty page: wordmark, one
	// sentence, the field. The only ornament is a soft radial wash behind the
	// card, which is what keeps the screen from reading as an error page — the
	// rest of the identity (serif display, mono kicker, single green accent) is
	// the app's own, unchanged, because this is a door into it and not a
	// different product.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import AmbientWash from '$lib/components/ambient-wash.svelte';
	import BrandMark from '$lib/components/brand-mark.svelte';
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

	// Already signed in: there is nothing to do on this page.
	$effect(() => {
		if (!sessionStore.loading && sessionStore.user) goto(resolve('/chat'));
	});

	const PROVIDERS = [
		{ id: 'google', label: 'Google' },
		{ id: 'github', label: 'GitHub' }
	] as const;
</script>

<svelte:head><title>{t('auth.title')} · Regeste</title></svelte:head>

<div class="bg-background relative flex min-h-svh flex-col overflow-hidden">
	<AmbientWash />

	<header class="relative flex h-14 shrink-0 items-center px-4">
		<Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" href={resolve('/chat')}>
			<ArrowLeftIcon class="size-3.5!" />
			{t('auth.back')}
		</Button>
	</header>

	<div class="relative flex flex-1 items-center justify-center px-6 pb-24">
		<div class="w-full max-w-[22rem]">
			<div class="mb-9 text-center">
				<!-- The mark, door-size: on a dedicated sign-in screen the brand is
				     the landmark (Linear, Notion, Claude all set a ~40px mark over
				     the heading). The name stays in the tab title; a second serif
				     line above the serif heading would compete with it. -->
				<div class="mb-7 flex justify-center">
					<BrandMark size={44} />
				</div>
				<h1 class="font-display text-[1.75rem] leading-tight tracking-tight text-balance">
					{sessionStore.otpSentTo ? t('auth.checkInbox') : t('auth.headline')}
				</h1>
				<p class="text-muted-foreground mt-2.5 text-sm leading-relaxed text-balance">
					{sessionStore.otpSentTo
						? t('auth.codeSent', { email: sessionStore.otpSentTo })
						: t('auth.body')}
				</p>
			</div>

			{#if sessionStore.otpSentTo}
				<div class="space-y-5">
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
						<p class="text-destructive text-center text-sm">{sessionStore.error}</p>
					{/if}
					<Button
						variant="ghost"
						size="sm"
						class="text-muted-foreground w-full"
						onclick={() => {
							otp = '';
							sessionStore.reset();
						}}
					>
						{t('auth.changeEmail')}
					</Button>
				</div>
			{:else}
				<form class="space-y-3.5" onsubmit={requestCode}>
					<div class="space-y-2">
						<Label for="auth-email" class="text-xs">{t('auth.email')}</Label>
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

				<!-- Shown disabled rather than hidden: a sign-in screen that grows new
				     methods later is worse than one that says now what it will offer,
				     and each names why it is off. -->
				<div class="space-y-2">
					<Tooltip.Provider delayDuration={300}>
						{#each PROVIDERS as provider (provider.id)}
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

			<p class="text-muted-foreground mt-9 text-center text-xs leading-relaxed text-balance">
				{t('auth.footnote')}
			</p>
		</div>
	</div>
</div>

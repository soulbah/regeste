<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as InputOTP from '$lib/components/ui/input-otp';
	import { t } from '$lib/i18n/index.svelte';
	import { sessionStore } from '$lib/state/session.svelte';

	let email = $state('');
	let otp = $state('');

	async function requestCode(e: SubmitEvent) {
		e.preventDefault();
		if (email.includes('@')) await sessionStore.sendCode(email.trim());
	}

	async function verify() {
		if (otp.length !== 6) return;
		const ok = await sessionStore.verifyCode(otp);
		if (ok) goto(resolve('/'));
		else otp = '';
	}

	$effect(() => {
		if (otp.length === 6) verify();
	});
</script>

<svelte:head><title>Account · Folio</title></svelte:head>

<div class="flex h-svh flex-col items-center justify-center gap-8 px-6">
	<div class="max-w-sm text-center">
		<p class="text-muted-foreground mb-3 font-mono text-[10px] tracking-[0.25em] uppercase">
			{t('account.kicker')}
		</p>
		<h1 class="font-display text-3xl tracking-tight">{t('account.headline')}</h1>
		<p class="text-muted-foreground mt-3 text-sm leading-relaxed">
			{t('account.body')}
		</p>
	</div>

	{#if sessionStore.user}
		<Card.Root class="w-full max-w-sm">
			<Card.Content class="space-y-4 pt-6 text-center">
				<p class="text-sm">
					{t('account.signedInAs')} <span class="font-medium">{sessionStore.user.email}</span>
				</p>
				<Button variant="outline" onclick={() => sessionStore.signOut()}>
					{t('account.signOut')}
				</Button>
			</Card.Content>
		</Card.Root>
	{:else if sessionStore.otpSentTo}
		<Card.Root class="w-full max-w-sm">
			<Card.Content class="space-y-5 pt-6">
				<div class="space-y-1 text-center">
					<p class="text-sm font-medium">{t('account.enterCode')}</p>
					<p class="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
						{t('account.sentTo', { email: sessionStore.otpSentTo })}
					</p>
				</div>
				<div class="flex justify-center">
					<InputOTP.Root maxlength={6} bind:value={otp}>
						{#snippet children({ cells })}
							<InputOTP.Group>
								{#each cells.slice(0, 3) as cell (cell)}
									<InputOTP.Slot {cell} />
								{/each}
							</InputOTP.Group>
							<InputOTP.Separator />
							<InputOTP.Group>
								{#each cells.slice(3, 6) as cell (cell)}
									<InputOTP.Slot {cell} />
								{/each}
							</InputOTP.Group>
						{/snippet}
					</InputOTP.Root>
				</div>
				{#if sessionStore.error}
					<p class="text-destructive text-center text-sm">{sessionStore.error}</p>
				{/if}
				<div class="flex justify-center gap-2">
					<Button variant="ghost" size="sm" onclick={() => sessionStore.reset()}>
						{t('account.otherAddress')}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						disabled={sessionStore.sending}
						onclick={() => sessionStore.sendCode(sessionStore.otpSentTo!)}
					>
						{t('account.resend')}
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root class="w-full max-w-sm">
			<Card.Content class="pt-6">
				<form class="space-y-4" onsubmit={requestCode}>
					<div class="space-y-1.5">
						<Label for="email">{t('account.email')}</Label>
						<Input
							id="email"
							type="email"
							bind:value={email}
							placeholder="you@example.com"
							autocomplete="email"
						/>
					</div>
					{#if sessionStore.error}
						<p class="text-destructive text-sm">{sessionStore.error}</p>
					{/if}
					<Button
						class="w-full"
						type="submit"
						disabled={sessionStore.sending || !email.includes('@')}
					>
						{sessionStore.sending ? t('account.sending') : t('account.sendCode')}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<p class="text-muted-foreground font-mono text-[10px] tracking-[0.25em] uppercase">
		{t('account.filesLocal')}
	</p>
</div>

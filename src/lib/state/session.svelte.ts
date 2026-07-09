// Session state around the better-auth svelte client. Signing in never
// uploads any local data — identity only (PRD §9). OTP-only flow:
// request a code, verify it; unknown emails are registered automatically.

import { authClient } from '$lib/auth-client';

interface SessionUser {
	id: string;
	email: string;
	name: string;
}

class SessionStore {
	user = $state<SessionUser | null>(null);
	loading = $state(true);
	error = $state<string | null>(null);
	/** Email a code was just sent to (drives the two-step account UI). */
	otpSentTo = $state<string | null>(null);
	sending = $state(false);

	async refresh(): Promise<void> {
		try {
			const { data } = await authClient.getSession();
			this.user = data?.user
				? { id: data.user.id, email: data.user.email, name: data.user.name }
				: null;
		} finally {
			this.loading = false;
		}
	}

	async sendCode(email: string): Promise<void> {
		this.error = null;
		this.sending = true;
		try {
			const { error } = await authClient.emailOtp.sendVerificationOtp({
				email,
				type: 'sign-in'
			});
			if (error) {
				this.error = error.message ?? 'Could not send the code';
				return;
			}
			this.otpSentTo = email;
		} finally {
			this.sending = false;
		}
	}

	async verifyCode(otp: string): Promise<boolean> {
		if (!this.otpSentTo) return false;
		this.error = null;
		this.sending = true;
		try {
			const { error } = await authClient.signIn.emailOtp({ email: this.otpSentTo, otp });
			if (error) {
				this.error = error.message ?? 'Invalid code';
				return false;
			}
			this.otpSentTo = null;
			await this.refresh();
			return true;
		} finally {
			this.sending = false;
		}
	}

	reset(): void {
		this.otpSentTo = null;
		this.error = null;
	}

	async signOut(): Promise<void> {
		await authClient.signOut();
		this.user = null;
	}
}

export const sessionStore = new SessionStore();

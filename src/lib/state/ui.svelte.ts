// Small cross-cutting UI state (spec 021): the settings modal is opened from
// the account menu, the command palette and anywhere else that needs it.
// Spec 022 adds deep-linking (tab + mode card) and the pending-activation
// handshake between the Settings AI cards and the composer's mode selector.

import type { ChatMode } from '$lib/types';

export type SettingsTab = 'general' | 'data' | 'ai' | 'account';

class UiStore {
	settingsOpen = $state(false);
	settingsTab = $state<SettingsTab>('general');
	/** Mode card to scroll to / focus when the AI tab opens. */
	settingsFocus = $state<ChatMode | null>(null);
	/**
	 * Mode the user asked for before it was ready: the selector watches its
	 * readiness and activates it the moment setup completes.
	 */
	pendingActivation = $state<ChatMode | null>(null);
	/** Set by "Use this mode" on a ready card; consumed by the selector. */
	requestedMode = $state<ChatMode | null>(null);

	openSettings(tab: SettingsTab = 'general', focus: ChatMode | null = null): void {
		this.settingsTab = tab;
		this.settingsFocus = focus;
		this.settingsOpen = true;
	}
}

export const uiStore = new UiStore();

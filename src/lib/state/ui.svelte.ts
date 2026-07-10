// Small cross-cutting UI state (spec 021): the settings modal is opened from
// the account menu, the command palette and anywhere else that needs it.

class UiStore {
	settingsOpen = $state(false);

	openSettings(): void {
		this.settingsOpen = true;
	}
}

export const uiStore = new UiStore();

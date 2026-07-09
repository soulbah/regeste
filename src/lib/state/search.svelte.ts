// ⌘K palette open state (spec 008) — shared by the sidebar button, the global
// shortcut and the palette itself.

class SearchStore {
	open = $state(false);

	toggle(): void {
		this.open = !this.open;
	}
}

export const searchStore = new SearchStore();

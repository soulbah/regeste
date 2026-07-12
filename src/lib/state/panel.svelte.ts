// Shared contextual-panel state. The panel (a resizable, collapsible right pane
// on lg+, a Sheet below) is layout infrastructure, not a chat feature — any route
// can host content in it via <PanelShell>. When a shell is mounted it flips
// `usingShell`, and the layout drops its single inset card so the conversation/
// list and the panel float as their own cards on the workspace.
class PanelStore {
	usingShell = $state(false);
}

export const panelStore = new PanelStore();

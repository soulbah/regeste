# Spec 021 — Account menu, settings modal, 3-tab sidebar, ⌘K v2

Owner validated the research report (artifact "Sidebar, réglages et ⌘K", 2026-07-11) and delegated the three arbitrations: chat archiving goes to its own future spec; the ⌘K selected row gets the 3px green accent bar; "How it works" joins the account menu.

## What

Sidebar:

- WHEN the sidebar renders THEN the fixed header nav SHALL hold exactly New chat, Search (⌘K), Documents; only the history scrolls; Settings and Privacy Report leave the nav.

Account menu (bottom of sidebar):

- WHEN the user clicks the footer element (avatar + name + plan/email + chevrons-up-down; avatar alone in the rail) THEN a dropdown SHALL open with: header (email or Guest · Local workspace), Appearance ▸ (Light/Dark/System inline, check on active), Language ▸ (EN/FR), separator, Privacy Report, How it works, separator, Settings (opens the modal), Sign in OR Sign out.

Settings modal (replaces the /chat/settings page):

- WHEN Settings opens THEN a modal with a left tab rail SHALL show four tabs:
  General (appearance, language, reading font default/dyslexia-friendly, default mode for new chats),
  Data (storage + persistence, export zip, force offline, delete all chats, delete everything),
  AI (local models + benchmark, Assisted quota, My AI endpoint config — the composer popover keeps its shortcut),
  Account (email/OTP sign-in, log out of all devices, delete account — honest copy: the server only ever held auth and quota).
- "Shared this week" moves to the Privacy Report page.
- New settings persist locally (default mode applies to newly created chats; reading font applies to answer prose).

⌘K v2 (cmdk-sourced metrics):

- Dialog 640px wide, radius 12, overlay blur; input 17px/h-14 borderless with bottom hairline; items 44-48px, px-3, rounded-lg, muted icons, kbd hints right; selected = filled row + 3px green accent bar left; list p-2 gutter, max-h ~360; 40px footer bar with ↑↓ / ↵ / esc kbd hints; group labels 12px sentence case.
- Commands grow: new chat, documents, privacy report, settings, theme light/dark/system, language EN/FR.

## Out of scope

- Chat archiving (archive/unarchive/archived view) → future spec.
- Anything mobile (owner: desktop focus).

## Verification

- `bun run verify` green; account menu drives theme/language live; Settings modal covers every setting the old page had (page deleted, route redirects); default mode honored on a new chat; delete-all-chats works with confirm; ⌘K matches the metrics (measure input/item/footer heights) and runs the new commands; FR+EN sweep.

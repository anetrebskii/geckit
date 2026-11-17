# Feature Specification: Sidebar navigation

**Feature Branch**: `feat/sidebar-navigation`

**Created**: 2026-11-16

**Status**: Implemented locally; unit tests pass; rendered review pending

**Input**: User description: "Sidebar navigation for GeckIt's Chat window and a left menu on the phone, as approved in docs/ux/sidebar-navigation.md (prototypes docs/design/sidebar-navigation.html and docs/design/sidebar-navigation-phone.html)."

The behavior, states and exact wording are decided in [docs/ux/sidebar-navigation.md](../../docs/ux/sidebar-navigation.md), approved by Alex on 2026-11-16, with its phone section approved the same day. This spec states what must hold; the UX document is the source for every label and message.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Move between GeckIt's places from a sidebar (Priority: P1)

A person opens the Chat window and sees a sidebar on the left listing what GeckIt holds: Tasks, Manager and Questions; a Workspace group with Team, Shortcuts, Checklists, Browsers and Secrets; a Computers group with This computer, each GeckIt computer this one is paired with, "Connect computer" and "Manage computers"; and Settings at the bottom. Choosing an item shows that place in the rest of the window. Choosing Tasks brings back the board exactly as it was left. The window reopens on the last place shown.

**Why this priority**: today every place except the board hangs off the board's bar as an icon or a dialog, so a person cannot see what GeckIt contains, where they are, or how to get back. This story alone delivers the new layout.

**Independent Test**: open the Chat window, choose each sidebar item in turn and check that its place fills the content area and the item is marked as current; return to Tasks and check the board's view, filters, scroll and open conversation are unchanged; close and reopen the window and check it opens on the last place.

**Acceptance Scenarios**:

1. **Given** the first start after the update, **When** the Chat window opens, **Then** the sidebar shows with Tasks chosen and the board as before.
2. **Given** Tasks is shown with a conversation open and a draft typed, **When** the person chooses Team and then Tasks, **Then** the same conversation is open with the same draft and scroll.
3. **Given** Manager was the last place shown, **When** the window is opened again, **Then** Manager is shown.
4. **Given** the kept place is one an earlier build saved and this one does not have, such as a host page, **When** the window opens, **Then** Tasks is shown.
5. **Given** two conversations wait for the person, **When** the sidebar is drawn, **Then** Tasks carries the count 2, read aloud as "2 conversations waiting for you".
6. **Given** any place, **When** the person presses a keyboard shortcut that used to open a dialog (Settings, Shortcuts, a new question, a new task, the switcher), **Then** the matching place is shown and the action happens there.

---

### User Story 2 - A board bar that holds only the board's controls (Priority: P1)

With the places in the sidebar, the board's top bar keeps Board/List, Filters, Search and New task. Shortcuts, Team, Manager, the gecko, Settings and Questions leave it, and the status bar no longer carries Manager.

**Why this priority**: it is the same change seen from the board; the sidebar without it would show every place twice.

**Independent Test**: show Tasks and check the bar holds only Board/List, Filters, Search and New task; check every removed control is reachable from the sidebar.

**Acceptance Scenarios**:

1. **Given** Tasks is shown, **When** the person looks at the bar, **Then** no Shortcuts, Team, Manager, gecko, Settings or Questions control is in it.
2. **Given** the gecko is hidden, **When** the sidebar is drawn, **Then** its footer offers "Show the gecko".

---

### User Story 3 - A sidebar that folds on a narrow window (Priority: P2)

On a window narrower than 884 px the sidebar shows icons only. The person can hide or show the names with a button at the top of the sidebar or with Cmd+Ctrl+S on macOS (Ctrl+Alt+S on Windows and Linux); on a narrow window the names open over the content without moving it, and close when a place is chosen or the content is clicked. A hidden-names choice is kept.

**Why this priority**: the window is often placed beside an editor; without folding, the sidebar would squeeze the conversation below its narrowest usable width.

**Independent Test**: narrow the window below 884 px and check icons with tooltips; press the key and check names open over the content; choose a place and check they close; widen the window, hide the names and reopen it.

**Acceptance Scenarios**:

1. **Given** a window 820 px wide, **When** the sidebar is drawn, **Then** it shows icons, each with its name as a tooltip and accessible name, and saved computers as two-letter monograms.
2. **Given** a wide window, **When** the person presses Cmd+Ctrl+S, **Then** the names hide, and the choice holds after the window is reopened.

---

### User Story 4 - The phone's left menu (Priority: P2)

On the phone the tab bar is replaced by a left menu holding the same places, opened from a Menu button at the start of each top-level page's bar. The Menu button carries a dot while a conversation waits and Tasks is not shown (amber) or while a question has an unread answer and Questions is not shown (accent). Search moves into the Tasks bar, the Manager row leaves the board, and Settings gains a Channels group with each channel's switch.

**Why this priority**: the phone shows the same Chat; the same places must be reachable there, but the desktop sidebar does not fit a phone.

**Independent Test**: on the phone, press Menu, choose each place and check it shows with a Menu button in its bar; leave a conversation waiting while on Settings and check the Menu button's dot and its spoken name.

**Acceptance Scenarios**:

1. **Given** the phone shows Settings and a conversation waits, **When** the person looks at the Menu button, **Then** it carries an amber dot and is read as "Menu, a conversation is waiting for you".
2. **Given** the menu is open, **When** the person chooses Secrets, **Then** the menu closes and the Secrets page is shown with the list of secrets.
3. **Given** Tasks is shown, **When** the person presses Search, **Then** the search page opens with Back to Tasks.
4. **Given** Settings is shown and Telegram is set up, **When** the person turns its switch off, **Then** the channel stops and its row says Off.

---

### Edge Cases

- A place kept by an earlier build that no longer exists: the window opens on Tasks.
- No saved computers: the Computers group shows "This computer" and "Connect computer".
- Many computers: the middle of the sidebar scrolls; the footer stays in place.
- A question is asked from the Questions page: the form opens over that page.
- More than 99 conversations wait: the count reads "99+".
- A channel not set up on the phone: its switch is disabled and the row says "Set up on the computer".
- Adding a secret on the phone: refused with "Manage secrets on the computer.", since its value is sealed on the computer's page.
- The phone link drops while a place is shown: the place keeps its last state, as the board does today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Chat window on desktop MUST show a sidebar with the groups and items listed in User Story 1, in that order, with Settings apart at the bottom.
- **FR-002**: Choosing an item MUST show its place in the content area and mark the item as current, visually and for assistive technology.
- **FR-003**: Returning to Tasks MUST show the board in the state it was left: view, filters, scroll, open conversation and drafts.
- **FR-004**: The place shown MUST be kept across restarts, and MUST fall back to Tasks when the kept place no longer exists.
- **FR-005**: Tasks MUST show the number of conversations waiting for the person, held to "99+", with the spoken form "N conversation(s) waiting for you".
- **FR-006**: Manager, Team, Shortcuts, Checklists, Browsers, Secrets and Settings MUST be pages in the content area rather than dialogs or overlays, and MUST NOT close on Escape or on a click outside them.
- **FR-007**: Settings MUST no longer contain Checklists, Browsers (formerly "Web Browser") or Secrets; Hosts (reached over SSH) MUST stay in Settings.
- **FR-008**: The board's top bar MUST keep only Board/List, Filters, Search, New task; the computer selector moves to the Computers group; the status bar MUST NOT show Manager.
- **FR-009**: Every keyboard shortcut that opened a moved dialog MUST open its place instead.
- **FR-010**: Below a window width of 884 px the sidebar MUST show icons only; the names key (Cmd+Ctrl+S on macOS, Ctrl+Alt+S elsewhere) and the button MUST show or hide the names, over the content on a narrow window; a choice to hide them MUST be kept.
- **FR-011**: In the icon-only sidebar each saved computer MUST be shown as a two-letter monogram of its name, and each item MUST have its name as tooltip and accessible name.
- **FR-012**: On the phone the tab bar MUST be replaced by a left menu holding Tasks, Manager, Questions, the Workspace group and Settings, opened from a Menu button at the start of each top-level page's bar; the phone MUST NOT list computers in it.
- **FR-013**: The phone's Menu button MUST carry an amber dot while a conversation waits and Tasks is not shown, otherwise an accent dot while a question has an unread answer and Questions is not shown, with the accessible names from the UX document.
- **FR-014**: The phone's Tasks bar MUST offer Search where Shortcuts was, and the board MUST NOT show a Manager row.
- **FR-015**: Phone Settings MUST show a Channels group with each channel's name, state and an on/off switch; setting a channel up MUST remain on the computer.
- **FR-016**: The phone MUST list secrets, show their history and remove them; it MUST NOT receive a secret's value.
- **FR-017**: All copy MUST read the same on macOS, Windows and Linux and use the UX document's wording verbatim.

### Key Entities

- **Place**: what the Chat window shows; one of Tasks, Manager, Questions, Team, Shortcuts, Checklists, Browsers, Secrets or Settings. Kept in the person's settings on desktop and on the phone itself.
- **Names shown**: the person's choice to show or hide the sidebar's names on a wide window. Kept in the person's settings.
- **Waiting conversation**: a conversation, not a general question, that waits for the person; counted on Tasks and on the phone's Menu button.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every place GeckIt holds is reachable in one click (desktop) or two taps (phone) from any other place.
- **SC-002**: Returning to Tasks after visiting any other place restores the board with no lost draft, scroll position or open conversation in 100% of tries.
- **SC-003**: At a window width of 820 px the conversation keeps at least its narrowest usable width of 420 px with the sidebar shown.
- **SC-004**: A person told to find Secrets, Browsers or Checklists finds it without opening Settings on the first try (the failure Alex hit twice in the earlier prototype).
- **SC-005**: Every item, count and dot has a spoken name; no state is shown by colour alone.

## Assumptions

- The Computers group is the board bar's computer selector, moved: This computer, the GeckIt computers paired over GeckIt's own link, Connect computer and Manage computers. Choosing a computer shows its workspace as the selector did. Hosts reached over SSH stay in Settings (corrected by Alex on 2026-11-16).
- Opening a question from the Questions page shows it on Tasks in the conversation pane, rather than in a pane on the Questions page.
- "Connect computer" and "Manage computers" open today's dialogs over Tasks.
- The phone keeps its place on the phone, as it kept its tab.
- Adding a secret and setting up a channel stay on the computer, where values and tokens are typed.

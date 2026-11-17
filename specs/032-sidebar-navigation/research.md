# Research: Sidebar navigation

No item in the Technical Context was left unknown. These are the decisions made while planning, with what was weighed.

## R1. How a place is shown

- Decision: the board stays mounted; any other place is drawn over it in the content area, and the board's parts are made inert while covered.
- Rationale: FR-003 requires returning to the exact board state, including unsent drafts held in component state.
- Alternatives considered: routing that unmounts the board (loses drafts); hiding the board with `display: none` (loses scroll positions in some lists and re-measures virtualized rows).

## R2. Where the place is kept

- Decision: `chatPlace` and `navNames` in the service-owned settings; the phone keeps its own place on the phone.
- Rationale: the constitution keeps settings out of renderer storage; the phone's place is per device, and the phone already kept its tab the same way.
- Alternatives considered: one shared place for desktop and phone (the phone has no Computers places, and following the computer would move the phone under the person).

## R3. Reusing existing screens as pages

- Decision: Team, ShortcutList and Hosts gain a page mode (no close on Escape or outside click, no Done or Back button); settings sections are rendered through an extracted `SectionBody`.
- Rationale: one implementation of each screen; the dialog forms stay available where still used (the phone's Team overlay path, shortcut editing from a conversation).
- Alternatives considered: new page components (duplicated logic that would drift).

## R4. The phone's Secrets and Channels

- Decision: the phone may list secrets, read their history and remove them, and turn a channel on or off. Adding a secret and setting a channel up stay on the computer.
- Rationale: the phone is a paired controller of the same service; names and history carry no secret value, which never leaves the broker. Typing a value or a token needs the computer's sealed page.
- Alternatives considered: leaving both computer-only (the approved phone design shows them in the menu and Settings).

## R5. The remote GeckIt computer selector

- Decision: it becomes the Computers group: This computer, each saved GeckIt computer, Connect computer and Manage computers; SSH hosts go back to Settings, Hosts. Decided by Alex on 2026-11-16.
- Rationale: choosing a computer shows its whole workspace, which is a place; an SSH host is set up once and its conversations are already on this computer's board.
- Alternatives considered: SSH hosts in the group (the first build; Alex called it a mistake); the selector kept in the bar.

## R6. Tests that failed only on some machines

- Decision: `recurrence.test.ts` counts formatting in a zone other than the computer's own; `product-rpc.test.ts` also clears `CLAUDE_CODE_SESSION_ID`.
- Rationale: both failed on the base commit on a computer in America/New_York running inside Claude Code; neither failure was in the code they test.

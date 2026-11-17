# Sidebar navigation in Chat and the phone's left menu

- Request: implement the approved sidebar navigation (docs/ux/sidebar-navigation.md, prototypes docs/design/sidebar-navigation.html and docs/design/sidebar-navigation-phone.html); goal "Code written & unit tests pass". Day-plan task in /Users/alex/Projects/mine/my-workspace/tasks/2026-11-16.md.
- Checkout: /Users/alex/Projects/mine/geckit-sidebar, branch feat/sidebar-navigation (worktree), nothing committed
- Started: 2026-11-16
- Spec Kit: specs/032-sidebar-navigation/ (spec, design, plan, research, data model, contracts, quickstart, tasks)

## Acceptance conditions

- Desktop Chat window -> a left sidebar with Tasks (waiting count), Manager, Questions, Workspace (Team, Shortcuts, Checklists, Browsers, Secrets), Computers (each host, Add computer) and Settings at the bottom; pressing an item shows that place and the choice is kept in `chatPlace`.
- Window narrower than 884 px -> the sidebar folds to icons; Cmd+Ctrl+S (Ctrl+Alt+S elsewhere) shows or hides the names, over the content below 884 px.
- Board top bar -> Views, Filters, Search, New task (and, for now, the remote GeckIt computer selector).
- Phone -> no tab bar; a Menu button at the start of each top-level page's bar opens a 300 pt left menu with the same places and Settings at the bottom; the button carries an amber dot while a conversation waits and Tasks is not shown, an accent dot while an answer is unread and Questions is not shown.
- Phone Tasks bar -> Search in place of Shortcuts; no Manager row on the board.
- Phone Settings -> a Channels group with each channel's switch; Team, Shortcuts and Browsers moved to the menu.
- Assumption: the phone keeps its place in the web view's localStorage (`phonePlace`), as the tab was kept.
- Unknown: where the remote GeckIt computer selector (Servers) goes; the approved design folds "the computer selector" into the Computers group, which lists SSH hosts only. Alex decides.

## Progress

### 1. Prepare the UX document

- [x] Done
- Evidence: docs/ux/sidebar-navigation.md, approved by Alex 2026-11-16, phone section approved 2026-11-16; implementation notes added in "Implementation notes".

### 2. Prepare the UI and test it

- [x] Done
- Evidence: prototypes docs/design/sidebar-navigation.html and docs/design/sidebar-navigation-phone.html, reviewed in a browser in light and dark themes and approved.

### 3. Write the feature code

- [x] Done
- Evidence: `npm run typecheck` clean; eslint clean on every changed file (the repository-wide lint reports only the existing .cjs script issues).

### 4. Update the related distributed skills

- [x] Not applicable: no file in skills/ or profiles/ describes the board's top bar or the phone's tabs (searched for top bar, board head, tab bar, Questions tab, Settings tab).

### 5. Update the feature list

- [ ] Pending Alex's approval of the proposed entry.

### 6. Write unit tests

- [x] Done
- Evidence: test/places.test.ts (kept place, fold width, waiting count and wording, the names key, menu dot and its spoken name, host monogram), 12 tests pass; test/board-groups.test.ts updated. Full suite: 2054 passed, 0 failed, 23 skipped. The 3 tests that also failed on the base commit 93d65903 depended on the machine: test/recurrence.test.ts counted formatting in America/New_York, which is this Mac's own zone and takes a path that never formats (it now uses a zone other than the local one; passes under the local zone and TZ=Europe/Berlin); test/product-rpc.test.ts did not clear CLAUDE_CODE_SESSION_ID, so inside Claude Code the CLI refused as an agent (it now clears it).

### 7. Test the feature through UI tools

- [x] Done in the harness (`client/src/renderer/sidebar-preview.html`, fake backend): the 50 approved cases in `specs/032-sidebar-navigation/ui-test-cases.md`, 46 pass, 4 not run (D-03, D-04, D-23 need the isolated app while another session runs the dev app; P-14 needs the iPhone). Five defects found and fixed: footer pushed off with many hosts, content moved by opening names, Cmd+P not focusing search from another place, `.place` class collision, phone menu colliding with `.phone-drawer`; plus the Browsers heading and repeated section headings. Results: `specs/032-sidebar-navigation/verification.md`.

### 8. Test the final UI

- [x] Done: desktop at 1180 and 820 px and phone at 390 x 844, every page in light and dark, focus rings, reduced motion; typecheck, eslint and 2054 tests pass after the fixes. Not checked in the real app or on the iPhone.

## Result

- Delivery: local changes in the worktree, not committed.
- Correction from Alex (2026-11-16): the Computers group is now the GeckIt computers from the board bar's selector (`useComputers` in `remote/Computer.tsx`); SSH hosts are back in Settings, Hosts; the selector left the bar. UX doc, spec folder and test cases updated; all desktop and phone cases run again.
- Remaining: P-14 on the iPhone; D-03, D-04, D-23 ran as a harness reload with the real settings store, not in an isolated app; the feature-list entry (T025).

# Tasks: Sidebar navigation

**Input**: design documents in `specs/032-sidebar-navigation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [design.md](design.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: requested by the goal "unit tests pass"; covered in Phase 2 and Phase 7.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: the user story the task serves (US1 to US4)

## Phase 1: Setup

- [x] T001 Write and get approval for docs/ux/sidebar-navigation.md, docs/design/sidebar-navigation.html and docs/design/sidebar-navigation-phone.html
- [x] T002 Create the worktree /Users/alex/Projects/mine/geckit-sidebar on branch feat/sidebar-navigation and the plan docs/plans/sidebar-navigation.md

## Phase 2: Foundational (blocking)

- [x] T003 Add `chatPlace` and `navNames` to client/src/shared/api.ts (type and defaults), client/src/shared/configuration.ts and client/src/shared/agent-settings.ts
- [x] T004 [P] Write the pure place rules in client/src/renderer/src/chat/places.ts
- [x] T005 [P] Test the place rules in client/test/places.test.ts and list it in client/tsconfig.web.json (excluded from tsconfig.node.json)
- [x] T006 [P] Add the manager, team, checklist, key and menu icons in client/src/renderer/src/ui/Icon.tsx

## Phase 3: User Story 1 - Move between places (P1) MVP

**Goal**: a sidebar that shows each place and brings the board back unchanged.

**Independent Test**: quickstart Q1 to Q3.

- [x] T007 [US1] Extract `SectionBody` and add `SettingsPage` without Checklists, Browsers and Secrets in client/src/renderer/src/ui/SettingsDialog.tsx
- [x] T008 [P] [US1] Give Team a page mode in client/src/renderer/src/employees/Team.tsx
- [x] T009 [P] [US1] Give ShortcutList a page mode in client/src/renderer/src/chat/ShortcutList.tsx
- [x] T010 [P] [US1] Let HostsSection show one host in client/src/renderer/src/chat/Hosts.tsx (reverted with T014: hosts stay in Settings)
- [x] T011 [US1] Build AppNav, ManagerPlace, QuestionsPlace and PlacePage in client/src/renderer/src/chat/PlacePages.tsx with client/src/renderer/src/chat/places.css
- [x] T012 [US1] Wrap the Chat window in the sidebar shell, keep the place, route keys and events to places, and make the covered board inert in client/src/renderer/src/chat/Chat.tsx

## Phase 4: User Story 2 - The board's bar (P1)

**Independent Test**: quickstart Q1, the bar part.

- [x] T013 [US2] Remove Shortcuts, Team, Manager, gecko, Settings and Questions from TopBar in client/src/renderer/src/chat/Board.tsx and its callers (Chat.tsx, gecko-preview.tsx)
- [x] T014 [US2] Decide with Alex where the remote GeckIt computer selector goes: the Computers group, with SSH hosts back in Settings (Alex, 2026-11-16); built with `useComputers` in client/src/renderer/src/remote/Computer.tsx

## Phase 5: User Story 3 - Folding (P2)

**Independent Test**: quickstart Q4 and Q5.

- [x] T015 [US3] Fold to the rail below 884 px, open names over the content, and toggle with Cmd+Ctrl+S or Ctrl+Alt+S in client/src/renderer/src/chat/Chat.tsx and client/src/renderer/src/chat/PlacePages.tsx

## Phase 6: User Story 4 - The phone's left menu (P2)

**Independent Test**: quickstart Q6.

- [x] T016 [US4] Add the PhoneMenu context and MenuButton, shown in every top-level Page bar, in client/src/renderer/src/chat/PhoneKit.tsx
- [x] T017 [US4] Replace the tab bar with the left menu and keep `phonePlace` in client/src/renderer/src/chat/PhoneHome.tsx and client/src/renderer/src/chat/phone-home.css
- [x] T018 [P] [US4] Put Search in the Tasks bar and drop the Manager row in client/src/renderer/src/chat/PhoneBoard.tsx and client/src/renderer/src/chat/PhoneSearch.tsx
- [x] T019 [P] [US4] Let PhoneTeam, PhoneShortcuts, PhoneBrowser and ManagerPhone be top-level pages in client/src/renderer/src/employees/PhoneTeam.tsx, client/src/renderer/src/chat/PhoneShortcuts.tsx, client/src/renderer/src/chat/PhoneBrowser.tsx and client/src/renderer/src/chat/ManagerInspection.tsx
- [x] T020 [US4] Move Team, Shortcuts and Browsers out of phone Settings and add the Channels group in client/src/renderer/src/chat/PhoneSettings.tsx
- [x] T021 [US4] Add the phone calls for secrets and the channel switch in client/src/main/index.ts and client/src/renderer/src/phone.ts (contracts/phone-calls.md)

## Phase 7: Polish and verification

- [x] T022 Run `npm run typecheck`, eslint on changed files and `npm run test` in client/; make the two machine-dependent tests independent of the environment in client/test/recurrence.test.ts and client/test/product-rpc.test.ts (suite: 2054 passed)
- [x] T023 Record the differences found while building in the "Implementation notes" of docs/ux/sidebar-navigation.md
- [x] T024 Review the rendered desktop and phone UI per quickstart.md Q1 to Q6 in light and dark themes, with the build-product-ui review and the performance-review checklist (run as the approved UI test cases; results in verification.md: D-03, D-04, D-23 and P-14 not run)
- [ ] T025 Propose the docs/features.md entry to Alex and add it after approval
- [ ] T026 Delivery (commit, PR) only when Alex authorizes it

## Dependencies and Execution Order

- Phase 2 blocks every story. US1 blocks US2 and US3 (they change the shell US1 builds). US4 depends only on Phase 2.
- T024 depends on T014 being decided or explicitly deferred; T026 depends on T024.

## Implementation Strategy

US1 with US2 is the smallest release that makes sense on desktop; US3 makes it usable beside an editor; US4 brings the phone in line. All four are implemented; T025 and T026 remain.

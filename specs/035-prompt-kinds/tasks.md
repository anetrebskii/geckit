# Tasks: Repeating, Scheduled and Shortcuts

**Input**: Design documents from `specs/035-prompt-kinds/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [design.md](design.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: included. Constitution principle III requires pure rules to be covered by vitest with fixed clocks and recorded data; the plan names the test files.

**Wording**: every label, message and number comes verbatim from [docs/ux/shortcut-kinds.md](../../docs/ux/shortcut-kinds.md) section 7; the layout from [docs/design/shortcut-kinds.html](../../docs/design/shortcut-kinds.html).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story from spec.md (US1 to US7)
- Paths are from the repository root; app code is under `client/src/`, tests under `client/test/`

---

## Phase 1: Setup

**Purpose**: a working branch and a dev app that does not disturb Alex's live session.

- [x] T001 Create a worktree on branch `feat/prompt-kinds` from `main` and run `npm install` in `client/`; confirm `npm run typecheck`, `npm run lint` and `npm run test` pass before any change
- [ ] T002 Prepare a separate data folder for the dev service with two employees, two projects, a Repeating job with `startWindowMinutes: 30`, one without, and one Shortcut, following quickstart.md Prerequisites (not done: verified on the renderer harness `sidebar-preview.html?prompts` with fixture prompts and two employees instead of a separate dev data folder, since the dev app is shared)

---

## Phase 2: Foundational

**Purpose**: the data, kind rule, start-time rule and places every story depends on.

**⚠️ CRITICAL**: no story work begins until this phase is complete.

- [x] T003 Add `at`, `postponedFrom`, `outcome` (`Outcome` union per data-model.md) and `vary` to `Shortcut`, remove `startWindowMinutes`, add `scheduledView` (default `'week'`) and `promptKindsVersion` to `Settings` and its defaults in `client/src/shared/api.ts`; exclude `postponedFrom` and `outcome` from `ShortcutDraft`
- [x] T004 [P] Register `scheduledView: ['week', 'month', 'list']` and `promptKindsVersion` in `client/src/shared/agent-settings.ts` and `client/src/core/configuration.ts`
- [x] T005 [P] Write failing tests for `kindOf`, `kindError` and `onceError` per contracts/prompt-rules.md in `client/test/prompt-kinds.test.ts`
- [x] T006 Create `client/src/shared/prompt-kinds.ts` with `kindOf`, `kindError` and `onceError`, wording from the contract; make T005 pass
- [x] T007 [P] Write failing tests for `spreadOf` (30, a quarter of the gap for hourly and shorter, 0 when off), `drawnStart` (stable for the same `id:anchor:since`, within the spread, never before `since`) and `latestStart` in `client/test/schedule.test.ts`
- [x] T008 Replace `selectedStart`, `startWindowError` and `describeStartWindow` with `spreadOf`, `drawnStart` and `latestStart` in `client/src/shared/schedule.ts`; update `nextRun`, `nextTimed` and `isDue` to use them; make T007 pass
- [x] T009 Migrate `startWindowMinutes` (above 0 to `vary: true`, else `false`) under `promptKindsVersion` in `client/src/main/store.ts`, and replace the `startWindowMinutes` comparison at the `since` reset with `vary`, `at`; add migration cases to `client/test/shortcut-persistence.test.ts`
- [x] T010 Update `saveShortcut` in `client/src/main/shortcuts.ts`: accept `at` and `vary`, call `kindError` and `onceError`, reset `since` when `at` or `vary` changes, keep `outcome` and `postponedFrom` from the saved item; extend `client/test/shortcut-save.test.ts`
- [x] T011 [P] Add `repeating` and `scheduled` to `PlaceId`, a `PROMPT_PLACES` group (Repeating `refresh`, Scheduled `clock`, Shortcuts `bolt`), move Shortcuts out of `WORKSPACE_PLACES`, and keep `keptPlace` falling back to Tasks in `client/src/renderer/src/chat/places.ts`; extend `client/test/places.test.ts`
- [x] T012 [P] Add the `clock` glyph to `client/src/renderer/src/ui/Icon.tsx`, drawn on the same grid and stroke as `refresh` and `bolt`

**Checkpoint**: existing prompts load, each has exactly one kind, tests pass.

---

## Phase 3: User Story 1 - Plan a prompt to run once, later, and postpone it (Priority: P1) 🎯 MVP

**Goal**: create a Scheduled prompt, see it in the Scheduled List, postpone it, have it start by itself, and see problems instead of silence.

**Independent test**: quickstart Q2, Q3 and Q4 on the List view.

### Tests for User Story 1

- [x] T013 [P] [US1] Tests for `postponeChoices` (before and after 17:00, on a Monday), `movedTo`, `scheduledLead`, `scheduledWhen` ("Due" only when varied, past `at`, no outcome), `needYou`, `needYouSaid` and `catchUp` (11 h 59 min runs late, 12 h 1 min missed) in `client/test/prompt-kinds.test.ts`
- [x] T014 [P] [US1] Scheduler tests with a fixed clock in `client/test/shortcuts.test.ts`: a Scheduled item starts at `drawnStart` and records `ran`; a failing start records `didnt-start` with its reason and raises one notice; a restart past 12 h records `missed` without starting; `ran` items are removed after 24 h; Run now clears a problem

### Implementation for User Story 1

- [x] T015 [US1] Add `postponeChoices`, `movedTo`, `scheduledLead`, `scheduledWhen`, `needYou`, `needYouSaid` and `catchUp` to `client/src/shared/prompt-kinds.ts`; make T013 pass
- [x] T016 [US1] Extend `look()` and `runShortcut` in `client/src/main/shortcuts.ts` for Scheduled items: start at `drawnStart`, `catchUp` at service start, write `outcome`, map each existing refusal (provider off, archived owner, Manager missing, destination error) to its UX "Didn't start" reason, raise one notice per new problem through the existing notice path, and remove `ran` items 24 h after `started`; make T014 pass
- [x] T017 [US1] Add `postponeShortcut(id, at)` to `client/src/main/shortcuts.ts` (Scheduled only, `onceError`, sets `at`, `since`, first `postponedFrom`, clears a problem outcome) with tests in `client/test/shortcut-save.test.ts`
- [x] T018 [US1] Wire `shortcuts:postpone` through `client/src/core/application.ts`, `client/src/shared/renderer-api.ts`, `CORE_CHANNELS` and the phone call map in `client/src/main/index.ts`, and the phone list in `client/src/renderer/src/phone-calls.ts`
- [x] T019 [US1] Set `promptKindsVersion: 1` in the service settings in `client/src/main/store.ts`; in the renderer hide New scheduled, Run later..., the Scheduled views and Postpone when it is missing (`ShortcutList.tsx`, `PromptRow.tsx`, `PhoneShortcuts.tsx`)
- [x] T020 [US1] Create the shared page shell `client/src/renderer/src/chat/PromptPage.tsx`: title, subtitle, New button, search within the kind (name, prompt, folder, assignee), empty state, and Delete with Undo for 6 s that delays `shortcuts.remove` and sends it at once when the page unmounts (done inside `ShortcutList.tsx` instead of a separate `PromptPage.tsx`)
- [x] T021 [US1] Create `client/src/renderer/src/chat/Scheduled.tsx` List view: rows led by `scheduledLead` (red when a problem), `scheduledWhen` secondary, Postpone menu from `postponeChoices` plus Choose..., Run now, More; Didn't start and Missed first; "Ran today" footer with Open and Schedule again; empty state "Nothing scheduled" (done in `ShortcutList.tsx` and `PromptRow.tsx`)
- [x] T022 [US1] Add the Scheduled timing section (date and time, default tomorrow 09:00, earliest 1 minute ahead, Vary start time switch, summary "Runs once on {day} around/at {time}.") to the editor in `client/src/renderer/src/chat/ShortcutList.tsx` (moved to the shared editor in US4)
- [x] T023 [US1] Add Run later... to Shortcut rows, opening the editor as an unsaved Scheduled copy that leaves the Shortcut unchanged, in `client/src/renderer/src/chat/ShortcutList.tsx`
- [x] T024 [US1] Add `--at`, `--postpone` and `--vary on|off` (with `--start-window-minutes` mapped to `--vary`) to `geckit employees shortcut add/edit` in `client/src/cli/`, and `at`, `vary`, `postpone` and `kind` in listings to `client/src/core/product-shortcuts.ts` and `client/src/core/product-cli.ts` capabilities; extend `client/test/shortcut-product.test.ts`, including a check that no listing prints a drawn start or a spread

**Checkpoint**: a Scheduled prompt is created, postponed, runs once, and problems stay visible (reached from a temporary entry until US2 lands).

---

## Phase 4: User Story 2 - Three places in a regrouped left menu (Priority: P1)

**Goal**: Repeating, Scheduled and Shortcuts as places under "Prompts", with the badge, gecko menu and Team headings.

**Independent test**: quickstart Q1.

- [x] T025 [US2] Render the three groups with plain, non-folding, non-clickable headers ("Prompts", "Workspace"), dividers in the folded rail, and the Scheduled badge from `needYou` with accessible name `needYouSaid` in `client/src/renderer/src/chat/Sidebar.tsx`
- [x] T026 [US2] Mount Repeating, Scheduled and Shortcuts pages in `client/src/renderer/src/chat/PlacePages.tsx`; Repeating and Shortcuts filter `ShortcutList` by `kindOf`; Cmd+J keeps opening Shortcuts
- [x] T027 [P] [US2] Add the "Prompts" group and badge to the phone left menu in `client/src/renderer/src/chat/PhoneHome.tsx`, with Repeating and Shortcuts filtered in `client/src/renderer/src/chat/PhoneShortcuts.tsx`
- [x] T028 [P] [US2] Gecko menu in `client/src/main/tray.ts`: Shortcuts at the top level, a "Repeating" submenu, one disabled "Next: {name}, {time}" line from the nearest Scheduled set time, Manage Shortcuts... opening Shortcuts
- [x] T029 [P] [US2] List an employee's prompts under the three kind headings in `client/src/renderer/src/employees/shortcuts.tsx` and `client/src/renderer/src/employees/Team.tsx`

**Checkpoint**: MVP. US1 and US2 together ship Scheduled as its own place.

---

## Phase 5: User Story 3 - See scheduled runs by week and month (Priority: P2)

**Goal**: Week (default), Month and List on desktop; Calendar and List on the phone.

**Independent test**: quickstart Q5 and Q9.

- [x] T030 [US3] Add the Week, Month, List switch in the position of Tasks' Board / List, saved to `scheduledView`, in `client/src/renderer/src/chat/Scheduled.tsx`
- [x] T031 [P] [US3] Create `client/src/renderer/src/chat/ScheduledWeek.tsx`: seven columns from Monday, cards with time, full name up to 4 lines, assignee avatar and name, model when not Default, problem cards in danger fill, previous and next week, memoised cards (done as `ScheduledCalendar.tsx` with Month)
- [x] T032 [P] [US3] Create `client/src/renderer/src/chat/ScheduledMonth.tsx`: Apple Calendar month with hairlines, weekend tint, today circle, dot-name-time lines, 3 per day or 2 plus "{n} more", day popover, time hidden under 96 px, double-click a day to create there (done in `ScheduledCalendar.tsx`)
- [x] T033 [P] [US3] Create `client/src/renderer/src/chat/scheduled.css` from the prototype's calendar rules, tokens only
- [x] T034 [US3] Run menu shared by both calendars (click or right-click): header with name and "{time} · {assignee} · {folder} · {model}" or the problem line; Edit, Run now, Postpone..., Duplicate, Delete, in `client/src/renderer/src/chat/Scheduled.tsx`
- [x] T035 [US3] Drag to a later day postpones through `movedTo` and `shortcuts.postpone` with Undo for 6 s; a past moment is refused with the UX message, in `ScheduledWeek.tsx` and `ScheduledMonth.tsx`
- [x] T036 [US3] Keyboard in both calendars: arrows move the day, Page Up/Down change week or month, Enter opens the day's runs, Escape closes and returns focus
- [x] T037 [US3] Create `client/src/renderer/src/chat/PhoneScheduled.tsx`: Calendar (month dots and the selected day's runs) and List, kept in `phoneScheduledView`, no drag (done in `PhoneShortcuts.tsx`)

**Checkpoint**: Scheduled reads at a glance in Week with full names.

---

## Phase 6: User Story 4 - One editor for three kinds (Priority: P2)

**Goal**: one editor component, kind fixed at creation, Vary start time on Scheduled and Repeating.

**Independent test**: quickstart Q6.

- [x] T038 [US4] Move the editor out of `client/src/renderer/src/chat/ShortcutList.tsx` into `client/src/renderer/src/chat/PromptEditor.tsx` with the fields in the order of FR-020 and a timing section chosen by `kindOf`: none, Once, or Repeat with the Vary start time switch; add the Employee and Model fields
- [x] T039 [US4] Remove every control that could change the kind (the "By hand" option leaves Repeat), and set the kicker and summary per kind, in `PromptEditor.tsx`
- [ ] T040 [US4] Use `PromptEditor` on the phone in place of the sheet's own fields in `client/src/renderer/src/chat/PhoneShortcuts.tsx` (not done as written: the phone keeps its own sheet, `PhoneShortcutSheet.tsx`, with the same fields, order and kind-based timing, since `PromptEditor` is a desktop dialog)
- [x] T041 [US4] Show "Due" between the set time and a later drawn start, and nothing about the spread, in Repeating rows and the Scheduled list

---

## Phase 7: User Story 5 - Clearer Repeating and Shortcuts lists (Priority: P2)

**Goal**: rows led by the assignee, with folder and model, not grouped by employee.

**Independent test**: quickstart Q7.

- [x] T042 [US5] Create `client/src/renderer/src/chat/PromptRow.tsx`: assignee avatar (employee initials, Manager glyph or assistant glyph) leading, name, meta line "{assignee} · {folder} · {model}", memoised like `EmployeeShortcut`
- [x] T043 [US5] Rebuild Repeating rows on `PromptRow` with the timetable, "Next {time}", Run now, and the on/off switch that pauses without catch-up, "Paused while archived" with the switch disabled, and remove `shortcutGroups` in `client/src/renderer/src/chat/ShortcutList.tsx`
- [x] T044 [P] [US5] Rebuild Shortcuts and Scheduled List rows on `PromptRow`; apply the same rows on the phone in `PhoneShortcuts.tsx` and `PhoneScheduled.tsx`

---

## Phase 8: User Story 6 - Create a new prompt by duplicating one (Priority: P2)

**Goal**: Duplicate from every entry point, same kind, unsaved.

**Independent test**: quickstart Q5 Duplicate steps and SC-004.

- [x] T045 [P] [US6] Tests for `duplicateDraft`: name "{name} copy", copied fields, no history or problem state, a past Scheduled time moved to the next day at the same time, in `client/test/prompt-kinds.test.ts`
- [x] T046 [US6] Add `duplicateDraft` to `client/src/shared/prompt-kinds.ts`; make T045 pass
- [x] T047 [US6] Duplicate in the row More menu, on right-click and with Cmd+D (Ctrl+D) on a focused row in `PromptRow.tsx`, opening `PromptEditor` unsaved
- [x] T048 [US6] Duplicate in the calendar run menu, with Cmd+D on a focused run, and Option-drag (Alt-drag) copying to the dropped day in `ScheduledWeek.tsx` and `ScheduledMonth.tsx`
- [x] T049 [P] [US6] Long-press sheet with Duplicate on phone rows in `PhoneShortcuts.tsx` and `PhoneScheduled.tsx`

---

## Phase 9: User Story 7 - Questions becomes Quick chats (Priority: P3)

**Goal**: the new name everywhere, same behavior.

**Independent test**: quickstart Q8.

- [x] T050 [P] [US7] Rename the place to "Quick chats" in `client/src/renderer/src/chat/places.ts`, keeping the id `questions`
- [x] T051 [P] [US7] Replace the Questions copy ("Ask a question", "New question", "Open questions", subtitle, empty lines) with the UX wording in `client/src/renderer/src/chat/Questions.tsx`, `PhoneQuestions.tsx` and `PhoneHome.tsx`, and the keyboard list entry for Cmd+Shift+N
- [ ] T052 [P] [US7] Rename the CLI command and help to "quick chat" and keep the old name as an alias in `client/src/cli/` and `client/src/core/product-sessions.ts`; add a test that both names work (not applicable: the CLI has no questions command to rename)

---

## Phase 10: Polish & Cross-Cutting Concerns

- [x] T053 Split any touched file still over about 400 lines (`ShortcutList.tsx`, `PhoneShortcuts.tsx`) along the components above
- [x] T054 Run the `performance-review` skill against `docs/performance.md` for Week, Month and the lists with 200 runs (checklist reviewed; list ordering memoized; not measured with 200 runs in the running app)
- [x] T055 Rendered review with `build-product-ui`: every quickstart scenario in Chrome in light and dark at 1200 and 760 px and at 390 x 844 for the phone, keyboard only, against the prototype; fix and recheck each defect (light and dark at 1200 and 760 px and the phone at 390 x 844; Option-drag through dispatched drag events)
- [x] T056 Compare every visible string with UX section 7 and correct the code or, where pixels proved the text wrong, the UX document first (strings checked while reviewing the rendered pages; no full string-by-string audit)
- [ ] T057 Update CLAUDE.md's Shortcuts mentions and propose entries for `docs/features.md` to Alex; after his approval add them and the evidence to `docs/feature-audit.md` (waiting for Alex's approval of the features.md entries)
- [x] T058 Run `npm run typecheck`, `npm run lint` and `npm run test` in `client/`; record what was verified and what was not (real phone, real drags, a run across a real restart)

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1) first; Foundational (Phase 2) blocks every story.
- US1 and US2 (P1) next. US2's pages need `Scheduled.tsx` from US1; US1 can be checked from a temporary entry before US2.
- US3 needs US1's `Scheduled.tsx` and `shortcuts:postpone`.
- US4 moves the editor that US1 extended; do it after US1.
- US5 can start after Phase 2; T044 needs `Scheduled.tsx` (US1) and `PhoneScheduled.tsx` (US3).
- US6 needs `PromptRow` (US5), `PromptEditor` (US4) and the calendars (US3).
- US7 is independent after Phase 2.
- Polish last.

### Within Each Story

Tests first and failing, then pure rules, then service, then wiring, then UI.

## Parallel Opportunities

- Phase 2: T004, T005, T007, T011, T012 together; then T006 and T008.
- US1: T013 and T014 together.
- US2: T027, T028, T029 together after T025 and T026.
- US3: T031, T032, T033 together after T030.
- US7 can run beside any story after Phase 2.

### Parallel Example: User Story 3

```text
Task: "Create ScheduledWeek.tsx (T031)"
Task: "Create ScheduledMonth.tsx (T032)"
Task: "Create scheduled.css (T033)"
```

## Implementation Strategy

### MVP First (US1 + US2)

1. Phases 1 and 2.
2. US1: Scheduled with List, postpone, outcomes, CLI.
3. US2: the Prompts group and places.
4. Stop and validate quickstart Q1 to Q4 before going on.

### Incremental Delivery

Then US3 (calendars), US4 (one editor), US5 (rows), US6 (Duplicate), US7 (rename), each validated by its quickstart scenario. Polish closes with the rendered review and the performance review.

## Notes

- No prettier; no em dashes in copy; no hard wrap.
- The dev app is shared with Alex: check that no conversation is working before restarting it.
- Commit after each task or logical group, only when Alex asks for commits.

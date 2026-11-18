# Design: Repeating, Scheduled and Shortcuts

**Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Status**: Ready for Alex's review (UX document and desktop and phone prototype). Each revision on 2026-11-18 followed Alex's comments in the session; he has not yet approved the whole.

## Scope

US1 through US7, FR-001 through FR-033. Desktop: the sidebar gains the Prompts group (Repeating, Scheduled, Shortcuts) between the first group and Workspace, and Questions is renamed Quick chats; Scheduled is a new place with Week, Month and List views; one editor serves the three kinds; Repeating and Shortcuts rows are redrawn with assignee and model; Duplicate reaches every row and calendar run. Phone: the same places in the left menu, Scheduled with Calendar and List, long-press Duplicate. Gecko menu, Team and CLI follow. Out of scope: hourly week and day grids, Repeating jobs in the calendar, a history page of every run, snoozing a conversation on the board (UX section 9).

## Artifacts

- UX document: [docs/ux/shortcut-kinds.md](../../docs/ux/shortcut-kinds.md). Every label, state, transition and number comes from it verbatim.
- Prototype, desktop and phone: [docs/design/shortcut-kinds.html](../../docs/design/shortcut-kinds.html) (Scheduled Week, Month, List; Repeating; Shortcuts; editor of each kind; run menu, day popover, Postpone menu; phone frame at 390 px).
- Superseded rule: [docs/ux/cron-start-window.md](../../docs/ux/cron-start-window.md) now points to "Vary start time".
- Visual vocabulary: tokens in `client/src/renderer/src/styles.css`; the sidebar from [specs/032-sidebar-navigation](../032-sidebar-navigation/design.md).

## Decisions

- Three places under a plain "Prompts" header, not one page with tabs: each kind answers a different question (what runs on its own, what runs once later, what I run myself) (UX section 10, "Left menu").
- The kind is derived from timing (a set moment, a timetable, or neither), is chosen once by the New button, Run later..., Schedule again or Duplicate, and no editor control changes it (FR-007, FR-021).
- One editor, one code path; only the timing section, kicker, summary and save target differ (FR-020).
- "Vary start time" is a single switch, on by default, ±30 minutes, a quarter of the gap for hourly and shorter repeats, never before the save; the drawn start is never shown (FR-022, FR-023).
- Scheduled opens on Week: columns of cards with the full name, assignee and model; Month is Apple Calendar style with dot, name and time; List for search and keyboard work. The switch sits where Tasks has Board / List (FR-014, FR-015).
- Assignee leads every row as an avatar and starts the meta line; rows are not grouped by employee (FR-025).
- Didn't start and Missed are never silent: red, first, a badge on Scheduled named "{n} need you", one notice (FR-003, FR-010).

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US2, FR-001 to FR-006 | Sidebar groups and badge; kept place "shortcuts"; gecko menu; Team headings | Q1, Q8 |
| US1, FR-007 to FR-013 | Scheduled states Waiting, Due, Starting, Ran, Didn't start, Missed; Postpone menu; Undo; Run later... | Q2, Q3, Q4 |
| US3, FR-014 to FR-019 | Week, Month and List; run menu; day popover; drag to postpone; keyboard; phone Calendar | Q5, Q9 |
| US4, FR-020 to FR-024 | One editor per kind; Vary start time switch; "Due" | Q6, unit tests on the spread |
| US5, FR-025 to FR-028 | Row lead avatar, meta line, chips, switch, search | Q7 |
| US6, FR-029, FR-030 | Six Duplicate entry points; "{name} copy"; past time moved to the next day | Q4, Q5 |
| US7, FR-031 | "Quick chats", "New quick chat"; old CLI name accepted | Q8 |
| FR-032, FR-033 | Wording verbatim; light and dark; CLI `--at`, `--postpone`, `--vary` | Q10, CLI tests |

## Review Evidence

- The prototype was reviewed in headless Chrome in light and dark at 1200 and 760 px and on a 390 px phone frame: Week, Month (day popover, "{n} more", time dropped under 96 px), List, the run menu, Option-drag copy, double-click to create on a day, Cmd+D, the editor of each kind and the Vary start time summary. No console errors other than font 404s from another session's uncommitted stylesheet.
- Not verified: real mouse drags in a headed browser, a physical phone, and the scheduler, which does not exist yet. The implemented UI must be reviewed rendered before the feature is called done (quickstart.md).

## Open Decisions

None that block planning. Every fork has a verdict in UX section 10. Alex's review of the whole may change wording or layout; such changes come as his next message and update the UX document first.

## Planning Handoff

Preserve the wording, the group order, the 30-minute spread and its quarter-gap cap, the 12-hour missed window, the 24-hour "Ran today", the 6-second Undo and the Week default. Shared contracts touched: the `Shortcut` type and its draft, the settings type (`scheduledView`), the place ids, the service calls (`shortcuts:postpone`) and their phone list, the CLI flags. Required validation: unit tests for kind derivation, duplicate, postpone choices and the spread; migration tests; the rendered review in quickstart.md.

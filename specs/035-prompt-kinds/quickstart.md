# Quickstart: validating Repeating, Scheduled and Shortcuts

**Plan**: [plan.md](plan.md) | **Contracts**: [contracts/](contracts/) | **Data model**: [data-model.md](data-model.md)

## Prerequisites

- From `client/`: `npm install`, then `npm run typecheck`, `npm run lint` and `npm run test` pass.
- A dev app that is not Alex's live session: check that no conversation is working before a restart, and prefer a separate data folder (memories "dev app is contended" and "isolated service overwrites global files").
- Settings with at least two employees, two projects, one Repeating job saved with a start window and one without, and one Shortcut, to check the migration.

## Unit checks

`npm run test -- prompt-kinds schedule shortcuts places`. Expected: kind derivation, kind guard, duplicate, postpone choices around 17:00 and on a Monday, lead text, spread caps, drawn start never before `since`, catch-up at 11 h 59 min and 12 h 1 min, and migration of `startWindowMinutes`, all pass offline.

## Scenarios

| Id | Steps | Expected |
| --- | --- | --- |
| Q1 | Open the Chat window | Sidebar groups as in [contracts/places.md](contracts/places.md); headers do not fold or click; a window that kept "shortcuts" opens Shortcuts; the old Repeating job is on Repeating, the Shortcut on Shortcuts (SC-007) |
| Q2 | Scheduled > New scheduled, keep the default time, Save | Editor kicker and summary per UX; row "Tomorrow 09:00" with "In {n} h"; the drawn start shown nowhere |
| Q3 | Postpone that row with each choice, then before and after 17:00 with the clock moved | Choices per [prompt-rules.md](contracts/prompt-rules.md); time changes in place; Undo for drag |
| Q4 | Set a run 2 minutes ahead with Vary start time off; turn a provider off and repeat; stop the service past a run for 13 h | First: conversation starts, row moves to "Ran today" with Open; second: "Didn't start" in red first, badge "1 need you", one notice; third: "Missed" without running |
| Q5 | Week: read a 120-character name; drag a card to Thursday; Option-drag a card; click a card, Duplicate; Month: "{n} more", day popover, double-click a day | Full name readable (SC-003); postponed with Undo; copy opens the editor unsaved; past moments refused with the UX message |
| Q6 | Open the editor of each kind | Same fields in the same order; only timing differs; no control changes the kind; Vary start time on for new Scheduled and Repeating |
| Q7 | Repeating and Shortcuts pages; search by assignee name | Avatar leads each row; meta line "{assignee} · {folder} · {model}"; no employee groups; search stays within the kind |
| Q8 | Sidebar, phone menu, Cmd+Shift+N, CLI help and the old CLI command | "Quick chats" and "New quick chat" everywhere; old command still works |
| Q9 | Phone 390 x 844: Scheduled Calendar and List; long-press a row | Dots and the selected day's runs; sheet with Duplicate; no drag |
| Q10 | Every scenario in light and dark, keyboard only (arrows, Page Up/Down, Enter, Cmd+D, Escape) | Focus visible and returned; badge, avatars and switches have spoken names (SC-006) |

## CLI

- `geckit employees shortcut add ... --at 2026-11-19T09:00 --vary off`, then `--postpone 2026-11-20T09:00`: the listing shows kind `scheduled` and the set time, never a drawn start.
- `--start-window-minutes 30` on an older script: saved as Vary start time on.

## Record

Write what was checked, on which surface and theme, and what stayed unverified (a real phone, real drags, a run across a real restart) into the task and the final reply.

# Research: Repeating, Scheduled and Shortcuts

**Date**: 2026-11-18 | **Plan**: [plan.md](plan.md)

No item of the Technical Context was left open. Each decision below was made by reading the current code; none needed outside research.

## R1. Where the kind lives

- Decision: derive it. `kindOf(shortcut)` returns `scheduled` when `at` is set, `repeating` when `cron` or `recurrence` is set, else `shortcut`. Saving refuses `at` together with a timetable.
- Rationale: FR-007 says the kind is never stored on its own. A stored kind could disagree with the timing; derived, every existing item lands on exactly one page with no migration (SC-007).
- Alternatives: a `kind` field (rejected: two sources of truth, and the CLI could write a contradiction); three separate arrays in settings (rejected: duplicates every save, run and phone path).

## R2. Storing a one-time run

- Decision: on `Shortcut`, optional `at` (epoch ms, an absolute moment), `postponedFrom` (epoch ms, the `at` it replaced), and `outcome` for the single run: `{ state: 'ran', started, session, lateMinutes? }` or `{ state: 'didnt-start' | 'missed', reason? }`. A ran item is removed by the service 24 h after `started`.
- Rationale: a Scheduled item runs once, so its one outcome fits on the item. `shortcut-runs.json` records destination delivery and stays as it is. UX section 8 keeps Once times as an absolute moment shown in the computer's time.
- Alternatives: a new `prompt-runs.json` (rejected: a second file to reconcile for a record of at most one entry per item); wall-clock date plus time zone (rejected: the computer's zone is the only one used, and the phone already shows the scheduling computer's time).

## R3. Vary start time

- Decision: `vary: boolean` replaces `startWindowMinutes`. The spread is 30 minutes either side, capped at a quarter of the gap between occurrences. The offset is drawn deterministically from a hash of `id:anchor:since`, in `[-spread, +spread]`, and the start is never earlier than `since` (the save, postpone or drag moment). `since` changes on every timing edit, postpone and drag, so each of them draws again; each Repeating occurrence has its own anchor, so each run draws again.
- Rationale: today's `selectedStart` hashes `id:anchor` into a window after the anchor and needs no stored draw; keeping a hash keeps restarts stable without storing a hidden value that a listing could leak (FR-023). Symmetric, so on average a run lands on the set time.
- Alternatives: storing the drawn moment (rejected: another hidden field that the CLI listing and phone would carry); random at each look (rejected: the start would move on every restart).
- Migration: a stored `startWindowMinutes` above 0 becomes `vary: true`, otherwise `vary: false`; the old field is dropped. Guarded by a settings version as `cronStartWindowVersion` guards the earlier migration. CLI `--start-window-minutes` keeps working for one release and maps the same way.

## R4. Missed and late after a restart

- Decision: at service start and on each look, a Scheduled item with no outcome whose latest start (`at` plus the spread when varied) has passed starts if now is within 12 h of that latest start, recording `lateMinutes`; past 12 h it becomes `missed` without running.
- Rationale: UX thresholds. The latest start, not the set time, is the reference, so a varied run is not called late while it was still allowed to start.

## R5. Didn't start

- Decision: `runShortcut` already returns `undefined` and logs when a run cannot start (provider off, archived owner, Manager missing, destination error). For a Scheduled item the look records `outcome: { state: 'didnt-start', reason }` with the UX wording for that reason and raises one notice through the existing notice path. The badge count is the number of Scheduled items with a `didnt-start` or `missed` outcome.
- Rationale: FR-010 forbids silent drops; the reasons already exist as log lines and only need their user wording.

## R6. Undo for delete

- Decision: the renderer hides the row and delays `shortcuts:remove` by 6 s; Undo cancels the timer; leaving the place or closing the window sends the remove at once.
- Rationale: saving with an unknown id is refused (`This shortcut was deleted.`), so restoring after a real remove would need a new id and break `lastSession`. Delaying keeps the item intact.

## R7. Postpone and drag

- Decision: a new service call `shortcuts:postpone(id, at)` sets `at`, keeps the first `postponedFrom`, clears a problem outcome and sets `since`. The choices (In 1 hour, This evening 18:00 before 17:00, Tomorrow 09:00, Monday 09:00 or Next Monday) come from a pure `postponeChoices(now)`. Drag on a calendar calls the same with the new day at the same time of day; a past moment is refused in the renderer with the UX message.
- Rationale: one path for menu, drag, phone and CLI; the expected-draft check of `shortcuts save` is not needed for a single field.

## R8. Scheduled view setting

- Decision: `scheduledView: 'week' | 'month' | 'list'`, default `week`, beside `chatView` in settings and in `agent-settings.ts`. The phone keeps its own `phoneScheduledView` (`calendar` or `list`) in its web view storage, as it keeps `phonePlace`.

## R9. Places

- Decision: add `repeating` and `scheduled` to `PlaceId`; keep `shortcuts` and `questions` as ids so kept places and events keep working (FR-004); a new `PROMPT_PLACES` group; `questions` is displayed "Quick chats". Cmd+J keeps opening Shortcuts.

## R10. Older service, newer client

- Decision: the service's settings carry `promptKindsVersion: 1` (`main/store.ts`), as `calendarRecurrenceVersion` and `cronStartWindowVersion` already do, and every client reads it from the settings it already receives; a phone or window talking to a service without it hides New scheduled, Run later..., Schedule again and Postpone, and Scheduled shows its empty state.
- Rationale: an older service would drop the unknown `at` on save and turn the item into a Shortcut. A settings flag reaches the Chat window, phones and remote clients with no new call, and `saveShortcut` refuses an `at` without it.

## R11. Quick chats in the CLI

- Decision: the product CLI and `geckit` help name the place "quick chat"; the command that starts one gets the new name and keeps the old one as an alias. Session data, `question` flags and the one-day deletion are unchanged.

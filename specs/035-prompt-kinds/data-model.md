# Data model: Repeating, Scheduled and Shortcuts

**Date**: 2026-11-18 | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

## Prompt (`Shortcut` in `client/src/shared/api.ts`)

The type keeps its name in code; the UI calls each item a prompt of one of three kinds.

| Field | Change | Rule |
| --- | --- | --- |
| `at?: number` | new | Absolute moment of a one-time run. Present only on Scheduled items. Refused together with `cron` or `recurrence`. On save, at least 1 minute after now (message "Pick a time from now on."). |
| `postponedFrom?: number` | new | The `at` before the first postpone. Set by `shortcuts:postpone`; cleared by an edit of the time; never copied by Duplicate. |
| `outcome?: Outcome` | new | Written by the service only. See below. Never copied by Duplicate. |
| `vary?: boolean` | new | Vary start time. Default `true` for new Scheduled and Repeating items; absent on Shortcuts. |
| `startWindowMinutes?: number` | removed | Migrated to `vary` (research R3). |
| `cron`, `recurrence` | unchanged | A timetable makes the item Repeating. |
| `since` | meaning extended | Also set by postpone and drag, so the start is drawn again. |
| `lastRun`, `lastSession` | unchanged | Scheduled uses them as Repeating does. |

`ShortcutDraft` gains `at`, `vary` and `postponedFrom` is excluded with `outcome`, as `since`, `lastRun` and `lastSession` are.

### Outcome

| State | Fields | Set when | Cleared when |
| --- | --- | --- | --- |
| `ran` | `started`, `session`, `lateMinutes?` | The conversation started or was queued | The service removes the item 24 h after `started` |
| `didnt-start` | `reason` | `runShortcut` returned nothing for a timetable start | Postpone, edit of the time, Run now that starts |
| `missed` | none | Latest start passed more than 12 h before the service saw it | Postpone, edit of the time, Run now that starts |

### Kind

`kindOf(p) = p.at !== undefined ? 'scheduled' : p.cron !== undefined || p.recurrence !== undefined ? 'repeating' : 'shortcut'`

The kind of an existing item never changes on save: `saveShortcut` refuses a draft whose kind differs from the saved item's ("This prompt cannot change its kind.").

### Scheduled states (UX section 5)

```text
Waiting --set time passes--> Due --drawn start--> Starting --> Ran --24 h--> removed
Waiting/Due --cannot start--> Didn't start --postpone/Run now--> Waiting/Starting
Waiting/Due --service down past 12 h after latest start--> Missed --postpone/Run now--> Waiting/Starting
Waiting/Due --service back within 12 h--> Starting (late)
```

"Due" is derived in the renderer: now is past `at`, there is no outcome, and the item is varied.

## Start time (`client/src/shared/schedule.ts`)

| Value | Rule |
| --- | --- |
| spread | 30 min when `vary`; for a timetable, the minimum of 30 min and a quarter of the gap to the next occurrence; 0 when not varied |
| drawn start | `anchor + offset`, offset from the FNV hash of `id:anchor:since` in `[-spread, +spread]`, then not earlier than `since` |
| latest start | `anchor + spread` |

## Settings (`client/src/shared/api.ts`, `agent-settings.ts`)

| Field | Values | Default |
| --- | --- | --- |
| `scheduledView` | `'week' \| 'month' \| 'list'` | `'week'` |
| `promptKindsVersion` | number | migration guard for `startWindowMinutes` to `vary` |

Phone web view storage: `phoneScheduledView` (`'calendar' \| 'list'`, default `'calendar'`).

## Places (`client/src/renderer/src/chat/places.ts`)

`PlaceId` adds `'repeating'` and `'scheduled'`. Groups: first `tasks`, `manager`, `questions` (named "Quick chats"); `PROMPT_PLACES` `repeating`, `scheduled`, `shortcuts`; Workspace `team`, `checklists`, `browsers`, `secrets`. A kept `shortcuts` still opens Shortcuts.

## Duplicate

`duplicateDraft(p, now)`: same kind; name "{name} copy"; every field of the draft copied (folder, prompt, checklist, target, employee, assistant, reasoning, model, destination, `vary`, timetable, `on`); no `id`, `outcome`, `postponedFrom`, `lastRun`, `lastSession`; a Scheduled `at` in the past moves to the next day at the same time of day, repeated until it is at least 1 minute ahead.

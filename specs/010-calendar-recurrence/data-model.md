# Data model: Calendar recurrence

## CalendarRecurrence

Canonical shared domain: start local date (YYYY-MM-DD), local hour/minute or equivalent time, positive safe integer interval, unit day/week/month/year, selected weekdays, monthly pattern date/ordinal/last, and end discriminated Never / On(date) / After(count from 1 to 10,000). Finite series must fit years 1 through 9999, otherwise reject explicitly. Use one named canonical type and derive editor subsets/drafts from it. Only active fields affect matching; invalid active fields cannot save or execute.

## Shortcut

Optional recurrence beside optional cron; valid shortcut has at most one. Existing on, since, lastRun and lastSession remain main-owned execution state. ShortcutDraft derives from Shortcut; renderer values for scheduler-owned fields are never authoritative. Manual runs leave recurrence cursor unchanged. Unrelated edits preserve progress; rule changes/resume set future cursor without moving start anchor. Edited deleted shortcut produces error.

## Runtime zone

Optional Settings.calendarTimeZone, derived in main from the computer's current resolved local zone. Broadcast/read metadata for phone evaluation; ignored as a renderer-writable preference. Main schedules and renderer previews use the same instant/zone.

Optional Settings.calendarRecurrenceVersion: 1 advertises support from the running main process. Current main derives it; older main omits it. It is ignored on writes and excluded from persisted settings and reload equality. Custom save requires version 1 before IPC; returned recurrence must also match the requested rule before the editor closes.

## Validation/state

Rules validate date/time, interval, weekday selection, pattern and exclusive end condition. Finite rules have at least one eligible occurrence. Expired rules remain editable and manually runnable. Count endpoints derive from scheduled occurrences, never from stored execution counters.

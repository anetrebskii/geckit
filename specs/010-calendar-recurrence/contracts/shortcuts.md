# Shortcut contract

Existing shortcuts.save / shortcuts:save accept ShortcutDraft and return saved Shortcut. Add optional CalendarRecurrence through composed shared types without new IPC method. Main validates both incoming and persisted custom rules; cron and recurrence are mutually exclusive. Save rejects invalid/deleted drafts and write errors; no successful UI acknowledgment on rejection.

The renderer accepts the save acknowledgment only when saved recurrence matches requested recurrence, independent of property/weekday order. A resolved legacy response that omits a requested rule follows the existing save-failed flow and retains the editor draft; it must not close the editor as if the custom schedule were persisted.

Settings.calendarRecurrenceVersion?: 1 is runtime metadata owned by main. Current main always advertises 1; older main does not. Ignore renderer-provided values and exclude this metadata from settings.json and disk-reload comparisons. A custom save without support version 1 is rejected before calling shortcuts.save, preserving the previously persisted timetable. Returned-rule verification remains required even when support is advertised. No new IPC method or capability framework is introduced.

Settings broadcasts carry validated shortcuts plus runtime-derived calendarTimeZone for phone preview. Main never trusts renderer-provided since/lastRun/lastSession or calendarTimeZone. Existing shortcuts.run remains a manual launch independent of recurrence/end limits.

A custom recurrence dialog returns a complete validated rule into caller draft on Done; Cancel returns no change. Outer Save owns persistence. Both desktop and phone use identical rule evaluation and scheduling computer's zone.

## CRON start-window extension (2026-11-01)

The existing draft/save contract also carries optional `startWindowMinutes` (integer 1–1,440, CRON only). Main rejects malformed or incompatible drafts; invalid persisted windows do not execute. Main retains scheduler-owned progress on unrelated saves and resets it when the window changes. Manual runs do not consume the chosen scheduled occurrence.

`Settings.cronStartWindowVersion?: 1` advertises runtime support and is never a writable or persisted preference. Window saves require version 1 before IPC. The returned window must equal the requested value, including removal, before the editor acknowledges success. Older hosts can continue saving exact schedules. No new IPC method is needed.

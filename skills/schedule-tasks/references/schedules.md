# Scheduling commands and runtime behavior

For Manager, use the authenticated `geckit` JSON argument protocol. In a thread with configuration access, use `employees shortcut` for direct saves without an additional local confirmation. Pass the exact `root` from `projects list`. In an ordinary operator conversation, prefix these commands with `{{said}}`. Shared team topics and scheduled Manager runs have restricted capabilities.

List all shortcuts with `employees shortcuts --json`, or restrict by employee ID or `none`. Read the matching saved record before editing. These are distinct from OS CRON jobs.

```text
employees shortcut add <employee-id|none> --name <name> --project <registered-project-root> --prompt <self-contained-task> --target task --checklist <saved-checklist> --cron "0 9 * * 1-5" --vary off --provider <enabled-provider>
employees shortcut add none --name <name> --project <registered-project-root> --prompt <coordination-request> --target manager --every "day 9:00" --vary off
employees shortcut add <employee-id|none> --name <name> --project <registered-project-root> --prompt <self-contained-task> --target task --at 2026-11-19T10:00 --vary off
employees shortcut edit <shortcut-id> --cron "0 10 * * 1-5"
employees shortcut edit <shortcut-id> --postpone 2026-11-20T09:00
employees shortcut pause <shortcut-id>
employees shortcut resume <shortcut-id>
employees shortcut run <shortcut-id>
```

A worker shortcut takes one of `--goal <condition>`, `--checklist <id-or-name>` or `--items <JSON array>`; the shortcut keeps its own copy of the checklist and each run works through it one item at a time, so later edits to the saved checklist need the shortcut edited again. The examples' times and cadence are illustrative, not defaults. Select `task` for worker execution or `manager` for a coordination request. Manager uses its configured assistant and approvals. Its shortcut prompt is a Manager request, not instructions to run implementation itself.

`--every` supports `hour`, `hour 15`, `day 9:00`, `weekdays 9:00` and `week monday 9:00`. Edit accepts `--every none` to remove a timetable. Use either `--every` or `--cron`. Preserve enabled state unless asked to pause or resume.

CRON has five numeric fields: minute 0-59, hour 0-23, day 1-31, month 1-12, weekday 0-7. Sunday is 0 or 7. Asterisks, lists, ranges and steps are supported; seconds, weekday names and macros are not. When both day-of-month and weekday are restricted, either matches. A syntactically valid expression can still describe dates that never occur; check the intended calendar.

Use `schedulerTimeZone` from capabilities on the GeckIt service that holds the shortcut, including when a worker will run over SSH. Each service schedules shortcuts in its own OS timezone.

A prompt has one kind, fixed when it is saved: Repeating (`--every` or `--cron`), Scheduled (`--at <date-time>`, runs once) or Shortcut (no timing, run by hand). An edit that would change the kind is refused; save a new prompt instead. `--at` takes a local date and time at least a minute ahead. `--postpone <date-time>` moves a Scheduled prompt and keeps its first set time; it also clears a Didn't start or Missed state. A Scheduled run that could not start runs late within 12 hours of its latest start, otherwise it is marked Missed and does not run by itself.

`--vary on|off` lets a Repeating or Scheduled run start at a stable random minute up to 30 minutes either side of its set time (a quarter of the gap for hourly and shorter timetables). This is not an exact-time promise. The older `--start-window-minutes` is read as `--vary on`, or `off` for `none`.

Dispatch is checked about every 20 seconds while GeckIt runs. A previous busy worker skips a timed occurrence without accumulating overlapping workers. Manager dispatch avoids overlapping pending submissions. One overdue occurrence can run after downtime; missed occurrences are not all replayed. Re-enabling a shortcut or changing its timetable resets its scheduling baseline. An archived employee's timed shortcuts are skipped.

A manual Run performs the work and does not replace configuration readback. Its receipt proves dispatch only; check worker completion or Manager handling separately. External messages and paid operations keep their ordinary authorization requirements.

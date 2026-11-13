# Scheduling commands and runtime behavior

For Manager, use its authenticated `geckit` JSON argument protocol and current capabilities. In an ordinary operator conversation, prefix these commands with `{{said}}`; retain its authority rules. A team topic may not have shortcut-write access.

List all shortcuts with `employees shortcuts --json`, or restrict by employee ID or `none`. Read the matching saved record before editing. These are distinct from OS CRON jobs.

```text
employees shortcut add <employee-id|none> --name <name> --project <registered-project> --prompt <self-contained-task> --target task --goal <completion-condition> --cron "0 9 * * 1-5" --provider <enabled-provider>
employees shortcut add none --name <name> --project <registered-project> --prompt <coordination-request> --target manager --every "day 9:00"
employees shortcut edit <shortcut-id> --cron "0 10 * * 1-5"
employees shortcut pause <shortcut-id>
employees shortcut resume <shortcut-id>
employees shortcut run <shortcut-id>
```

The examples' times and cadence are illustrative, not defaults. Select `task` for worker execution or `manager` for a coordination request. Manager uses its configured assistant and approvals. Its shortcut prompt is a Manager request, not instructions to run implementation itself.

`--every` supports `hour`, `hour 15`, `day 9:00`, `weekdays 9:00` and `week monday 9:00`. Edit accepts `--every none` to remove a timetable. Use either `--every` or `--cron`. Preserve enabled state unless asked to pause or resume.

CRON has five numeric fields: minute 0-59, hour 0-23, day 1-31, month 1-12, weekday 0-7. Sunday is 0 or 7. Asterisks, lists, ranges and steps are supported; seconds, weekday names and macros are not. When both day-of-month and weekday are restricted, either matches. A syntactically valid expression can still describe dates that never occur; check the intended calendar.

There is no per-shortcut timezone field. Verify the execution machine's OS timezone through authorized configuration or a delegated read-only check. Do not assume the Manager's chat timezone or this computer's timezone describes a remote service. Do not change system timezone to satisfy one shortcut.

`--start-window-minutes <1-1440|none>` permits a delayed start within a CRON window. The scheduler selects a deterministic minute per shortcut and occurrence, clipped before the next occurrence. This is not an exact-time promise.

Dispatch is checked about every 20 seconds while GeckIt runs. A previous busy worker skips a timed occurrence without accumulating overlapping workers. Manager dispatch avoids overlapping pending submissions. One overdue occurrence can run after downtime; missed occurrences are not all replayed. Re-enabling a shortcut or changing its timetable resets its scheduling baseline. An archived employee's timed shortcuts are skipped.

A manual Run performs the work and does not replace configuration readback. Its receipt proves dispatch only; check worker completion or Manager handling separately. External messages and paid operations keep their ordinary authorization requirements.

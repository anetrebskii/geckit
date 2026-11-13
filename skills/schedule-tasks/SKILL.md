---
name: schedule-tasks
description: Create or revise recurring GeckIt tasks with CRON or built-in timetables. Use for scheduled worker jobs and Manager coordination, checking existing shortcuts, execution timezone, overlap and saved configuration.
---

# Schedule recurring GeckIt work

## Purpose

Save a recurring worker assignment or Manager request as a GeckIt shortcut. Use the product scheduler, not an OS crontab or a provider-specific automation.

## Inputs

Establish the requested outcome, project, frequency, local time, execution computer and timezone. Choose worker execution for substantive work or Manager execution for coordination. Read [schedule commands and semantics](references/schedules.md) before saving.

## Work

1. Check capabilities, projects, employees and existing shortcuts. Compare outcome, project, target, timetable and employee before creating anything. Edit the matching shortcut when the person is revising it. Do not duplicate a schedule because its title differs.
2. Resolve timezone against the computer running GeckIt. CRON uses that computer's local timezone, not necessarily the person's. Ask when time or timezone is ambiguous; account for daylight-saving changes. Do not silently convert a local-time promise into a fixed UTC offset.
3. Write a self-contained prompt and checkable result. For a worker, select an active employee or unassigned scope, enabled provider and requested execution settings. For Manager, use `none` as employee and `--target manager`; worker goal/provider/model fields do not apply. Creating a Manager shortcut does not enable Manager.
4. Use a built-in timetable when it expresses the request; otherwise save a numeric five-field CRON expression. Do not invent a recurrence for a one-time request. Use a start window only when the person permits delayed execution within that window.
5. Keep unaffected fields and enabled state during edits. Inspect the saved shortcut after Add, Edit, Pause or Resume. Verify the target, prompt, project, expression, execution settings and actual scheduler timezone.
6. Explain missed-run and overlap behavior before promising exact delivery. The app must run for dispatch. After downtime it can dispatch one overdue run; it does not replay every missed occurrence. A busy previous worker suppresses overlapping timed runs. Enabling or changing a timetable starts a new baseline.
7. Do not invoke Run merely to test saving: it executes real work. Run only when the person requested immediate execution. A saved shortcut proves configuration, not successful execution or external delivery.

## Unknowns

Ask for missing frequency, execution timezone or target before saving. If the requested cadence cannot be expressed, state the limitation. When capabilities restrict shortcut writes or Manager is disabled, report the blocker; do not bypass it with another scheduler.

## Output

Reply in the person's language with shortcut ID, target, project, timetable in words and its timezone, enabled state and completion condition. Label configuration verification separately from an observed run. Report any unresolved execution dependency.

## Verification

Read the saved shortcut from GeckIt, compare every requested field and confirm no duplicate was introduced. If an immediate run was authorized, inspect its dispatch receipt and worker or Manager result separately; do not call acceptance a completed job.

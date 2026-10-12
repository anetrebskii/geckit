# Feature Specification: Calendar-style recurrence

**Feature Branch**: Existing shared checkout; no branch switch during concurrent work

**Created**: 2026-10-11

**Status**: Approved for implementation on 2026-10-11

**Input**: User description: "Support scheduling cron jobs as it's in google calendar", with a Custom recurrence screenshot showing an interval, unit, weekday selection and Never / On / After end conditions.

## User Scenarios & Testing

### User Story 1 - Set a custom recurrence (Priority: P1)

A person schedules a saved prompt using calendar terms, without writing a cron expression.

**Why this priority**: The existing editor offers hourly, daily, weekday and single-weekday schedules, but lacks arbitrary intervals and multiple selected weekdays.

**Independent Test**: Save a shortcut for every two weeks on Tuesday and Thursday at 09:00, reopen it, and verify its next dates remain anchored to its chosen start date.

**Acceptance Scenarios**:

1. **Given** a shortcut editor, **When** the person chooses "Custom...", **Then** they can set a start date, time, positive interval, unit and end condition.
2. **Given** a weekly recurrence, **When** Tuesday and Thursday are selected, **Then** both days are included in each eligible week.
3. **Given** a monthly recurrence starting October 13, **When** the person selects the weekday pattern, **Then** it repeats on the second Tuesday in eligible months.
4. **Given** an existing cron or named schedule, **When** the person opens and saves unrelated shortcut fields, **Then** the original schedule remains unchanged.

### User Story 2 - End the schedule (Priority: P1)

A person limits a recurring job by an inclusive end date or a number of scheduled occurrences.

**Why this priority**: End conditions are a central part of the supplied reference and must govern execution, not just appear in the editor.

**Independent Test**: Schedule three occurrences, advance through their dates, and verify a fourth automatic occurrence is never eligible.

**Acceptance Scenarios**:

1. **Given** "Never", **When** a recurrence is saved, **Then** it has no end limit.
2. **Given** "On" an end date, **When** that date passes on the scheduling computer, **Then** no automatic run starts afterward.
3. **Given** "After" three occurrences, **When** the third scheduled date passes, **Then** no fourth occurrence exists; a manual run does not alter this limit.
4. **Given** an ended timetable, **When** the shortcut is opened, **Then** the person sees "Timetable ended" and can still run it manually or edit its recurrence.

### User Story 3 - Edit from desktop or phone (Priority: P2)

A person can review and change the same recurrence from the desktop or paired phone.

**Why this priority**: Both surfaces already manage schedules; the phone must preserve and edit new rules.

**Independent Test**: Save a recurrence on desktop, edit it on phone, then reopen on desktop and verify matching fields and summary.

**Acceptance Scenarios**:

1. **Given** a saved recurrence, **When** it opens on either surface, **Then** all interval, start, time, weekday, monthly pattern and end values round-trip.
2. **Given** a changed recurrence draft, **When** "Cancel" or Escape is used, **Then** the saved shortcut and outer editor remain unchanged.
3. **Given** invalid values, **When** the person tries to confirm, **Then** confirmation is disabled and the applicable inline error explains how to repair them.

### Edge Cases

- Counts above 10,000 and finite series extending beyond year 9999 are rejected with explicit validation; no silent truncation.
- Empty weekday selection, nonpositive or fractional intervals, blank dates/times and end dates before start are invalid.
- A monthly date missing from a month is skipped; February 29 yearly rules skip non-leap years. A missing fifth weekday is skipped.
- A nonexistent local time during a clock change is skipped; a repeated local time produces one scheduled occurrence.
- Weekly intervals use Monday-start calendar weeks anchored to the week containing the start date; dates before the start are excluded.
- Sleep or app closure coalesces missed eligible occurrences into one catch-up run if the recurrence has not ended. Past occurrences still consume an occurrence limit. The last occurrence remains eligible through its local calendar day so a normal scheduler tick can deliver it. There is no catch-up on a later day.
- Busy previous work skips a scheduled occurrence under existing scheduler behavior. A failed automatic launch also consumes that scheduled occurrence. Manual runs never consume occurrences.
- Pausing does not move the start anchor or extend an end condition. Resuming schedules future dates, without replaying paused dates.
- Changing recurrence starts a new series using the edited start date and limit. Editing other shortcut fields does not restart the series.
- Phone scheduling uses the paired computer's local calendar and time zone, regardless of the phone's zone.

## Requirements

### Functional Requirements

- **FR-001**: Keep existing manual, hourly, daily, weekday, weekly and raw cron schedules working without silent conversion.
- **FR-002**: Offer "Custom..." with "Repeat every", day/week/month/year units, "Starts", "At", "Repeat on" for weeks and "Ends".
- **FR-003**: Persist a fixed start date and local time; use calendar intervals anchored to that date, independent of the last actual run.
- **FR-004**: Allow any nonempty selection of weekdays for weekly recurrence, in Monday-to-Sunday display order.
- **FR-005**: Support monthly repetition on the starting day of the month or its ordinal weekday, including an explicit last-weekday option; support yearly repetition on the starting month and day.
- **FR-006**: Support mutually exclusive "Never", "On" an inclusive date and "After" 1 to 10,000 scheduled occurrences.
- **FR-007**: Show a readable recurrence summary, next eligible time, paused state or ended state in both shortcut lists/editors.
- **FR-008**: Validate rules before saving in both the editor and the scheduling owner; report errors inline and retain drafts on save failure.
- **FR-009**: Preserve existing background execution constraints: GeckIt must be open, supported assistant available, and no overlap with the preceding shortcut run.
- **FR-010**: Provide equivalent editing and cancellation on desktop and phone; support keyboard navigation, visible focus, light/dark themes and narrow screens.
- **FR-011**: End conditions apply to scheduled dates; manual runs are independent. Neither restarts nor pausing reset an occurrence limit.
- **FR-012**: Follow the edge-case rules above for calendar dates, clock changes, catch-up and edits.

### Key Entities

- **Shortcut**: Saved prompt, folder and assistant settings, with either a manual schedule, existing timetable or custom calendar recurrence.
- **Calendar recurrence**: Start date, time, interval, unit, weekday or monthly pattern and end condition.
- **Scheduled occurrence**: An eligible local calendar date/time in a series, whether started, missed, skipped or failed.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A person can configure every two weeks on Tuesday and Thursday ending after 13 occurrences without typing cron, in under one minute after opening the recurrence editor.
- **SC-002**: All recurrence fields round-trip between desktop, phone and persisted settings in the acceptance scenarios.
- **SC-003**: Every boundary scenario produces the specified eligible dates, with zero automatic launches after the series ends.
- **SC-004**: All existing scheduler acceptance scenarios retain their current results.

## Assumptions

- The screenshot requests recurrence controls for GeckIt shortcuts, rather than a Google Calendar connection or a separate operating-system cron service.
- Custom recurrence supports day, week, month and year; hourly and raw cron remain existing choices.
- The supplied screenshot guides grouping and interaction. GeckIt's own components and tokens determine appearance.
- End-after means calendar occurrences, including missed/skipped dates, rather than a quota of successful conversations.
- UX: [calendar recurrence](../../docs/ux/calendar-recurrence.md). Design handoff: [design.md](design.md).

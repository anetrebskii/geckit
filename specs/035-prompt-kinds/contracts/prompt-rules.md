# Contract: prompt rules (pure)

New module `client/src/shared/prompt-kinds.ts`, with the start-time changes in `client/src/shared/schedule.ts`. Covered by vitest in `client/test/prompt-kinds.test.ts` and `client/test/schedule.test.ts`.

| Function | Input | Output |
| --- | --- | --- |
| `kindOf(p)` | a prompt or draft | `'scheduled'`, `'repeating'` or `'shortcut'` (data-model.md) |
| `kindError(was, draft)` | saved item or none, draft | "This prompt cannot change its kind." when the kinds differ; "Choose one timetable." when `at` comes with `cron` or `recurrence` |
| `onceError(at, now)` | moment, now | "Pick a time from now on." when `at < now + 60_000` |
| `duplicateDraft(p, now)` | prompt, now | draft per data-model.md, Duplicate |
| `postponeChoices(now)` | now | ordered `{ label, at }`: "In 1 hour"; "This evening 18:00" only before 17:00; "Tomorrow 09:00"; "Monday 09:00", or "Next Monday 09:00" on Mondays |
| `movedTo(at, day)` | moment, target day | the target day at the same local time of day |
| `scheduledLead(at, now)` | moment, now | "Today 15:30", "Tomorrow 10:00", "Fri 21 Nov 10:00" |
| `scheduledWhen(p, now)` | prompt, now | "In 40 min", "In 18 h", "In 3 days", or "Due" when past `at`, varied and without outcome |
| `needYou(prompts)` | all prompts | count of Scheduled items with `didnt-start` or `missed` outcome |
| `needYouSaid(n)` | count | "{n} need you" |
| `spreadOf(p, anchor)` | prompt, occurrence | minutes: 0 when not varied, 30, or a quarter of the gap for shorter repeats |
| `drawnStart(p, anchor)` | prompt, occurrence | moment, never earlier than `since`; replaces `selectedStart` |
| `latestStart(p, anchor)` | prompt, occurrence | `anchor + spread` |
| `catchUp(p, now)` | Scheduled prompt, now | `'run'` with late minutes within 12 h of the latest start, `'missed'` past it, `'wait'` before it |

Removed: `startWindowError`, `describeStartWindow` (no number is shown or validated). The editor summary helpers return "around {time}" when varied and "at {time}" when not, verbatim from UX section 7.

# Verification: CRON start windows

Status: Implemented in the working tree. Browser acceptance remains partial; the remaining UI checks need the local preview in the active Chrome window. Approved by Alex with "Реализуй" on 2026-11-01.

## Behavior

- Optional `startWindowMinutes` of 1–1440 whole minutes, available for named and raw CRON schedules on desktop and phone; existing schedules remain exact by default.
- One selected minute per occurrence, derived from the shortcut UUID and raw CRON timestamp. Polling, reload and unrelated edits retain that minute. A window ends before the following raw occurrence.
- Existing manual-run, pause/resume, busy-session and one-run catch-up behavior retained. Polling and queueing may delay actual execution; a missed run can catch up after its window.
- Main validates writes and skips malformed stored windows. Runtime capability metadata and save acknowledgment prevent an older host silently dropping the window.
- Phone window previews use the scheduling host's zone, including DST gap/fold handling.

## Completed checks

| Check | Result | Boundary |
| --- | --- | --- |
| Focused schedule, scheduler, save acknowledgment, persistence and store suites | 64 passed | Scheduler launch dependencies mocked; persistence uses actual main save/store against temporary settings files |
| Schedule suite with `TZ=America/New_York` | 15 passed | Local and remote-zone arithmetic; no live assistant sessions |
| Client typecheck and full lint | Passed | Source checks |
| Client production build | Passed | Main, preload and renderer bundles |
| Mobile production build | Passed | Bundle rebuilt after shared renderer changes; existing chunk-size warning |
| Diff whitespace | Passed | Scoped implementation diff |
| UX state diagram | Rendered with local Mermaid CLI | `/private/tmp/geckit-cron-window.svg` |

Store watcher checks failed inside the filesystem sandbox and passed when run outside it. This was an execution boundary, not a remaining test failure. No real shortcut was changed, no assistant launched, and the active GeckIt main process was not restarted.

## Actual renderer review

The existing recurrence preview loads the actual ShortcutList/Editor and PhoneShortcuts/ShortcutSheet with mocked native IPC. It is not verification of a connected phone or the installed scheduler.

Reviewed personally in Chrome full-window desktop light context, at approximately 1352 px wide: schedule group hierarchy, CRON field, enabled window, 60-minute value, explanatory text, stable selected-next preview, inline invalid zero/fractional/blank values and disabled Save. The input kept focus and remained editable. A misleading secondary CRON error on invalid window input was found, fixed and rechecked.

Remaining checks: valid repair and Save/reopen, cancel retention, window off, Manual/Custom transitions, save rejection/retry and old-host UI failure, full keyboard traversal, outer scrolling, desktop dark, and phone 390x844 / 320x568 in both themes. Main/save behavior for these boundaries has automated coverage, but that does not establish the rendered interactions.

Automatic approval review rejected reading the current Chrome AX tree because the active page was an unrelated personal calendar. Filtering after capture would still read that page. The browser access host was unavailable, and native actions could not safely regain the preview after the active window changed. Alex was asked to activate the local preview; no private-page access or alternative browser access was attempted after that rejection.

## Performance review

Needs measuring: live-app cost after loading the new main build. No new animation, conversation row or list was introduced.

| Checklist item | Verdict | Evidence |
| --- | --- | --- |
| Repeated work per row | Holds by source inspection | CRON parsing is cached with a bounded 64-entry table; pending lookup scans at most the one-day window and avoids per-minute formatters |
| No formatter made per call | Holds for added code | Existing cached calendar-zone/civil formatters reused |
| Typing redraws only dependent work | Holds | Editor next-time memo depends on schedule fields, shortcut identity/progress, time and zone; name/prompt changes retain it |
| Phone rebuilt | Holds | Production mobile build passed |
| Measured in running app | Unverified | Active main not restarted; browser review incomplete |

Eight checklist items concerning new conversation components, callback identity, sorting, long-list layout, pointer selection and animations were not changed by this feature.

## Delivery and remaining work

Source changes remain in the requested shared checkout on `feat/employees`; unrelated edits were preserved. No commit, push, deployment or task worktree was created. Restart the native app only when active work can safely be interrupted to load the new scheduler. Physical-device and live scheduled-assistant execution remain unverified.

The exact feature-list expansion was sent to Alex for approval. Until answered, the existing Scheduled work entry and its audit are unchanged by this task.

UX: [CRON start window](../../docs/ux/cron-start-window.md). Session: `codex:01a19891-650a-7cd1-83ad-371e18eb2131`.

# Contract: service calls, phone and CLI

## Service methods (`client/src/core/application.ts`, `shared/renderer-api.ts`, `main/index.ts` `CORE_CHANNELS`)

| Method | Change | Behavior |
| --- | --- | --- |
| `shortcuts:save(draft)` | extended | Accepts `at` and `vary`; refuses a kind change, `at` with a timetable, `at` in the past; sets `since` when `at` or `vary` changes |
| `shortcuts:postpone(id, at)` | new | Scheduled only. Validates `at`; sets `at`, `since` and the first `postponedFrom`; clears a problem outcome. Returns the saved prompt |
| `shortcuts:run(id)` | unchanged contract | For a Scheduled item records `outcome: ran` on start, clears a problem outcome |
| `shortcuts:remove(id)` | unchanged | Called 6 s after Delete unless undone (research R6) |
| Settings `promptKindsVersion` | new | `1` on a service that keeps Scheduled prompts; a client hides Scheduled actions without it (research R10). Product CLI `capabilities` lists `shortcuts postpone` |

The phone reaches `shortcuts.postpone` through the phone call list beside `shortcuts.save` and `shortcuts.run`.

## Scheduler (`client/src/main/shortcuts.ts`)

- `look()`: for Scheduled items without outcome, starts at `drawnStart`, or applies `catchUp` after a restart; records `ran`, `didnt-start` (with the UX reason) or `missed`; raises one notice per new problem.
- Removes items whose `ran.started` is more than 24 h ago.
- Repeating behavior unchanged apart from `drawnStart`.

## Gecko menu (`client/src/main/tray.ts`)

Top level: Shortcuts by name. Submenu "Repeating": each Repeating job. One disabled line "Next: {name}, {time}" for the nearest Scheduled set time. Manage Shortcuts... opens Shortcuts.

## CLI

| Command | Change |
| --- | --- |
| `geckit employees shortcut add/edit` | `--at <ISO date-time or none>`, `--postpone <ISO date-time>`, `--vary on\|off`; `--start-window-minutes` accepted for one release and mapped to `--vary` |
| product `shortcuts save --draft` | fields `at` and `vary` allowed; `startWindowMinutes` accepted and mapped |
| product `shortcuts postpone --id --at` | new |
| product `shortcuts list` | prints `kind` per item; never the drawn start or the spread |
| quick chat command | new name "quick chat"; the old name keeps working (FR-031) |

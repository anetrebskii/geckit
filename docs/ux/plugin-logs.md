---
type: spec
status: implementation-authorized
owner: Alex
created: 2026-10-09
---

# UX: Inspect plugin logs

## Why

Alex needs evidence of actual library activity, especially whether Claude tmux checks usage more often than required. A terminal screen is not a timestamped history.

## Surfaces

| Surface | Behavior |
| --- | --- |
| Local plugin log file | One structured record per diagnostic event; separate file per library |
| Provider guide | Explains file locations, following a log, filtering actual checks and rotation |
| Existing desktop/phone | Existing state and messages continue; no new controls or layout |

## States and transitions

| State | Trigger | What the person sees | Action |
| --- | --- | --- | --- |
| No log | Library not loaded by an updated host | File absent | Start updated GeckIt with the library installed |
| Recording | Library loads or performs a logged operation | Timestamped events appended | Open or follow its file |
| Rotated | Current file reaches size threshold automatically | Previous events in `.1`; new events in current file | Read both files for older activity |
| Write unavailable | Storage/write failure automatically | No new records; AI operation continues | Check folder permissions/storage |

The file appears on the first logged event. Rotation returns to recording automatically. A later successful write recovers recording after a storage failure. Removal leaves diagnostics available; reinstalling the same identity uses the same bounded history.

## Quiet states

Recording, cached limits, rotation and log failures produce no banners or notifications. Logs never include conversation text, question answers, command arguments, image data or raw backend bodies. Host request events are distinct from plugin backend-check events; counting host requests does not measure usage calls.

## Timing and storage

- The writer queues local writes without waiting in provider operations.
- Each plugin retains a current file of up to 2 MiB and one previous file of up to 2 MiB. This bounds growth while retaining useful recent diagnostics.
- Tmux retains its randomized 15-30 minute cooldown and successful-message gate. The first request measures once; no-message and cooldown responses record skip reasons. Shared requests do not launch another check.

## Wording

Logs use stable event names, not new UI messages: `limits.host.requested` describes GeckIt requests; `usage.check.started` describes tmux checks; `usage.command.sent` confirms actual `/usage` delivery; `usage.check.completed`, `usage.check.failed`, and `usage.check.skipped` describe outcomes. Skip reasons are `no-new-messages`, `cooldown`, or `in-flight`.

## Edge cases

Messages sent during a check remain eligible for the next check. Failed sends do not count. Each actual check has an ID so overlapping reads can be distinguished. Staged candidates and active snapshots identify their load attempt in the shared library history. Reset rollover and transcript limit events remain local/cache operations, not backend checks.

## Deliberate omissions

No log upload, log viewer, settings button, prompt/response capture or unlimited history. No changes to keyboard, focus, scrolling, themes or viewport layouts because the app UI is untouched.

## Decisions and requirements

Use per-library files through a host logger, rather than plugin-specific file locations. This makes all current plugins inspectable and keeps rotation/redaction consistent. FR-001 through FR-007 are covered by host and fake-backend tests. User's request authorizes implementation; no additional UX decision blocks it.

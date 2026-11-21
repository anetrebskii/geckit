---
type: spec
status: approved-scope
owner: Alex
created: 2026-11-05
---

# UX: agent settings and saved shortcuts

## 1. Purpose and path to a usable result

Alex explicitly requested settings and shortcut changes without GeckIt's additional confirmation. A worker or authenticated Manager reads current values and the supported schema, changes only the requested fields, then reads the result. A saved shortcut is a prompt for a new task or Manager, with its project, optional goal, assistant choices and timetable. It is not a keyboard accelerator. Native keyboard shortcut availability is the separate `anywhereOff` preference.

The existing Settings and Shortcuts screens remain the place to inspect and manually edit these same saved values. No new form or wizard is needed. First use requires the running host; running a shortcut additionally requires its configured enabled assistant, project and, for Manager targets, configured Manager. Saving a preference is distinct from completing a native connection, provider turn or credential flow. Closing and reopening the screen reads persisted host state.

## Manager setup requests

In a Manager thread with configuration access, requests for recurring work use GeckIt's saved shortcuts. Manager checks the scheduler's local timezone in capabilities, reads existing shortcuts, saves or edits the schedule using the exact registered project root, and reads back the timetable and enabled state. Both shortcut command forms apply an explicit local request without a confirmation card. Manager creates, edits, renames, archives and restores local employees directly from GeckIt Manager chat or a paired owner chat. Other authorized channel threads show the existing Allow or Refuse card. Manager reads the employee record after saving and reports a refusal without retrying the change.

For local host skills, tools and GeckIt installation or setup work, Manager starts a worker in a project on the requested computer. The worker applies the requested change with its normal permissions, verifies it on that computer, and reports any step that needs a dedicated GeckIt command or a native user decision. Manager uses the supported GeckIt command for any remaining authorized product configuration and verifies the final state before reporting completion. Shared team topics and scheduled Manager runs retain their existing scope.

## 2. Surfaces

| Surface | Change | Visibility |
|---|---|---|
| Worker CLI | `settings schema`, `settings show`, `settings edit --patch ...` | On request |
| Authenticated Manager CLI | Same preference operations, Manager instructions and existing saved-shortcut commands | In capabilities and results |
| Conversation / Manager decisions | No extra Allow card for settings and shortcut operations | Automatic application after validation |
| Existing Settings / Shortcuts on desktop and phone | Same values and controls, host updates as before | When opened |

## 3. States

| State | Condition | What the user sees | Next action |
|---|---|---|---|
| Ready | Host reachable | Current preferences / shortcut list | Request a change |
| Saved | Valid change persisted | CLI saved values or shortcut result; existing screen updates | Read back or use shortcut |
| Invalid | Invalid field, value or timetable | Specific command error; no partial patch | Correct input |
| Conflict | Expected value changed | “Setting theme changed. Read settings show and merge before retrying.” | Read and merge |
| Uncertain | Connection ends before result | “GeckIt closed before answering. Read settings show before retrying.” | Read host state |
| Unavailable | Disabled assistant or unavailable Manager/project | Existing specific command/run error | Choose an available dependency |

## 4. Transitions

```mermaid
stateDiagram-v2
  [*] --> Ready
  Ready --> Saved: valid write
  Ready --> Invalid: rejected input
  Ready --> Conflict: stale expectation
  Ready --> Uncertain: lost response
  Saved --> Ready: read back
  Invalid --> Ready: correct input
  Conflict --> Ready: read and merge
  Uncertain --> Ready: read host
```

| From | Event | To | What the user sees |
|---|---|---|---|
| Ready | Agent submits valid patch/shortcut command; automatically, without user action | Saved | Result and updated existing controls; no Allow card |
| Ready | Host rejects input before saving | Invalid | Specific validation error |
| Ready | Host compares supplied expected values and finds conflict | Conflict | Read-and-merge instruction |
| Ready | CLI loses response | Uncertain | Readback instruction |
| Saved / Invalid / Conflict / Uncertain | Agent reads current state and corrects request | Ready | Authoritative current values |

## 5. Silent states

Validation, persistence and normal host event propagation do not create toasts, approval cards or new notifications. The command result and existing settings surfaces provide feedback. Unrelated team changes, native permissions and Manager delegation decisions keep their current behavior.

## 6. Timing and thresholds

No new product timer. CLI retains the existing 55-second response timeout and reports uncertainty rather than success. Existing schedule and start-window limits remain authoritative; no missed runs are caught up by a settings write.

## 7. Wording

Saved preference response uses `saved: true` with current readable settings. Shortcut operations retain “Added shortcut”, “Saved shortcut”, “Paused shortcut”, “Resumed shortcut”, “Started” and “Removed shortcut” results. Invalid fields say “Setting <field> is unavailable to agents. Run settings schema for supported fields and boundaries.” No success claim precedes persistence.

## 8. Edges

An empty patch is rejected. Arrays replace their named setting; maps merge entries. Unmentioned preferences and shortcut execution history survive. Optional expected values reject stale writes. Unknown fields, invalid enums, negative concurrency, disabled provider choices and invalid schedules fail before saving. Connection loss requires readback before retry. An archived employee keeps existing run restrictions. Manager-target shortcuts retain configured Manager provider and approvals.

## 9. Exclusions

No credential handling, provider enable/install, native permission approval, channel access grants, registration of hosts/projects through the settings patch, configuration import/restart, or new screens. These have dedicated interfaces and existing authority boundaries.

## 10. Decision

The person's explicit request authorizes local preferences, saved shortcuts and team changes within the Manager setup rules above. When required details are missing, Manager asks for those details. GeckIt still requests decisions for remote writes, team changes from regular worker conversations, file/project deletion and actions that trigger native permission rules.

## 11. Acceptance

Both worker and Manager paths advertise and execute the same preference schema. Real host handlers/CLI prove no confirmation, persistence and readback, atomic rejection, partial updates and shortcut execution. Integration fixtures are identified separately from the installed runtime. Existing desktop/phone light/dark interactions are reviewed without restarting the active app.

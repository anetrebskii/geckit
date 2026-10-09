---
type: spec
status: implementation authorized
owner: Alex
created: 2026-10-08
---

# UX: assistant status

## 1. Purpose
The current bottom bar describes only the selected assistant. Long installation/version prose obscures usage and gives no overview of other enabled assistants.

## 2. Surfaces
| Surface | Addition | When visible |
| --- | --- | --- |
| Desktop status bar | Assistant icon, short name, compact reported usage; Assistants opens all details | Board and conversation |
| Phone Tasks | One persistent Assistants disclosure row above the tab bar, with enabled count and current assistant summary | Tasks board |
| Desktop dialog / phone sheet | Each assistant's plan, login/availability, program version/installation and all reported limits | Click/tap status |

## 3. States
| State | User sees | Next action |
| --- | --- | --- |
| Loading | "Checking..." | Wait or keep working |
| Account unavailable | "Unavailable" | Read details; check installation/login |
| Not installed | "Not installed" | Read provider installation information |
| Signed out | "Sign in required" | Read login command in details |
| Ready | Reported window label and percentage, or "Limits unavailable" | Open full details if needed |
| Host disconnected | "Last measured" with host name and available measurement | Reconnect host through existing host management |
| Details open | "Assistants", one section per enabled assistant, "Close assistants" | Scroll, close, or Escape |

## 4. Transitions
```mermaid
stateDiagram-v2
  [*] --> Checking
  Checking --> Summary: account response
  Summary --> Details: press status
  Details --> Summary: Close or Escape
  Summary --> Checking: assistant enabled
  Details --> Details: account update
```

| From | Event | To | Visible result |
| --- | --- | --- | --- |
| Checking | Account resolves automatically | Summary | Own account and usage |
| Checking | Request fails automatically | Summary | "Unavailable" |
| Summary | Click/tap assistant or Assistants | Details | All assistant sections; focus enters dialog |
| Details | Close icon, Escape, outside click, phone sheet dismissal | Summary | Opener regains focus; board position preserved |
| Any | Settings enable/disable assistant automatically | Same surface | Enabled list updates; disabled results do not reappear |
| Any | Existing refresh/event automatically | Same surface | Matching assistant updates only |

## 5. What stays silent
Disabled assistants are absent. Conversation paste/upload errors do not become account status. Details never change the composer selection. Installation paths and reset prose stay out of compact summaries.

## 6. Thresholds and time
Reuse the existing five-minute visible-window account refresh and minute reset-label updates. Desktop summaries scroll horizontally when necessary, with a persistent Assistants action so overflow is discoverable. Phone uses one persistent row above the tab bar to preserve board space regardless of assistant count and keep status reachable on a long board. Long quota names may truncate in this row; the assistant name and reported value remain visible. Do not invent limits when the provider reports none.

## 7. Exact labels
"Assistants", "Checking...", "Unavailable", "Not installed", "Sign in required", "Limits unavailable", "Last measured", "Close assistants". Retain provider-supplied quota names and existing plan/program wording in details.

## 8. Edge cases
Empty settings use the existing Claude fallback. Long names truncate only in summaries and wrap in details. Many quotas scroll inside details. At widths up to 420px, each quota stacks its full name and reset time above its meter and value; neither label nor reset line truncates. SSH Claude accounts retain grouping and host labels; do not merge independent library assistant identities even if they use the same subscription. Failed phone requests remain unavailable until an existing refresh succeeds. Responses after disable/unmount are ignored.

## 9. Deliberately absent
No assistant switching from status: composer owns that action. No expanded multi-row desktop footer: it would consume conversation space. No new polling service or provider protocol.

## 10. Decisions
All assistants are independently visible instead of rotating one automatically; stable identity prevents misattributing quotas. Full metadata moves to details; concise summaries serve at-a-glance comparison. Phone replaces existing selected-provider usage prose with a single disclosure.

## 11. Requirement coverage
FR-001/002: independent summaries and details; FR-003: phone row/sheet; FR-004: explicit states; FR-005: host grouping; FR-006: theme, focus and scrolling; FR-007: shared refresh.

Implementation is authorized by Alex's request to design and implement desktop and mobile together; no separate approval gate is introduced.

## Revision - 2026-10-08

Alex rejected the initial details layout and requested a cross icon and a better page design. This request authorizes implementation of the revision. Replace the visible Done button with a cross icon, accessible label "Close assistants"; Escape/outside click/swipe behavior stays the same. The close control remains in the fixed header on both platforms.

The panel prioritizes assistant identity and plan, then reported quota windows. Each assistant has one compact section. Each quota shows its full name and value, a wide usage bar when a proportion is reported, and reset time beneath. Two quota windows share a row on desktop; mobile uses two columns for short percentage windows and a full-width row for long count/unknown quotas. Long names and values wrap without clipping. Metadata follows limits in a quiet line: CLI version, installation source and measured time, without repeating the assistant's name. Login instructions and unavailable states remain explicit. Independent assistant identities and remote account groupings remain unchanged.

Rejected original layout: large prose-first sections and tiny detached meters made quota comparison difficult; the Done wording suggested task completion. Revision uses a clear dismissal icon and makes usage the visual center.

Revision reviewed in actual component fixtures across desktop and phone, light/dark, 320px narrow screens, long quotas, keyboard focus and scrolling. [Review evidence](../../specs/004-assistant-status/design.md#redesign-verification). Native Electron/iPhone verification remains unavailable.

Spacing correction: desktop panel is 520px wide; a single quota or final odd quota spans the full row. Header, section and card padding is reduced. Short paired quotas remain side by side on both platforms.

## Revision - 2026-10-09: limits in Settings

Alex requested that limits appear only in Settings. This supersedes the board/footer summary surfaces above and authorizes implementation.

| Surface | Change | When visible |
| --- | --- | --- |
| Desktop board and conversation | Remove assistant account/usage footer | Always |
| Phone Tasks | Remove Assistants footer and high-usage alerts | Always |
| Desktop Settings > Assistants | "Account and limits" opens existing full assistant details | Settings open |
| Phone Settings > Assistants | "Account and limits" opens existing assistant sheet, including libraries and remote accounts | Settings open |
| Model details and phone conversation information | Remove account quota sections; retain conversation context and model information | Details open |

The state and detail wording above remain in Settings. Closing details returns focus to "Account and limits". Closing Settings returns to the previous board/conversation. No account measurements, percentages, reset times or high-usage alerts appear on those working surfaces. The conversation's actual limit/error state remains visible because it needs action; working-at-once controls remain orchestration controls. Existing account refresh and reset-label timing apply while Settings account details are mounted. No new thresholds or provider behavior. Missing quotas, disconnected hosts, many providers and long names use existing detail states and scrolling.

Rejected: retaining a compact quota footer or quota sections in chat menus, because these repeat Settings information in the space used for work. Existing shared assistant details are reused so independent library identities and host grouping are preserved. Requirement coverage: Settings-only usage, board/composer space, accessible compact send action.

Revision review: actual PhoneHome, PhoneBoard and PhoneSettings in full screen context with bottom navigation at 391x844 CSS pixels in light/dark; the Tasks footer is absent and Settings opens the shared details sheet. Desktop Settings and account details reviewed at 1200x900 in light/dark with five enabled assistant fixtures. Checked alignment, grouping, density, scrolling, close/Escape and restored opener focus. Fixtures isolate UI from actual account/provider calls. Native Electron/iPhone review was not performed.

Performance review against `docs/performance.md`: no problems found. Existing board row memo/comparisons and current-ref callbacks are unchanged. Removed board quota scans and summary rendering reduce per-render work; no new formatter, sorting/filtering, pointer handling or list is introduced. Pending spinner reuses `Icon`'s compositor span and unmounts after delivery. Existing assistant memo compares individual settings fields and host/plan references. Mobile bundle rebuilt. Live profiling was not needed for these control replacements and removals.

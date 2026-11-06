---
type: spec
status: working tree
owner: Alex
created: 2026-11-06
---

# Board loading and provider refresh

## Why and journey

Opening GeckIt or switching computer must distinguish tasks still being read from a genuinely empty board. After the first read, background refresh must keep existing cards usable. A failed provider read must identify the affected provider and allow Retry without clearing its last successful tasks. This applies to the ordinary desktop Board, List and phone Tasks, including a remote workspace.

## Surfaces and states

| Surface/state | What appears | Next action |
|---|---|---|
| Board/List/Tasks, first read | Spinner and "Loading tasks…"; empty messages and zero counts wait for the read | Wait, or continue using the toolbar |
| Existing tasks refreshing | Compact spinner with "Updating {providers}…"; cards stay in place | Continue working |
| Provider read failed | "Could not update {providers}." and "Showing last loaded tasks." with Retry; if no tasks have been loaded, "Some tasks may be missing."; error detail available in the status | Retry after fixing the provider, or continue with retained tasks |
| Entire list request failed | "Could not load tasks." and Retry | Retry |
| Successful read, zero tasks | Existing contextual empty message; desktop board says "No tasks in these folders yet." | Create a task or change folders |
| Successful populated read | Status goes away | Open a task |

## Transitions

| From | Event | To | Visible result |
|---|---|---|---|
| Opening | List requested automatically | Loading | Loading tasks… |
| Loading/Updating | Provider returns successful data automatically | Ready | Authoritative replacement, including actual deletion; status disappears after all reads |
| Loading/Updating | Provider rejects automatically | Failed | Existing data retained, provider named, Retry |
| Ready | Background reread starts automatically | Updating | Existing cards plus Updating {providers}… |
| Failed | Press Retry | Updating | Same cards; progress replaces failure for retried provider |
| Any | Switch folder or computer | Selected scope | Only relevant providers and folders contribute to status |

## What stays silent

Successful refreshes have no toast. Disabled providers, other folders and individual disk reads are not reported. No percentage is inferred from elapsed time. Ordinary conversation streaming is not a provider refresh.

## Time and wording

Loading appears immediately and ends on an actual response, with no timer or minimum display duration. Existing reduced-motion rules apply. Exact copy is listed in the states table; provider names use the installed provider catalog. Multiple simultaneous failures share one Retry action. Retry does not resend conversation messages.

## Edge cases

Provider data is replaced only after a successful complete read and only for that provider and requested roots. Errors preserve the cache. Duplicate reads for the same roots share one pending read. Incoming session events must not prematurely dismiss an outstanding initial list request. A later successful empty result removes genuinely deleted history. Failed first reads never claim that no tasks exist. Closing the screen does not cancel service work; reopening reads current status. Remote disconnect retains its existing connection treatment.

## Deliberately absent and decisions

No blocking modal, toast on every refresh, fake progress percentage or per-card spinner: the work concerns the list as a whole. Existing cards remain interactive instead of being replaced by skeletons. A compact status above the tasks is used so Board, List and phone communicate the same state without a new view.

## Requirements check

The user's two requests are covered: visible initial loading, and an explanation during provider refresh or failure. The observed premature cross-provider cache clearing is fixed as part of the same change. Paid model calls and provider sign-in are not required to load this status.

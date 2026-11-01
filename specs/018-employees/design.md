# Design: Employees and assigned-session memory

**Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)
**Status**: UX approved by Alex on 2026-11-01 ("делай"); implemented in working tree; verification recorded

## Scope

Named employee roles, generated human portraits, session assignment, employee task filtering, requested access to assigned conversation history and Manager routing. Desktop owns catalog editing; desktop and paired phone share assignment, display, filtering and role/history inspection. Employee identity is independent of AI provider and permission policy.

## Artifacts

- UX document: [docs/ux/employees.md](../../docs/ux/employees.md).
- Layout prototype: [employees.html](../../docs/design/employees.html), interactive Settings/New task/filter with GeckIt stylesheet snapshot and bundled human portraits.
- Specification quality checklist: [requirements.md](checklists/requirements.md).

## Decisions

- Preserve the user's explicit boundary: common GeckIt instructions advertise employees and teach assignment/history lookup; role and history are not appended automatically to each task's user message.
- Reuse GeckIt's existing provider guide mechanism, session metadata and Manager delegation surfaces. Exact architecture belongs in the implementation plan.
- Proposed defaults: one employee per session; catalog across registered projects; current assignment determines memory membership; archive preserves identity and work; phone edits assignment but not the catalog.
- Task cards show only the assigned employee portrait at bottom right, with identity in a tooltip/accessibility label. Cards have no employee selector or unassigned placeholder, per Alex's correction on 2026-11-01.
- Employee settings use a list plus a single form. Daily work uses existing New task/session selectors and top filters. Detailed transitions, copy, keyboard, scrolling and recovery are in the UX document.

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US1, FR-001–003 | UX 1–4, 7–10: employee catalog and archive | Create, edit, restart, archive, restore; stable portrait and identity |
| US2, FR-004–005 | UX 2–4, 8: assignment in New task/header | Assignment saved before dispatch; reassignment does not send a message |
| US3, FR-008–010, FR-018 | UX 1–3, 5–6, 8–10: source-based memory | Find an earlier decision; exclude another role; traverse more than one result page; distinguish partial from empty |
| US4, FR-011–013, FR-017 | UX 1, 3–5, 9–10: managed instruction update | Check create/edit/archive/restore, preserved user instructions, write failure and retry |
| US5, FR-006–007, FR-016 | UX 2–4, 7–8: filters/display on desktop and phone | Cross employee/folder/profile/search; open hidden-by-filter task notification |
| US6, FR-014–015 | UX 1–2, 7–9: Manager delegation | Role read before choice; explicit user assignment wins; existing approval and provider routing preserved |

## Review Evidence

Read repository constitution, canonical feature list, existing Manager UX, profile UX, `client/src/main/guide.ts`, Manager protocol and CLI entry points. GeckIt already writes its own guide linked from Claude/Codex instructions; Manager already delegates via authenticated GeckIt operations. These are implementation anchors, not proof that employee support exists.

Prototype and actual renderer were interacted with and visually reviewed through native Safari in full window context. The renderer fixture was checked in both themes at 1440×900, 1024×768 and phone 390×844, including keyboard/focus, scrolling, long names, empty/error/dirty/archive states. It uses synthetic IPC. Native catalog reload, CLI/socket, assignment and guide behavior have separate isolated integration tests. See [verification.md](verification.md) for exact evidence and unverified live provider, paired phone and SSH boundaries.

The [UX state diagram](evidence/employee-states.svg) rendered successfully with the locally cached Mermaid CLI and was visually inspected as a PNG. It is a behavior diagram, not a layout prototype.

## Open Decisions

Alex approved the presented UX and implementation with "делай" on 2026-11-01, including current-assignment memory membership and cross-project catalog defaults. Portraits: bundled DiceBear Avataaars assets; license/source recorded beside them. Chrome and in-app browser bridges returned "The browser access host is unavailable"; native Safari provided the completed fixture review.

## Planning Handoff

UX approved; specify/design/plan/tasks/analysis/implementation completed. The fixture review establishes rendered behavior, not live inference or paired-device integration.

Planning must preserve no per-task role/history injection, stable employee identity, current source references and truthful partial-history results. Address shared main/renderer contracts, phone call allowlist, session creation before first dispatch, builtins/libraries, authenticated Manager commands and idempotent receipt handling. Review local-source guide isolation before implementing updates: development GeckIt intentionally leaves the installed app's provider guides alone. Verify remote provider access to GeckIt before claiming remote memory support.

Implementation branch: `feat/employees`. No commits/PR/push authorized or performed; no temporary worktree created. Existing modified gecko frames are unrelated and preserved.

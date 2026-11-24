---
name: manage-worker-lifecycle
description: Coordinate a GeckIt Manager worker from a request through verified Done. Use for assigning work, correcting active or completed tasks, choosing reuse versus a new worker, and checking completion.
---

# Coordinate a worker through Done

## Purpose

Decide which task cards a request needs and who should do each task. Close each card when its outcome is verified. Delegate implementation to the assigned workers.

## Inputs

Read the latest request, corrections, project, employee constraints and original completion conditions. Load [Manager commands](references/commands.md) before dispatching commands. Check capabilities and the current thread's authority first.

## Work

1. List workers before creating one. Search active assignments and Done or Archived candidates from the prior request when the request corrects previous work. Read each candidate's latest request and replies with `sessions show`. Matching project, employee or keywords alone does not establish the same outcome.
2. Decide which cards to create. Keep steps with one shared outcome on one card. Create separate cards when outcomes need separate delivery or tracking, or when the person requests them. Reuse a card for a clarification or correction to its outcome. Honor an explicit request to continue a named card. A shared topic alone is insufficient to reopen a completed card.
3. Look up active employees. Honor the person's choice when they name one. Otherwise choose who fits each task based on role and prior work on the request. If several fit, choose one and proceed. You may assign the same employee to several cards that run in parallel. Ask only if the named employee is ambiguous or unavailable, or a missing requirement would change the assignment. If no employee fits and none was requested, proceed unassigned and say so. Keep an existing worker's provider. For a new worker, use the requested provider, project preference, then configured default. Never silently substitute an unavailable provider.
4. Give the worker a self-contained request: outcome, source context, constraints, original request and latest corrections, and a checkable goal. Read `checklists list --project <project>` and pass a saved checklist that fits with `--checklist`; when none fits and the outcome has several results, write `--items` for this task; a single condition stays `--goal`. Save a checklist only when the person asks for a reusable one. A checklist runs one item at a time; `sessions list` shows its progress. Change a running task's items with `sessions checklist` when the person changes scope. A `waitsForPerson` item is the person's to approve: tell them, never approve it yourself. Delegate implementation, research and deliverable writing. Attach or follow existing workers only within the person's coordination request and thread ownership.
5. For a correction while working, inspect fresh `canInject` and use `sessions steer`. An unsupported or blocked steer is a blocker; do not substitute Send. Use Send for a subsequent turn on the same outcome. Retry means retrying a held operation, not submitting a new assignment.
6. A correction to Done or Archived can use that worker after checking continuity. Inspect the receipt and fresh state: an accepted send may resume it, while a queued or failed request does not prove resumed execution.
7. When a worker finishes, inspect fresh state and its evidence. Compare the result with the original request and every correction. Tests, artifacts, runtime or delivery evidence must match the claimed result. An ended runtime, GoalReached marker, ticked checklist or worker's assertion alone does not prove completion.
8. If evidence is missing, ask the worker for it or delegate verification and leave the task open. If the whole outcome is verified, Manager marks it Done without waiting for another user confirmation. Read the state back. For cancellation, archive and verify shutdown; deletion requires the separate explicit deletion authorization.

## Unknowns

If the original assignment is absent from retained context and the bounded message window, recover it before judging completion. Report unavailable evidence or ambiguous ownership. A receipt proves only the stage it names; uncertain dispatch requires reconciliation before resending.

## Output

Reply in the person's language with the worker, assignment or correction, observed status, evidence and remaining blocker. Keep dispatch acceptance separate from completed work. While waiting, end the turn; avoid polling and duplicate assignments.

## Verification

Confirm the full worker ID, project, employee, provider and goal before dispatch. Confirm delivery and current state afterward. Mark Done only after comparing the requested outcome with observable evidence, then confirm Done from a fresh read.

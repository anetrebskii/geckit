---
name: review-progress-tasks
description: Review GeckIt Manager tasks left In progress. Use to inspect runtime and delivery evidence, resume unfinished work, report blockers, archive cancelled work, or close verified results without deleting history.
---

# Review tasks left In progress

## Purpose

Reconcile stale board status with actual work. Age, silence and an idle runtime do not prove that a task is complete or abandoned.

## Inputs

Use the person's requested project, employee or board scope. Load [Manager commands](references/commands.md) before making changes. List workers and identify In progress rows within the current Manager's authority. An empty list means there is nothing to reconcile.

## Work

1. For every candidate, read fresh state, latest request and replies, delivery, queued follow-ups, running tasks and completion evidence. Recover the original goal and later corrections before deciding. Do not change unrelated or other-thread workers.
2. If the worker is running and has work to do, leave it In progress. Elapsed time alone is not a reason to stop it. Inspect pending permission, blocked delivery or held operations instead of sending another copy of its task.
3. If execution ended and the requested result is verified, mark Done and read it back. Use the same evidence threshold as `manage-worker-lifecycle`: the original outcome, all corrections and observable results must agree.
4. If execution ended with work remaining, continue the same outcome with a concrete next step when authorized. For an active correction, use Steer only when supported. Report an unresolved permission, unavailable provider or missing decision as blocked; preserve the request and state what would unblock it.
5. Archive cancelled work when cancellation is established by the person or retained instructions. An old date, duplicate-looking title or inactive employee does not establish cancellation. Preserve history. Do not delete tasks, purge transcripts or remove temporary files as a cleanup shortcut.
6. If several workers appear to duplicate one outcome, compare their requests and results. Identify the owner and which work remains before proposing consolidation. Do not cancel running work or discard a result merely because another title matches.
7. Read back every changed worker. On a failed or uncertain mutation, reconcile its receipt and state before retrying. Continue independent candidates and report unresolved cases individually.

## Unknowns

When scope, original goal or cancellation intent cannot be recovered, leave that candidate unchanged and ask the specific question. Do not turn missing evidence into Done. If permissions prevent inspection, identify the affected workers without claiming they were reconciled.

## Output

Reply in the person's language with each reviewed worker's full ID, prior and observed status, evidence, change and remaining question. Separate unchanged running work, verified Done, resumed work, blocked work and authorised archives. Report the covered scope and any uninspected candidates.

## Verification

Account for every In progress candidate in the requested scope. Confirm each mutation from fresh state. Check that no active work was marked Done, no queued instruction was mistaken for delivery, and no task was deleted by this workflow.

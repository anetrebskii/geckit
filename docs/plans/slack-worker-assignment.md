# Assign employees to Slack digest workers

- Request: assign an employee such as Scotty to a worker owned by the digest thread.
- Checkout: `/Users/alex/Projects/mine/geckit`, `main`, existing checkout.
- Started: 2026-11-23.

## Acceptance conditions

- A scheduled digest reply can resolve an active employee by name and start a worker assigned to that employee. The resulting worker belongs to the digest thread.
- The thread can update the employee assignment on an existing worker it owns. The operation preserves the worker's thread and does not send a turn.
- The thread cannot assign foreign workers or read employee memory through Manager. Archived employees are unavailable for assignment.
- The same employee can run separate tasks at the same time. Existing cards do not cap task creation, and each task has at most one tracking Manager thread.
- Assumption: the same behavior applies to shared Manager threads because they use the same worker ownership rules.

## Progress

1. Updated `docs/ux/manager-threads.md` with the assignment path and refusal states.
2. The workflow uses the existing thread reply and worker status surfaces.
3. Updated the Manager command boundary and capability list. Typecheck, lint for changed code, and isolated service and desktop builds passed.
4. Updated Manager instructions and the worker lifecycle command reference.
5. Proposed an amendment to the existing Manager threads feature entry. Approval pending.
6. Four focused tests passed. The full suite passed 2,287 tests and reported an import failure in the unrelated `board-groups.test.ts` suite. Repository-wide lint flagged existing build scripts.
7. Verified a scheduled Slack digest reply through the real Manager host command path with a simulated provider. Verified active employee lookup, assignment persistence, foreign-worker rejection, archived-employee rejection and restricted employee data. Live Slack delivery remains unverified.
8. No layout changes to inspect.

## Result

- Delivery: local changes for review.
- Follow-up: removed the 2,048-card cap on shared-thread task creation. The regression fixture starts two task cards for Scotty from separate Manager threads with 2,048 existing records. Both cards run concurrently and each appears under a single tracking thread. All 211 Manager tests passed with local sockets enabled. Typecheck, changed-file lint and isolated service and desktop builds passed again.
- Same-Manager check: a simulated Manager response to one Slack reply submitted two start commands for Scotty. GeckIt created two cards and ran both at once under the same tracking Manager thread. Three focused tests passed. This is an available choice when delegating work.
- Manager guidance: updated the worker lifecycle skill and built-in prompt so Manager chooses the cards and assignees. An explicit user choice still applies. All 236 Manager and skill-installation tests passed. Isolated desktop and service builds passed.

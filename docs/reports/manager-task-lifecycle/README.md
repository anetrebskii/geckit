# Manager task lifecycle verification

Verified on 2026-11-10 in an isolated worktree based on main `6f9812c3` (version 1.209, includes PR 71). Implementation commit: `0e971614bb111a6cd1b52bc7603df01939fa090d`.

## Acceptance evidence

| Requirement | Evidence |
| --- | --- |
| Manager owns completion and checks the full goal | Manager startup, continuation and restored instructions require the original goal, latest request and concrete verification evidence before Done. Tests assert that policy. A completed fixture runtime remains outside Done until an explicit Manager mark. This verifies the supplied policy, not a live model's judgment. |
| Cancellation stops work before Archived | Manager operations use Sessions.archive. A delayed shutdown test proves archive waits, clears pending sends and blocks racing sends. Failure keeps the task outside Archived. The service integration launches a real fixture child process, archives through the compiled Manager CLI and checks that the child PID exits and the queue is empty. |
| Archive preserves the conversation | No provider deletion call. The integration restarts the actual service and reads the original request and correction from the persisted transcript. |
| Done and Archived resume automatically | Unit tests cover both terminal states. The compiled CLI integration sends corrections into the same ID and observes In progress. The actual React renderer also shows both transitions after Send. |
| Independent work gets a new session | Instructions require reading recent context before reuse; project, employee or keyword similarity is insufficient. Integration starts an independent request, checks a different ID and checks transcript isolation. Semantic selection by a live Manager remains unverified. |
| Existing deletion behavior remains | Existing deletion tests run against the shared cancellation helper. Attribution continues through the existing trusted origin. |

## Checks

- Typecheck, lint and production build passed.
- Full serial suite after rebasing onto PR 71: 1850 passed, 2 skipped (141 files passed, 2 skipped).
- Final integration rerun after adding the completed-runtime assertion: 1 passed, 8 unrelated tests skipped.
- Browser: actual React renderer and real isolated service/RPC/persistence, fixture provider and native bridge. Checked Done and Archived Send transitions, retained transcript, keyboard Enter, focus, light/dark appearance, default desktop, 900 x 700 and phone 390 x 844. Reviewed full-screen hierarchy, spacing, wrapping and accessible actions. No new layout was introduced.
- UX Mermaid graph rendered successfully.

The fixture child process is real; its model output is controlled. These checks do not establish native account integration, production Manager decision quality, updater delivery or the currently running production version.

## Screenshots

- [Desktop light](desktop-light.png)
- [Desktop dark](desktop-dark.png)
- [Narrow desktop](desktop-narrow.png)
- [Phone dark](phone-dark.png)
- [Phone light](phone-light.png)
- [UX diagram](ux-diagram.png)

## Delivery boundaries

PR 71 merged independently before this branch was rebased; its release was not modified. No TwinsAI Bot files or notification application were touched. The canonical feature list remains unchanged pending Alex's approval of the proposed entry.

Live coordination through `geckit-local manager send` and live service inspection through `service status` were denied to this worker role with “Operator access denied”. No role or native approval was bypassed. Production verification must occur through an authorized Manager/operator after normal protected integration and release.

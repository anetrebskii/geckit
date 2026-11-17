# Checklist handoff after an edit during work

## Report and cause

The task inspector showed "Deployed to development" as Next after the assistant finished, and the current Codex session had no native goal. `Sessions.#advance` returned when the conversation was working or had queued messages. Once the edit's settling timer had fired, no pending handoff remained and a normal turn ending did not retry it. The same failure was reproduced with Codex and with queued Claude messages before changing production code.

## Change

Keep a pending handoff on the live conversation when advancement is deferred by work or queued messages. Retry it after a normal turn ends. Read the current checklist at retry time so later edits and clearing it are respected. Stop, failed turns and usage limits do not initiate the deferred handoff. This restores the approved behavior in [task-checklists.md](../ux/task-checklists.md).

## Verification

- Two regression tests failed before the fix: adding a Codex checklist during work and waiting for queued messages before activation.
- Seven added cases pass: Codex goal plus message dispatch, queued-message order, Stop, failure, usage limit, latest settled edit and a cleared checklist.
- Full `npm test` passes with local socket access. The restricted run could not exercise local socket and filesystem watcher integration tests and was stopped; the unrestricted run exited successfully.
- `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check` pass.
- These tests use injected providers. They prove session orchestration and dispatch calls, not a live Codex goal round trip or deployment to either bot VM.
- No renderer markup or styling changed. The running GeckIt backend has not been restarted, so live checklist activation remains unverified and requires loading the updated backend after active work has ended.

Session: Codex `01a1e5d2-ed63-7b63-9dee-f2a35a7a336f`.

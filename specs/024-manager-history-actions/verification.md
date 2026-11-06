# Verification: Manager conversation history actions

Branch `feat/manager-history-actions`; worktree `/private/tmp/geckit-manager-history`; initial base `eb2efdbb` (sole integrator's delivery branch). Actual Codex session `01a1af1d-da13-7291-ae5c-c3191397e442`.

## Corrected scope

Delete a selected conversation with Manager itself, or clear its full history and native context. Prior `ab1cc236` (integrated into base as `3db813cc`) only implements deletion of worker sessions; it is preserved and does not satisfy this feature. No live user conversations may be mutated by verification. Sole integrator `codex:01a1af24-e587-7bd2-a795-9c490d3fd814` owns main delivery and restart.

## Acceptance record

Implemented and exercised on disposable fixture data. Automated check totals and observable evidence follow.

| Surface | Required observable proof | Result |
| --- | --- | --- |
| Desktop/phone selected conversation | Both actions reachable through actual Manager UI | Pass; see evidence below |
| Cancel/confirm each action | Cancel retains exact history/runtime/queue; confirm changes selected only | Pass; see evidence below |
| Active/empty | Active stops and queue cancels; empty remains safe | Pass; see evidence below |
| Native context | Old current/previous backing IDs purged; next turn uses fresh ID without old reconciliation | Pass; see evidence below |
| Durable state | Reload/restart cannot restore history, operations, queued input or late completion | Pass; see evidence below |
| External places | Clear keeps binding; delete old row absent through startup; next same-place inbound fresh incarnation/context | Pass; see evidence below |
| Slack/Telegram | No earlier/quote-cache reinjection; unsent stale outbox and callback references fenced | Pass; see evidence below |
| Preservation | Other thread/workers/projects/settings/employee assignments survive | Pass; see evidence below |
| UI polish | Full screen light/dark desktop/phone, keyboard/focus/scroll | Pass; see evidence below |

## UX validation

[State diagram](evidence/ux-state-diagram.png) rendered successfully through GeckIt Browser in a task-owned test tab; `svg` present and no Mermaid error. Diagram tab/server closed. The optional local Mermaid CLI render could not find its downloaded Chromium; required render was completed through GeckIt Browser instead, without changing project dependencies.

## Boundaries

A browser fixture may substitute unavailable native APIs; its results must be labeled separately from real Manager/store/provider integration checks. Fake native RPC proves invocation and context identity, not real provider account erasure. External server messages and already accepted remote HTTP cannot be retracted by local history reset. No native permissions are changed or answered on behalf of Alex.

## Observable UI and host evidence

Task-owned GeckIt Browser tab 3087200012, desktop 1440x900 and phone 390x844, with full-screen light/dark review. The preview uses the production Manager, Sessions, disk notes store and HTTP bridge in a separate process and a fresh temporary directory. Only the native provider is substituted: it writes real disposable transcript files and records session IDs, resume flags, dispatched prompts, shutdown and deletion. This is neither a live provider-account test nor deletion of user conversations.

- Active GeckIt clear: Cancel preserved the full ledger, including queue, native sessions and disk notes. Confirm stopped the selected runtime, canceled its queue and removed its native transcript; the next actual composer request used a fresh ID with `resume=false` and contained neither the removed message nor canceled queued input.
- Active Slack delete: confirmation named Planning fixture / Slack; actual UI confirm removed only that row and native transcript. Telegram and fresh GeckIt transcript survived. Host reconstruction on the same directory and renderer refresh did not restore the deleted row.
- Phone: both actions are reachable; clear on active and already-empty GeckIt conversation, delete on empty GeckIt conversation, Cancel and confirm exercised. The default GeckIt slot remains available empty after delete. A restart may generate a fresh global task-state reconciliation event; removed conversational messages and old queued requests were absent from its fresh native input.
- Provider failure: real selected purge called a deliberately failing fake native delete; UI showed the error, did not report success and blocked reuse of old context. Same-action retry after restoring the fake provider succeeded, with no outstanding purge metadata.
- Keyboard: initial Cancel focus, Tab to confirm and wrap back to Cancel, menu ArrowDown/Enter and Escape. Found and fixed nested Escape closing outer Manager; retest kept Manager open and restored Conversation actions focus. Cancel delete left every ledger field unchanged.
- Full-screen review: target and consequences readable, no clipping or horizontal overflow in desktop/phone light/dark. Short phone 390x560 check kept the long error dialog and action buttons reachable; normal 390x844 retained. Existing design-system Menu, dialog, quiet/danger buttons and tokens reused.

Machine-readable assertions: [ui-host-results.json](evidence/ui-host-results.json). Rendered evidence: [desktop light clear](evidence/desktop-light-clear.png), [desktop dark external delete](evidence/desktop-dark-delete.png), [phone light clear](evidence/phone-light-clear.png), [phone error](evidence/phone-light-cleanup-error.png), [phone dark empty delete](evidence/phone-dark-delete-empty.png). Screenshots were visually inspected, not used as sole proof of mutation.

## External-place semantics and limits

Clear preserves the binding and incarnation. Delete removes the selected local incarnation; next genuine same-place input creates a new empty incarnation after the persisted cutoff. Slack reset watermark/revision persists across restart; old thread events/history are filtered. Telegram cached replies, pending callbacks/input and unsent old output are cleared/fenced, including restart recovery. A strictly older raw Telegram input is rejected by its server timestamp. Telegram timestamps have one-second precision: an unobserved raw message from the same second as reset can be treated as a new input. It cannot revive the removed native context or cached history. External server messages and HTTP sends already accepted by the remote service remain there. Channel tests use real bridge code with fake channel transport; no live Telegram/Slack account mutation was performed.

## Performance review

Reviewed docs/performance.md against this diff. New controls are rendered once in the selected Manager header and the confirmation mounts only while open. No per-card/row scans, new formatters, long-running animations or list rendering paths were added. Existing memoized history rendering remains in use. The 250ms polling is opt-in preview infrastructure only. No production performance claim or live-app profiling result is made. Phone build is required because shared chat sources changed.

## Automated checks

- `cd client && npm test -- --maxWorkers=1`: 126 test files passed, 1729 tests passed, 2 skipped; 86.92s. Includes actual compiled authenticated core service RPC (`manager:configure`, `sendApp`, `history`, `inspect`) on disposable provider fixtures, stale-target rejection and preserved sibling transcripts. No live account accessed.
- Settled Telegram source rerun: `npm test -- test/telegram.test.ts`, 51 passed, 7.02s, including unrelated paired-place preservation and reset/restart cases.
- `npm run typecheck`: all four TypeScript configurations passed. `npm run lint` and `git diff --check` passed.
- `cd client && npm run build`: service/main/preload/all renderers passed. `cd mobile && npm run build`: passed in 2.11s; existing large-chunk warning only.
- Native Codex fake-RPC test verifies old native transcript deletion/unsubscribe and fresh session creation. Store/native-provider failures are labeled simulated; installed-app IPC and real provider-account erasure were not exercised because this delivery must not restart or mutate Alex's application.

Raw local logs: `/private/tmp/geckit-manager-history-{tests-final,telegram-final,typecheck,lint,build,mobile}.log`. UI tab and temporary preview server were closed; shared test browser and user app left running. Worktree and disposable evidence data retained for review. `docs/features.md` remains unchanged pending the separately proposed optional entry; implementation and commit are independent of that answer.

# Manager conversation history actions

Branch: feat/manager-history-actions. Date: 2026-11-06. Status: implementation.

Alex clarified that the target is Manager's own conversations, not workers. Prior ab1cc236 is a separate worker-delete function and is retained in base eb2efdbb.

## User story

Select one Manager conversation in UI; delete it or completely clear its history and native context after distinct confirmation. After refresh/restart and a new input, removed history cannot return. Work and global configuration survive.

## Requirements

- FR-001: Both actions reachable through selected Manager conversation UI on desktop/phone.
- FR-002: Named target, clear consequences, Cancel/confirm, keyboard/focus, truthful pending/error.
- FR-003: Purge durable Manager history and all linked backing sessions; fresh native context, no old reconciliation.
- FR-004: Stop selected active response, cancel its queue/product operations and fence late events/open/execute/outbox callbacks.
- FR-005: Preserve other conversations, project registry/files, workers, employee assignments and settings; preserve native worker permission authority.
- FR-006: Clear retains binding; delete external removes old incarnation. Same external place next request creates empty fresh thread, without old Slack context/Telegram reply cache or old worker subscriptions.
- FR-007: Isolated rendered UI checks both operations/cancel/confirm/empty/active/refresh/restart, themes/sizes/keyboard/scroll; real disk/host/provider-boundary tests and local commit handoff. No production delete/push/restart.

## Acceptance

Named selected Manager thread alone changes; cancel changes nothing; clear empties history and rotates native context; delete hides removed incarnation and next inbound is empty; queued/late/restart data cannot resurrect. Other worker/settings/sentinel artifacts remain byte-equivalent where applicable. Unconfirmed provider/storage cleanup reports failure and fences old context until deliberate cleanup retry.

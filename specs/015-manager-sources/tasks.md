# Tasks: Manager sources
## Setup
- [x] T001 Read instructions/research, claim day-plan, fresh base and owned worktree.
- [x] T002 Define spec/design/UX/prototype and contracts in specs/015-manager-sources.
## Foundation / US1
- [x] T003 Add shared contracts and schedule/source regression fixtures in client/src/shared and client/test.
- [x] T004 Implement safe Voice Memos snapshot/local transcription and persistent baseline/revisions in client/src/main.
- [x] T005 Implement singleflight scheduler/restart cleanup, preserve manual queue.
## US2
- [x] T006 Add restricted validated classification, paired Telegram decisions and durable three outcomes.
- [x] T007 Test callback authority, all outcomes and crash/doubleclaim/restart integration.
## US3
- [x] T008 [P] Implement actual Manager Settings schedule/source/status form in renderer.
- [x] T009 Browser interaction/full context light-dark keyboard/scroll/viewports and performance review.
## Delivery
- [x] T010 Run required client/mobile checks, inspect diff/security and record real integration limits.
- [x] T011 Commit/push/PR, verify remote, preserve artifacts, remove only owned worktree, day-plan In review.

Dependencies: T001->T002->T003->T004/T005->T006->T007; T008 follows contracts independently; T009 follows T008; T010 follows all then T011. No new agents required beyond strict TypeScript ownership.

Delivery: PR https://github.com/anetrebskii/geckit/pull/43; retained branch `feat/manager-source-intake`. Final remote head, owned-worktree removal and day-plan review record are verified by the delivery session after this commit; evidence remains outside the worktree.

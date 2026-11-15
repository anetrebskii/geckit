# Tasks: Shortcut result destinations

## Phase 1: Setup

- [x] T001 Read repository/app/provider/channel instructions and record task ownership in day plan.
- [x] T002 Specify requirements and behavior in specs/031-shortcut-destinations/spec.md and docs/ux/shortcut-destinations.md.

## Phase 2: Foundation

- [x] T003 Define shared optional destination/run and module publication contracts in client/src/shared and client/src/main/channels/channel-api.ts.
- [x] T004 Preserve ownership and native-key binding in client/src/main/manager.ts without changing source backing sessions.

## Phase 3: US1 - Save and inspect destinations

- [x] T005 [US1] Test and implement persisted validation/readback, legacy and capability checks in client/src/main/shortcuts.ts, store.ts and shared/shortcut-save.ts.
- [x] T006 [US1] Extend existing CLI/schema/interfaces in client/src/core/product-shortcuts.ts, main/employees.ts and API wiring.
- [x] T007 [US1] After UX approval, extend real desktop/phone shortcut editors and browser fixture with destination controls and saved summaries.

## Phase 4: US2 - Deliver and continue each run

- [x] T008 [US2] Test and implement durable run admission, immutable snapshots, actual completion and recovery in client/src/main/shortcut-runs.ts and core/runtime.ts.
- [x] T009 [P] [US2] Implement Discord/Slack publication and native-key route restoration in client/src/main/channels; use native receipts and existing authorization.
- [x] T010 [US2] Prove authorized inbound reply reaches actual Manager context/original worker; two-run isolation and Manager-target completion in client/test.

## Phase 5: US3 - Failures and truthful evidence

- [x] T011 [US3] Prove disabled/deleted destination, permission errors, ambiguous sends, cleaned/long results, duplicate events, restart and legacy behavior in client/test.
- [x] T012 [US3] Review actual desktop/phone render and normal interactions in light/dark at 1280x900 and 390x844; record performance review in docs/reports/shortcut-destinations.md.

## Phase 6: Delivery

- [x] T013 Run required focused/full tests, typecheck, lint, safe scratch desktop/service and mobile builds; preserve unrelated changes.
- [x] T014 Audit FR-001 through FR-012/SC-001 through SC-004 and record exact mock/live evidence plus real-channel blockers in docs/reports/shortcut-destinations.md.
- [x] T015 Follow authorized repository delivery workflow and update day plan; no merge/deploy or runtime restart.

## Dependencies and strategy

T003 precedes T004-T006/T008/T009. T004/T008/T009 precede T010/T011. T007 waits for UX approval; T012 follows it. T013-T015 follow implementation. T009 can run alongside lifecycle work after contract agreement. US1 is independently tested by save/reload, US2 by two completions and continuations, US3 by refusal/restart/uncertainty fixtures. Full objective remains all stories; no reduced MVP substitutes for requested scope.

Delivery: draft [PR #87](https://github.com/anetrebskii/geckit/pull/87), implementation commit b3b4cea. No task temporary worktree existed; permanent checkout and unrelated edits retained. Live channel checks remain unverified with their exact required safe destination documented in the report.


## Authorized live follow-up

Alex approved test threads in the originating Discord #general on 2026-11-15. Existing T010 is compositional fixture proof, not live acceptance. Read-only discovery was attempted, but this worker received operator-access refusal and could not read the supplied Manager session. No external write was made.

- [ ] T016 Resolve verified guild ID and parent #general stable ID for source thread 1571525680355606641 through authorized native/Manager read-only access; never select by name alone.
- [ ] T017 Establish an operator-provisioned isolated runtime for this branch with real provider and connected Discord/broker, without restarting the working GeckIt or duplicating its bot gateway consumer.
- [ ] T018 Complete two real runs, preserve native receipts/links, obtain real Alex replies in their threads, and verify original-worker Manager continuation and cross-run isolation.

Blocked details and exact missing parent URL/runtime preparation are in the report. Test publication is authorized; destination attribution and runtime access remain unresolved. Entire live acceptance is not complete.

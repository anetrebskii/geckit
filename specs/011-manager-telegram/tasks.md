# Tasks: Manager and Telegram V1

**Input**: [spec](spec.md), [plan](plan.md), [design](design.md), [data model](data-model.md), [contracts](contracts/interfaces.md), [quickstart](quickstart.md).

## Phase 1: Setup

- [x] T001 Record V1 scope and inspect architecture/design in specs/011-manager-telegram/plan.md.
- [x] T002 Define typed contracts and ownership in client/src/shared/manager.ts and specs/011-manager-telegram/contracts/interfaces.md.

## Phase 2: Foundation

- [x] T003 Add offline restriction/routing/persistence behavioral checks in client/test/manager.test.ts and focused manager test modules (FR-002-004/027-029/033).
- [x] T004 Implement disabled-tool manager runtime and validated fixed-CLI gateway in client/src/main/sessions/ and client/src/main/manager*.ts (FR-003-004/028/032).
- [x] T005 Persist manager identity/ownership/activity and project provider preference in client/src/main/manager*.ts and client/src/main/store.ts (FR-019/029/033).

## Phase 3: US1 - Set up and talk to one manager

Goal: enable an eligible provider/model, open the actual session and manage all registered projects. Independent check: enabled Claude setup, nondefault model and one visible backing session across reopening.

- [x] T006 [US1] Implement enabled provider/model eligibility and lifecycle in client/src/main/manager*.ts (FR-001-005/030-031).
- [x] T007 [P] [US1] Add Manager settings, navigation and same-session header/composer in client/src/renderer/src/chat/ and client/src/renderer/src/ui/SettingsDialog.tsx (FR-001-002/026/030-031).
- [x] T008 [US1] Expose management discovery, projects/files and provider preferences through client/src/cli/ (FR-004-005/032-033).

## Phase 4: US2 - Coordinate workers

Goal: automatic delegation with provider routing and evidence-bearing updates. Independent check: two workers in different projects, follow-up/stop and targeted question handling.

- [x] T009 [US2] Implement start/follow-up/stop/status and explicit enabled provider dispatch in client/src/cli/ and client/src/main/manager*.ts (FR-006-008/027/033).
- [x] T010 [US2] Add worker event wakeups, bounded summaries and question/native-permission handoff in client/src/main/manager*.ts (FR-009-012/025/029).
- [x] T011 [US2] Verify routing precedence, disabled/remote mismatch, existing worker continuity and unavailable management capabilities in client/test/manager*.test.ts (SC-002-003/009-011).

## Phase 5: US3 - Connect a personal bot

Goal: verify and securely store a bot, pair exactly one private account. Independent check: fake API plus real temp store, exact candidate confirmation and rejection of all other senders.

- [x] T012 [P] [US3] Implement encrypted token storage, verified identity, temporary pairing and sender authorization in client/src/main/telegram*.ts and client/src/shared/telegram.ts (FR-013-014/021/028).
- [x] T013 [US3] Add trusted desktop token/pairing/cancel/disconnect UI in client/src/renderer/src/chat/ and client/src/renderer/src/ui/ (FR-013-014/021/024/026).
- [x] T014 [US3] Cover invalid/revoked/conflicting receiver, expiry, storage failure and unpaired/group inputs in client/test/telegram*.test.ts (SC-007).

## Phase 6: US4 - Delegate and decide through Telegram

Goal: use one conversation from bot and desktop. Independent check: text, status/pause/resume, bound decisions, stale work and unsupported attachment responses.

- [x] T015 [US4] Wire receiver/outbound manager events and typed IPC/phone bridge in client/src/main/index.ts, client/src/main/asked.ts and client/src/preload/index.ts (FR-015-018/025-026).
- [x] T016 [US4] Implement command/decision/late-message behavior with safe unknown-delivery handling in client/src/main/telegram*.ts (FR-011-012/015-018/022-023).
- [x] T017 [US4] Verify cross-channel duplicate decisions, unsupported payloads, honest links and uncertain send behavior in client/test/telegram*.test.ts (SC-004-005/007).

## Phase 7: US5 - Recover ownership

Goal: retain state and prevent duplicate actions after compaction/restart. Independent check: fresh manager store, paused input and duplicated worker events.

- [x] T018 [US5] Implement serialized inbox, durable task ownership and restart/compaction recovery in client/src/main/manager*.ts (FR-018-022/029).
- [x] T019 [US5] Test pause/resume, duplicate effects and interrupted input reconciliation in client/test/manager*.test.ts (SC-004/006).

## Phase 8: US6 - Change or revoke

Goal: change manager settings without migrating/stopping workers; revoke bot/task access. Independent check: model change, explicit restart and disable retain workers; removed projects stop new access.

- [x] T020 [US6] Implement settings/restart/revocation semantics in client/src/main/manager*.ts and client/src/main/telegram*.ts (FR-020/023-024/030-031).
- [x] T021 [US6] Add confirmations and phone-visible lifecycle in client/src/renderer/src/chat/ and shared phone navigation (FR-026/030-031).

## Phase 9: Verification and delivery

- [x] T022 Run required checks/builds and CLI boundary acceptance; record actual results in specs/011-manager-telegram/verification.md.
- [x] T023 Review actual renderer light/dark interactions/focus/scrolling at desktop/phone sizes and performance checklist; record evidence in specs/011-manager-telegram/verification.md.
- [x] T024 Reconcile V1 coverage/remaining limitations and feature audit in specs/011-manager-telegram/design.md and docs/feature-audit.md; propose exact implemented entry to Alex before changing docs/features.md.

## Dependencies and parallel execution

T001-002 precede foundation. T004-005 gate core story runtime; renderer and Telegram isolated modules may develop against the frozen contract independently. US2 follows US1; US4 follows US2/US3; US5/US6 reuse foundation and integrate before final checks. T012 and T007 own disjoint files and can run in parallel; main/preload integration has one owner to avoid collisions. Tests run before claimed completion of each story. T022-024 follow integration.

## Implementation strategy and acceptance limits

Deliver US1+US2 first as a real CLI-only manager, then connect Telegram and recovery. Unsupported advanced CLI domains are explicitly deferred V1 scope; do not mark the complete long-term spec satisfied. Offline provider/bot tests, rendered native-boundary fixtures and real signed-in integration results must remain distinct. All V1 implementation tasks are complete; their checks are recorded in verification.md. Full long-term success criteria and live-account trials remain outside this verified delivery.


## Enabled-provider follow-up

- [x] T025 Replace the Claude-only Manager gate with existing enabled builtin/library session runtime, manager role instructions, provider-aware model application and replacement/recovery tests.
- [x] T026 Update real Manager settings/provider models and confirmed assistant change UX; preserve actual provider labels, workers and decisions.
- [x] T027 Verify provider dispatch and switch behavior through focused tests, required checks and actual renderer in both themes; reconcile docs and day-plan evidence.

## Telegram-only follow-up

- [x] T028 Remove Desktop/phone Manager conversation/navigation and public chat APIs; hide current/archived backing sessions while retaining ordinary workers.
- [x] T029 Retain Desktop Settings setup, Telegram pairing/status and lifecycle recovery without navigating into chat; verify enabled-provider behavior remains.
- [x] T030 Verify all removed entry points, stale routes, Settings/worker interactions, required checks/builds and actual renderer in both themes; reconcile docs and day-plan.


## Telegram approvals and setup follow-up - 2026-10-19

- [x] T031 Project supported live native permissions/empty-field elicitation into task-bound Telegram actions; preserve native grants/guard semantics and reject stale, duplicate, unauthorized and replaced requests.
- [x] T032 Reproduce and normalize excess blank Telegram output/chunk edges while preserving meaningful paragraphs and code.
- [x] T033 Guide personal-bot creation, masked token entry and exact account pairing in existing Settings; document shared-bot architecture boundary.
- [x] T034 Verify native/Bot API contracts and actual Settings renderer light/dark, keyboard/focus, failure/cancel/retry and scrolling; record integration limits and day-plan.

## Desktop Manager inspection follow-up - 2026-10-19

- [x] T035 Add deliberate current-session inspection API/events without exposing archived sessions, role prompts or phone/public chat paths.
- [x] T036 Add desktop bottom-bar entry and actual transcript inspection with identity/status, settings recovery, cancellation/focus and bounded live updates.
- [x] T037 Verify actual light/dark renderer, live/error/empty/replaced/disabled states, keyboard and scrolling; run required checks and update evidence/day plan.

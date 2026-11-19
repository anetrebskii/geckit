# Tasks: Manager token economy

**Input**: Design documents from `/specs/037-manager-token-economy/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, design.md, quickstart.md

**Tests**: Included. research.md Decision 8 and quickstart.md require vitest coverage of every story (Constitution III).

## Phase 1: Setup

- [x] T001 Add the "Keeping Manager cheap" section to docs/ux/manager-threads.md: milestone wake rules, grouping, compaction (threshold, timing, "Compacting" state), limit reset ("Limit reset. Continues with the next message."), Setup row wording, all copied from specs/037-manager-token-economy/contracts/manager-setting-and-wording.md

## Phase 2: Foundational

- [x] T002 Create client/src/main/manager-economy.ts exporting pure functions used by all stories: `taskLabel(task)`, `updateLine(worker, now)`, `isMilestone(worker, before, tasks, pendingForManager)`, `groupUpdates(messages)`, `shouldCompact(state, used, compactAt)`, `validCompactAt(value)`

## Phase 3: User Story 1 - Manager wakes for what matters about a worker (P1)

**Goal**: A worker wakes Manager only on milestones, with short task labels.

**Independent Test**: A tracked worker whose background tasks end while it keeps working produces no Manager message; one message when it goes idle.

- [x] T003 [P] [US1] Unit tests for `isMilestone`, `taskLabel` and `updateLine` in client/test/manager-economy.test.ts (task ends while working: false; task asks: true; idle after working, failed, blocked, goal change, unread: true; label at most 120 characters, no command text)
- [x] T004 [US1] Implement `taskLabel`, `updateLine`, `isMilestone` in client/src/main/manager-economy.ts per research Decisions 1-2
- [x] T005 [US1] Use `isMilestone` and `updateLine` in `observeSessions` in client/src/main/manager.ts, keeping the stored signature update so a suppressed task change is not reported later
- [x] T006 [US1] Scenario tests in client/test/manager.test.ts: background task ends while working sends nothing; worker then idle sends one update whose tasks carry labels

## Phase 4: User Story 2 - Updates that arrive together are one Manager turn (P1)

**Goal**: Queued worker updates in one thread go to Manager in one turn.

**Independent Test**: Five queued updates produce one `sendManager` call; a person's message between them keeps its own turn.

- [x] T007 [P] [US2] Unit tests for `groupUpdates` in client/test/manager-economy.test.ts (contiguous event run, stops at a non-event message, latest line per worker, order kept, request-bound events not mixed)
- [x] T008 [US2] Implement `groupUpdates` in client/src/main/manager-economy.ts per research Decision 3
- [x] T009 [US2] In `#dispatch` in client/src/main/manager.ts, deliver a grouped run of event messages as one turn, marking every grouped message sending and then sent
- [x] T010 [US2] Scenario tests in client/test/manager.test.ts: five updates queued while busy become one turn; person's message between updates stays separate

## Phase 5: User Story 3 - Manager's conversation stays a bounded size (P1)

**Goal**: GeckIt compacts a Manager thread at `compactAt` through the assistant contract.

**Independent Test**: A thread whose turn reports `spend.used` at or above the threshold triggers one `compactManager`; messages wait; next turn carries the durable record.

- [x] T011 [P] [US3] Add `compactAt` to `ManagerConfig` and `DEFAULT_MANAGER_CONFIG` (240000) in client/src/shared/manager.ts, with `validCompactAt` enforcement in `Manager.configure` in client/src/main/manager.ts
- [x] T012 [P] [US3] Add `compactAt` to `schemas.manager.patch` in client/src/core/product-cli.ts and to configuration transfer in client/src/shared/configuration.ts if it lists Manager fields
- [x] T013 [P] [US3] Add `readonly compacts: boolean` to `LlmProvider` in client/src/main/sessions/provider.ts and `compact?(): Promise<void>` to `Driver` in client/src/main/sessions/heard.ts; default `compacts` false where plugin providers are wrapped
- [x] T014 [US3] Implement `compact()` on the Claude stream driver in client/src/main/sessions/claude.ts (send `/compact`, resolve on the following result, reject on error) and set `compacts: true` for the built-in Claude provider (done instead by `Sessions.compactManager` sending `/compact` through the existing Claude stream; no new driver method)
- [x] T015 [US3] Implement `compact()` on the Codex driver in client/src/main/sessions/codex.ts via `thread/compact/start`, and set `compacts: true` for built-in Codex (done instead through the Codex driver's existing `/compact` interception, which calls `thread/compact/start`)
- [x] T016 [US3] Add `Sessions.compactManager(id)` in client/src/main/sessions/index.ts: refuses for non-Manager, busy, or non-compacting assistants; calls the live driver's `compact`
- [x] T017 [P] [US3] Unit tests for `shouldCompact` and `validCompactAt` in client/test/manager-economy.test.ts
- [x] T018 [US3] In client/src/main/manager.ts: count completed turns in `#output`; after a turn, when idle and `shouldCompact`, set `live.compacting`, call `compactManager`, record `compaction`, set `restore`; hold `#dispatch` while compacting; prefix the next delivered message with the restart record when `restore` is set; stale `running` compaction loads as `failed`
- [x] T019 [US3] Scenario tests in client/test/manager.test.ts: compaction at threshold, message waits during it, failure leaves no thread error and no second attempt before a new turn, `compactAt: 0` and `compacts: false` do nothing, next turn includes the record
- [x] T020 [P] [US3] Document `compacts` and `compact()` in docs/provider-plugins.md (capabilities row and a "Compaction" subsection per contracts/assistant-compaction.md)
- [x] T021 [US3] Add the Setup row "Compact conversation at" (number, off switch, note, unsupported-assistant line) to `ManagerSettings` in client/src/renderer/src/chat/Manager.tsx, used by desktop and phone Setup
- [x] T022 [US3] Add the "Compacting" state to the view (`ManagerView` thread fields in client/src/shared/manager.ts) and `managerStand` in client/src/renderer/src/chat/manager-label.ts

## Phase 6: User Story 4 - Nothing restarts by itself after a usage limit (P2)

**Goal**: At a reset, only waiting real messages start a turn.

**Independent Test**: Reset with only worker updates queued: no turn, state "Limit reset"; a channel message waiting: one turn with reconciliation.

- [x] T023 [US4] In client/src/main/manager.ts, change `#awaitLimit` to set `limit.reset` at `until + 5 s` instead of scheduling recovery; in `#dispatch`, for a reset thread deliver only when a non-event message waits, prefixed with the existing limit reconciliation text, then clear the limit; `#canRecover` does not recover a reset thread
- [x] T024 [US4] Show "Limit reset" / "Limit reset. Continues with the next message." for a reset thread in client/src/renderer/src/chat/manager-label.ts and expose the flag in the Manager view
- [x] T025 [P] [US4] Add the rule against scheduling its own continuation after a limit to the Manager instructions in client/src/prompts/
- [x] T026 [US4] Scenario tests in client/test/manager.test.ts: reset with only events waiting starts nothing; reset with a channel message delivers one turn with reconciliation; Retry still works

## Phase 7: Polish & Cross-Cutting

- [x] T027 Run `npm run typecheck`, `npm run lint`, `npm test` in client/ and fix failures
- [x] T028 Review the Setup row in the running app in light and dark, desktop and phone widths, and run the performance-review skill against docs/performance.md
- [x] T029 Update docs/feature-audit.md evidence and propose the docs/features.md entry to Alex (audit done; features.md entry awaits approval)
- [x] T030 Mark completed tasks in specs/037-manager-token-economy/tasks.md and record results in the day plan

## Dependencies

- T001 before UI tasks T021, T022, T024.
- T002 before every story.
- US1 (T003-T006) and US2 (T007-T010) are independent of each other and of US3/US4; together they are the MVP.
- US3: T011-T016 before T018; T018 before T019; T021-T022 after T011.
- US4: independent of US3 except both edit `#dispatch` in manager.ts (do sequentially).
- Phase 7 last.

## Parallel examples

- US1 and US2 tests: T003 and T007 in the same new test file but separate `describe` blocks.
- US3: T011, T012, T013, T020 touch different files.
- US4: T025 alongside T023.

## Implementation strategy

1. MVP: T001-T010 (milestones and grouping). Largest saving, no new setting.
2. Then US3 (compaction and contract), then US4 (limit reset).
3. Validate each story with its scenario tests before the next.

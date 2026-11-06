# Tasks: Manager single-session deletion

Input: spec.md, design.md, plan.md, research.md, data-model.md, contracts/delete.md and linked UX.

## Phase 1: Setup

- [x] T001 Inspect existing removal/Manager flow and isolate branch/worktree; record in specs/023-manager-session-delete/research.md.

## Phase 2: Foundational

- [x] T002 Specify exact-ID, approval, success/failure and cleanup boundaries in docs/ux/manager-session-delete.md and specs/023-manager-session-delete/design.md.

## Phase 3: US1 - Delete one selected worker

- [x] T003 [US1] Add approval, exact target and result contract coverage in client/test/manager.test.ts and client/test/manager-store.test.ts (FR-001/002/004/007/008).
- [x] T004 [US1] Correct shared removal lifecycle and no-resurrection behavior in client/src/main/sessions/index.ts with tests in client/test/sessions.test.ts (FR-003/004/005/006).
- [x] T005 [US1] Expose command, bound confirmation, provider result and favorite cleanup in client/src/main/manager-operations.ts (FR-001/002/004/005).
- [x] T006 [US1] Align capabilities and instructions in client/src/main/manager-operations.ts and client/src/main/manager-protocol.ts (FR-006/007).

## Phase 4: Validation and review

- [x] T007 Verify real compiled CLI/private socket/provider fixture, focused and complete tests, typecheck/lint/build; record exact results in specs/023-manager-session-delete/verification.md (FR-008, SC-001..004).
- [x] T008 Complete cleanup inventory and documentation; retain unresolved cleanup dependency, commit locally and update day-plan with branch/worktree/evidence (FR-006/008).

## Dependencies

T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008. One story; whole single-worker flow is the MVP. No deployment task is authorized.

## Parallel opportunities

Root can investigate cleanup/document evidence while strict TypeScript implementation proceeds. Do not edit the same TS files from separate agents. No independent implementation story is needed.

## Implementation strategy

Finish single-session deletion including failure and concurrency, verify disposable fixture end to end, record limits and prepare local review. Cleanup is explicitly outside implementation until its scope is answered.

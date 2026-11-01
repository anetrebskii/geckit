# Tasks: Employees and assigned-session memory

**Input**: approved spec.md, design.md, docs/ux/employees.md and docs/design/employees.html; plan.md, research.md, data-model.md and contracts/interfaces.md.
**Validation**: proportional temporary-file/native and fixture tests required by constitution for parsing/state; browser review mandatory; native Safari fallback is available while browser bridge is unavailable. Do not mark unavailable checks passed.

## Phase 1: Setup

- [x] T001 Record UX approval, implementation branch and interactive prototype in specs/018-employees/design.md and docs/design/employees.html (FR-001–018).
- [x] T002 [P] Bundle twelve licensed generated portraits and source record in client/src/renderer/src/employees/avatars/ (FR-002).

## Phase 2: Foundation

- [x] T003 Define Employee/EmployeeDraft/EmployeesView/EmployeeMemory/EmployeesApi contracts in client/src/shared/employees.ts; editable fields derive from Employee (FR-001–018).
- [x] T004 Extend existing contracts and transport in client/src/shared/api.ts, client/src/preload/index.ts, main/index.ts and phone allowlist: optional employeeId and Settings.employeeFilter (FR-004–008, FR-016).

## Phase 3: US1 — Catalog (P1)

Independent test: save/reopen/edit/archive/restore one employee; fail catalog and instruction writes separately.

- [x] T005 [US1] Implement atomic catalog, stable UUID, nonempty trimmed name, free-text optional role/description, avatar employee-01..12, archive and revision checks in client/src/main/employees.ts (FR-001–003).
- [x] T006 [P] [US1] Implement list/form, dirty cancellation, portrait choice, error/retry/archive/restore in client/src/renderer/src/ui/EmployeesSettings.tsx and SettingsDialog.tsx (FR-001–003).
- [x] T007 [US1] Verify persistence, failed writes and stale revisions in client/test/employees.test.ts (FR-001–003, SC-001).

## Phase 4: US2 — Assignment (P1)

Independent test: assignment exists before first dispatch; change/clear without changing prompt or starting a turn.

- [x] T008 [US2] Persist/validate assignment before dispatch and retain source root in client/src/main/sessions/index.ts and SessionNote (FR-004–005, FR-015, FR-017).
- [x] T009 [P] [US2] Wire Employee selection into New task and existing session headers on desktop/phone under client/src/renderer/src/chat/ (FR-004–006, FR-016).
- [x] T010 [US2] Verify new assignment, reassignment, clear and archive rejection without prompt modification in client/test/ employee/session tests (FR-004–005, SC-005).

## Phase 5: US3 — Memory (P1)

Independent test: retrieve a prior decision, exclude another employee, traverse sources/large messages and distinguish unavailable history.

- [x] T011 [US3] Add direct non-activating provider history discovery/page cursor in client/src/main/sessions/index.ts and employees.ts; include hidden/archive, source metadata and completeness (FR-008–010, FR-018).
- [x] T012 [US3] Add read-only current/catalog/memory CLI access and transport in client/src/cli/ and main/asked.ts (FR-008–010).
- [x] T013 [P] [US3] Add role and paged source inspection using actual shared components in client/src/renderer/src/employees/ (FR-008–010, FR-016).
- [x] T014 [US3] Verify isolation, restart, unavailable/partial sources, unchanged hidden/read state and huge-source continuation in client/test/ (FR-009–010, FR-018, SC-003).

## Phase 6: US4 — Instructions (P1)

Independent test: generate current catalog after four changes while preserving user text; guide failure is separate from saved catalog.

- [x] T015 [US4] Extend managed guide generation and employee sync/retry in client/src/main/guide.ts and employees.ts, preserving source isolation and user instructions (FR-011–013, FR-017).
- [x] T016 [US4] Verify isolated packaged guide configs, update failure/retry and no per-task role/history injection in client/test/ (FR-011–013, SC-004–005).

## Phase 7: US5 — Filters and display (P2)

Independent test: exact employee/folder/profile/search intersection; unfiltered notifications/lifecycle; matching phone assignment.

- [x] T017 [US5] Add memoized visibleSessions and shared catalog hook/map in client/src/renderer/src/chat/useChat.ts and employees/ (FR-006–007, FR-016).
- [x] T018 [US5] Compose top filter and stable memoized avatar/name display in Board.tsx, Sidebar.tsx, PhoneBoard.tsx and related phone/header/search surfaces (FR-006–007, SC-002, SC-006).

## Phase 8: US6 — Manager routing (P2)

Independent test: advertised authenticated employee lookup/create/assign chooses role before dispatch, preserves explicit choice, policy and provider.

- [x] T019 [US6] Add validated advertised employee commands and assignment options to client/src/main/manager-operations.ts and manager-protocol.ts (FR-014–015).
- [x] T020 [US6] Verify ownership/project access, archive/unknown rejection and unchanged policy/receipt behavior in client/test/manager*.test.ts (FR-014–015, SC-005).

## Phase 9: Verification and documentation

- [x] T021 Run focused/full typecheck/lint/tests, desktop build and mobile build; record actual native/CLI integration in specs/018-employees/verification.md (FR-001–018, SC-001–006).
- [x] T022 Exercise actual renderer in supported browser in light/dark 1440×900, 1024×768 and 390×844, including focus/scroll/error/dirty forms; record exact unavailable checks in specs/018-employees/verification.md if browser host remains unavailable (FR-001–018).
- [x] T023 Review memo/filter/card changes with docs/performance.md and record measurements/limitations in specs/018-employees/verification.md; complete real provider/phone/SSH boundaries where available (FR-006–010, FR-016).
- [x] T024 Reconcile implementation with spec, keep docs/features.md truthful, update approved-entry audit if applicable and day-plan result; retain branch and user edits (specs/018-employees/verification.md, docs/feature-audit.md).

## Dependencies and parallel opportunities

T001–T003 precede implementation. T004+T005 establish catalog/API. T008 precedes memory and Manager assignment. T015 may proceed alongside renderer after catalog contract. T006/T009/T013/T017–T018 renderer ownership is separate from backend T005/T008/T011–T012/T015/T019. Within each story, implementation completes before its focused verification. T021–T024 follow all feature stories. Example parallel work per story: backend catalog + Settings form (US1); assignment persistence + selectors (US2); memory reads + source viewer (US3); guide generation + isolated fixtures (US4); memo/filter + row display after shared hook (US5); Manager commands + tests after contract (US6).

## Implementation strategy

Deliver catalog first, then durable assignment, requested source memory and guide updates, then filters and Manager routing. Full requested scope remains required; catalog-only MVP does not finish the user's request. Workers own disjoint backend versus renderer files; root owns design/docs/assets and final validation. No commits or external deployment requested.

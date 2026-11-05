# Tasks: Unified configuration

## Setup
- [x] T001 Define storage contract and design boundary in specs/022-unified-configuration/spec.md and design.md.

## Foundation
- [x] T002 Implement typed sections and local state adapters in client/src/core/configuration.ts and client/src/shared/configuration.ts.

## US1 - One configuration
- [x] T003 [US1] Add migration, backup, sibling-write and corruption tests in client/test/configuration.test.ts.
- [x] T004 [US1] Route Settings, Employees and Manager persistence through the section store in client/src/main/store.ts, employees.ts and manager.ts.
- [x] T005 [US1] Adapt persistence expectations in client/test/store.test.ts and employees.test.ts while preserving Manager runtime tests.

## US2 - Transfer
- [x] T006 [US2] Adapt standalone CLI, metadata migration and development initialization in client/src/cli/index.ts, client/src/main/session-migration.ts and local-data.ts.
- [x] T007 [US2] Verify copy/restart isolation and shortcut history in client/test/configuration.test.ts.
- [x] T008 [US2] Document configuration sections, backups and transfer in docs/configuration.md; update approved feature evidence in docs/features.md and docs/feature-audit.md.

## Verification
- [x] T009 Run affected tests and required build/type/lint checks; record results in specs/022-unified-configuration/verification.md.

Dependencies: T001 -> T002 -> US1 -> US2 -> T009. Execute serially because owners share storage and the checkout has other active work. Independent tests in T003 and T007 may run together after implementation; no separate agents needed.

## UI follow-up (requested after storage delivery)
- [x] T010 Write UX proposal and extend specification/design/plan for FR-008 through FR-010.
- [x] T011 Add portable-file validation, pending import, private backup and service-startup application.
- [x] T012 Add service export/import RPC and desktop shutdown barrier with isolated filesystem/service tests.
- [ ] T013 Alex approved UX; prototype and native/Settings implementation are complete. Prototype visual review remains blocked by GeckIt conversation registration.
- [ ] T014 Exercise actual Settings handlers in light/dark desktop contexts; keyboard, scrolling, cancel, errors, export and import. Verify native boundaries independently.
- [x] T015 Feature/docs, typecheck/lint/full suite/build/mobile checks and static performance review complete. Alex subsequently requested direct-main delivery with T013/T014 verification gaps documented; integrate, push, verify remote and remove the temporary worktree as part of delivery.

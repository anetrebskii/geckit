# Tasks: Headless service

## Setup
- [X] T001 Record spec/design/contracts and isolated verification plan in specs/019-headless-service/.

## Foundation
- [X] T002 Remove Electron runtime imports from shared execution paths using client/src/core/platform.ts and desktop adapter.
- [X] T003 Extract shared session/provider bootstrap into client/src/core/sessions.ts and use it from client/src/main/index.ts.

## US1 - Display-free lifecycle
- [X] T004 [US1] Add shared runtime and single-owner service lifecycle in client/src/core/runtime.ts and client/src/service/index.ts (FR-001, FR-002, FR-005, FR-007).
- [X] T005 [US1] Add independent Node build in client/service.vite.config.ts and scripts in client/package.json (FR-001, FR-008).

## US2 - Operator CLI
- [X] T006 [US2] Add typed private operator protocol and dispatch in client/src/core/operator.ts (FR-003, FR-004, FR-006).
- [X] T007 [US2] Add service commands to client/src/cli/service.ts and client/src/cli/index.ts (FR-003).
- [X] T008 [US2] Verify service task completion, disconnect, pending answers, restart and denied callers in client/test/headless-service.test.ts (FR-002, FR-004, FR-006, FR-007).

## US3 - Shared desktop behavior
- [X] T009 [US3] Preserve existing desktop behavior and scheduler cleanup with checks in client/test/ and client/src/main/index.ts (FR-005, SC-004).

## Delivery
- [X] T010 Document installation, integration limits and actual checks in docs/headless-service.md and specs/019-headless-service/verification.md (FR-008).

## Dependencies
T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010. Documentation and fixture planning can proceed independently; implementation remains sequential to preserve shared bootstrap dependencies.

## Strategy
Deliver display-free lifecycle, then operator work, then verify desktop reuse. Desktop attaches to the same local service. Slack, portable export and multiuser access are separate features.

## Full extraction (latest request)
- [X] T011 Add typed authenticated RPC, events, binary preservation and disconnect tests.
- [X] T012 Move full application composition and core API to the service, including Telegram/intake/Plans/providers.
- [X] T013 Add Node secure vault and safe legacy desktop migration.
- [X] T014 Replace desktop runtime ownership with service client, native adapters and snapshot/event synchronization.
- [X] T015 Include service in normal dev/build/package; preserve CLI and phone security boundaries.
- [X] T016 Verify desktop and CLI cross-client workflows, detach/reconnect, UI behavior and all affected checks; update evidence.

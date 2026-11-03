# Tasks: built-in Codex Chrome

## Setup
- [x] T001 Record specification, UX handoff and researched packaging plan in specs/020-codex-chrome/ and docs/ux/codex-chrome.md.

## US2: bundled configuration (P1)
- [x] T002 [US2] Pin official build dependency in client/package.json and lockfile; copy complete runtime resources in client/service.vite.config.ts and unpack desktop resources.
- [x] T003 [US2] Add typed browser runtime configuration in client/src/main/sessions/codex-browser.ts and configure it from client/src/service/index.ts.
- [x] T004 [US2] Pass config on ordinary Codex start/resume/fork in client/src/main/sessions/codex.ts and codex-protocol.ts, preserving user developer instructions and correction isolation.
- [x] T005 [US2] Cover configuration, packaging path and normal/correction propagation in client/test/codex-browser.test.ts and existing Codex integration tests.

## US1: real target reading (P1)
- [x] T006 [US1] Build copied MCP, initialize without npm and validate desktop unpack path; record evidence in specs/020-codex-chrome/verification.md.
- [ ] T007 [US1] Use real app-server with bundled MCP to read the authorized Instagram URL by pageId after Chrome consent; record observed result in specs/020-codex-chrome/verification.md and requested time2you report.

## US3: supported recovery (P2)
- [x] T008 [US3] Add model guidance for target scoping and Chrome setup/permission errors in client/src/main/sessions/codex-browser.ts; document remote-host/profile limits in docs/ux/codex-chrome.md.

## Completion
- [ ] T009 Run build, typecheck, lint and required tests; update specs/020-codex-chrome/verification.md, docs/features.md and docs/feature-audit.md accurately; update day-plan and requested report.

Dependencies: T001 -> T002 -> T003 -> T004 -> T005/T006 -> T007 -> T009. T008 follows T003 and precedes T007. Parallel example: T005 test design and T008 guidance concern distinct checks, but implementation remains sequential in this session. Deliver bundled integration first, then actual consent/target proof. Do not mark real reading complete based on mocks.

T009 partially complete: build/typecheck/full tests/targeted lint and documentation done. Full lint has pre-existing errors, routed separately. Task remains open together with T007 because actual page reading is blocked on Chrome setup.

# Tasks: Team Telegram topic
## Setup and foundation
- [x] T001 Write specification and design in specs/028-team-telegram and docs/ux/team-telegram.md.
- [x] T002 Add shared metadata and scope helpers in client/src/shared/telegram.ts and client/src/main/telegram-team.ts.
## US1: owner connects topic
- [x] T003 [US1] Parse chat/topic/sender metadata in client/src/main/telegram-bot.ts; verify pairing and single-use expiry in telegram.ts.
- [x] T004 [US1] Extend token/candidate UI in client/src/renderer/src/chat/ManagerTelegram.tsx.
- [x] T005 [US1] Add pairing/isolation fixtures in client/test/telegram.test.ts.
## US2: durable shared work
- [x] T006 [US2] Persist in-flight updates before offset and deduplicate through Manager in client/src/main/telegram.ts and manager.ts.
- [x] T007 [US2] Bind reply origins and generation in client/src/core/runtime.ts and shared/manager.ts.
- [x] T008 [US2] Scope native attachments, reject albums/invalid images and preserve pins in client/src/main/telegram.ts.
- [x] T009 [US2] Scope group menu, typing/status and uploads in client/src/main/telegram.ts and telegram-bot.ts.
- [x] T010 [US2] Add crash/restart, image provider, limits and unknown-delivery fixtures in client/test/telegram.test.ts.
## US3: authority
- [x] T011 [US3] Bind callback message, decision fingerprint and actor policy in client/src/main/telegram.ts.
- [x] T012 [US3] Enforce team ownership and active generation in client/src/main/manager-operations.ts and manager.ts.
- [x] T013 [US3] Filter history/status/decisions in client/src/core/runtime.ts; prohibit global controls for team.
- [x] T014 [US3] Add tool and async revocation fixtures in client/test/manager.test.ts and telegram.test.ts.
## Polish
- [x] T015 Document transition/rollback in docs/ux/team-telegram-transition.md; run standard client checks and review UI/performance.
## Dependencies and strategy
T002 precedes US1, then durable US2 and authority US3 before activation. Parser tests and tool tests are independent but execute in this session, without subagents. Implement increments with offline tests; no deployment. Never claim complete with open security or replay tests.
## Validation status
All implementation tasks executed. Offline team tests and browser fixtures pass. Release acceptance remains open: standard checks have reproduced base/environment failures, and live Telegram, packaged Electron and cutover were not authorized. External work report contains the exact commands and results.

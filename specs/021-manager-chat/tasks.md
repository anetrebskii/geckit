# Tasks: Manager chat in the app

## Phase 1: Setup

- [x] T001 Read and approve UX and design handoff in docs/ux/manager-chat.md and specs/021-manager-chat/design.md.
- [x] T002 Research and document contracts in specs/021-manager-chat/research.md and contracts/app.md.

## Phase 2: Foundations

- [x] T003 Add dedicated ManagerApi request/receipt/decision contracts and durable receipt persistence in client/src/shared/manager.ts and client/src/main/manager.ts.
- [x] T004 Wire scoped RPC/IPC/preload and explicit phone allowlists in client/src/core/application.ts, client/src/main/index.ts, client/src/preload/index.ts and client/src/renderer/src/phone.ts.

## Phase 3: US1 - app conversation without Telegram

- [x] T005 [US1] Verify known blocked/paused/off/stale send rejection and receipt/dedupe behavior in client/test/manager.test.ts.
- [x] T006 [US1] Implement isolated persistent composer and shared history in client/src/renderer/src/chat/ManagerChat.tsx and ManagerInspection.tsx.
- [x] T007 [US1] Make Telegram optional in client/src/renderer/src/chat/Manager.tsx, ManagerFlow.tsx and ManagerStep.tsx.
- [x] T008 [US1] Add desktop Team Open chat in client/src/renderer/src/employees/TeamManager.tsx and existing status routing.

## Phase 4: US2 - shared context and decisions

- [x] T009 [US2] Add current-session decision/native-card answer checks and test stale answers/restart persistence in client/src/main/manager.ts and client/test/manager.test.ts.
- [x] T010 [US2] Render safe decision cards, pending accepted messages and uncertain-send reconciliation in client/src/renderer/src/chat/ManagerChat.tsx and its composer.
- [x] T011 [US2] Preserve Transcript streaming identity and add Manager-only new-messages/focus behavior in client/src/renderer/src/chat/Transcript.tsx.

## Phase 5: US3 - paired phone

- [x] T012 [US3] Add Tasks and Team routes to shared ManagerPhone in client/src/renderer/src/chat/PhoneHome.tsx, PhoneBoard.tsx and employees/TeamManager.tsx.
- [x] T013 [US3] Handle connection loss, draft return, phone keyboard and native unsupported fallback in shared ManagerChat and phone routing.

## Phase 6: Verification and delivery record

- [x] T014 Mount actual changed components in client/src/renderer/src/manager-preview.tsx with narrow synthetic native boundaries and observable fixture requests.
- [ ] T015 Review real renderer light/dark, required desktop/phone sizes, setup/send/queue/answers/failures/drafts/keyboard/scroll; record specs/021-manager-chat/verification.md.
- [x] T016 Run typecheck, lint, tests, desktop/mobile builds and performance review, fixing relevant failures; record verification.md.
- [x] T017 Update docs/features.md, docs/feature-audit.md and existing UX links with implemented scope and evidence; update day-plan without claiming release/live deployment.

## Dependencies and strategy

T001–T002 precede all edits. T003–T004 precede integrated UI validation; UI/entrypoint work may run independently after agreeing the contracts. US1 is the MVP; US2 preserves its coordinator state and US3 reuses its shared body. T014–T017 close all stories, not a separate feature expansion.

Parallel opportunities: backend owns main/shared/core/preload/phone bridge and backend tests; chat UI owns ManagerInspection/ManagerChat/composer/Transcript and new CSS; entrypoints owns setup, Team and phone routing. All shared-file coordination is explicit; harness/evidence are parent-owned. No unordered mutations or duplicate agent edits.

Independent checks: US1 no-Telegram setup and text conversation; US2 shared history and single valid decision across channels; US3 paired phone routing/input/offline return.

T015 is partially verified, with an external tooling blocker: the concurrent browser-lifecycle change rejects the active conversation as unregistered. Long-history scrolling, runtime typing measurements and final focus/delta rechecks remain unverified; see verification.md. This is not a claim that every SC-005 scenario passed.

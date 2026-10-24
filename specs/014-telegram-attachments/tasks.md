# Tasks: Telegram attachments

## Phase 1: Setup

- [x] T001 Inspect current routing, provider images, manager operations and open sharing work in client/src/main/ and client/src/shared/.
- [x] T002 [P] Establish isolated branch, specification and UX handoff in specs/014-telegram-attachments/ and docs/ux/manager-telegram.md.

## Phase 2: Foundation

- [x] T003 Implement typed attachment metadata and bounded private store in client/src/main/telegram-attachments.ts and its imported Manager/provider contracts; enforce actual size, safe paths, 24h lifetime and total capacity.

## Phase 3: US1 - Send task material

Independent test: photo/image document/ordinary file reaches actual Manager/Sessions provider input with exact content and caption/reply/message/group identity.

- [x] T004 [US1] Add realistic photo/document/caption/update and bounded-download fixtures in client/test/telegram.test.ts and attachment tests.
- [x] T005 [US1] Parse authorized media and download only after chat/user/reference checks in client/src/main/telegram-bot.ts and client/src/main/telegram.ts.
- [x] T006 [US1] Persist/resolve attachment IDs and dispatch native images/readable file context through client/src/main/manager.ts and client/src/main/sessions/index.ts.
- [x] T007 [US1] Add explicit managed local worker input handoff in client/src/main/manager-operations.ts and exercise real bytes/root/provider input in client/test/manager.test.ts.

## Phase 4: US2 - Receive selected deliverables

Independent test: selected safe worker file passes authenticated operation to photo/document multipart upload and returns mapped message ID with exact bytes/caption/chat.

- [x] T008 [US2] Define explicit command shapes/capabilities and worker-to-Manager request guidance in client/src/main/manager-operations.ts, client/src/main/manager-protocol.ts and client/src/cli/manage.ts.
- [x] T009 [US2] Wire deliberate delivery bridge and saved reply origins in client/src/main/index.ts and client/src/main/telegram.ts.
- [x] T010 [US2] Verify explicit photo/document output, outside-root/symlink/unowned/remote rejection, upload failures and uncertainty in client/test/manager.test.ts and client/test/telegram.test.ts.

## Phase 5: US3 - Resume and clean up

Independent test: reopen actual stores/controller with synthetic files, assert readable retained input, expired/full behavior, startup/disconnect cleanup and no blind replay.

- [x] T011 [US3] Implement retained/queued reference lifecycle, restart checks and explicit project-copy retention policy in client/src/main/telegram-attachments.ts and client/src/main/manager.ts.
- [x] T012 [US3] Verify duplicate/late updates, re-pair/cross-chat/native-decision rejection, cache caps/expiration and outbound interrupted recovery in client/test/telegram.test.ts and attachment tests.

## Phase 6: Review

- [x] T013 [P] Reconcile exact wording/constants/limitations and render transitions in specs/014-telegram-attachments/ux.md and evidence/.
- [x] T014 Run focused and required proportional checks; inspect requirement evidence and record real/substituted/live boundaries in specs/014-telegram-attachments/verification.md.
- [x] T015 Update approved feature entry/audit, integration overlap and task status in docs/features.md, docs/feature-audit.md and today's day-plan.

## Dependencies and parallel work

T001-T002 precede T003; US1 and US2 use that foundation. US3 validates both lifecycle paths; T014 requires all implementation and relevant tests. T013 documentation can proceed beside backend work after state decisions are known. One TypeScript owner avoids conflicting transport edits. Parent owns docs/evidence. User scope requires all three stories, so an input-only subset is not final delivery.

# Tasks: VPN public IP guard

## Phase 1: Setup and design

- [x] T001 Record approved UX and prepare interactive GeckIt prototype in docs/ux/vpn-ip-guard.md and docs/design/vpn-ip-guard.html.
- [x] T002 Review prototype light/dark and keyboard in Chrome; record evidence in specs/009-vpn-ip-guard/design.md.

## Phase 2: Foundation

- [x] T003 Implement strict Settings fields/defaults and canonical public-address parser in client/src/shared/api.ts and client/src/shared/vpn-ip.ts; default false/empty, canonical dedup, reject private-only/hostnames/ranges.
- [x] T004 Add deterministic guard/parser/store tests in client/test/vpn-ip.test.ts and client/test/store.test.ts before implementation.
- [x] T005 Implement abortable ten-second family-specific verifier and atomic settings validation in client/src/main/vpn-ip.ts and client/src/main/store.ts; no cache, revalidate policy, fail closed.

## Phase 3: US1 - Block unapproved dispatch

Independent test: rejected verifier produces zero model starts/resumes/content transmissions on every covered path and retains pending work.

- [x] T006 [US1] Add rejected/deferred verifier session regressions in client/test/sessions.test.ts and request tests.
- [x] T007 [US1] Gate create/resume/send, native goals, queue drain/inject, answers/auto-grants/mode retry, history fork, restart/reattach and Remote Control in client/src/main/sessions/index.ts; preserve asks, queue and cancelled/duplicate-operation safety.
- [x] T008 [US1] Wire production verifier and guard spoken session-intent planning, expose narrow retry state/call consistently in client/src/main/index.ts, client/src/shared/api.ts, client/src/preload/index.ts and client/src/renderer/src/phone-calls.ts as needed.

## Phase 4: US2 - Configure approved IPs

Independent test: save valid list, reject invalid edit without policy change, off retains list, settings apply to paired computer.

- [x] T009 [P] [US2] Implement reusable accessible save/toggle address UI in client/src/renderer/src/ui/VpnIpSettings.tsx and SettingsDialog.tsx using existing product tokens.
- [x] T010 [US2] Add paired-computer settings page and responsive styles in client/src/renderer/src/chat/PhoneSettings.tsx and client/src/renderer/src/styles.css; sync existing settings contract.

## Phase 5: US3 - Recover in place

Independent test: retry saved blocked operation exactly once, keep unrelated draft and attachments, continue partial started turn instead of replay.

- [x] T011 [US3] Implement retained-operation retry, checking/cancel control and actual phone error explanation in client/src/renderer/src/chat/useChat.ts and Composer.tsx with contract from main.
- [x] T012 [US3] Add end-of-error Try again next to existing Continue placement in client/src/renderer/src/chat/Transcript.tsx and Chat.tsx; preserve draft and offer no duplicate during checks.

## Phase 6: Verification and documentation

- [x] T013 Run client typecheck/lint/tests and desktop/mobile builds; record outcomes in specs/009-vpn-ip-guard/verification.md.
- [x] T014 Visually review real changed components full-window in both themes, desktop/phone, keyboard/focus/scrolling; performance-review and record in specs/009-vpn-ip-guard/design.md.
- [x] T015 Add implemented user-requested feature entry/evidence in docs/features.md and docs/feature-audit.md, reconcile final docs/tasks, mark daily task for review.

## Dependencies and parallel execution

T001 -> T002 -> foundation T003/T004/T005 -> US1 T006/T007/T008 and US2 T009/T010 -> US3 T011/T012 -> verification T013/T014/T015. T009 settings files independent from session integration after foundation contract is fixed; backend/tests and settings can run in parallel without overlapping ownership. UI prototype and research precede app edits. US1 yields guarded dispatch MVP; UI configuration and recovery complete requested feature.

## Phase 7: Approved periodic monitoring extension

- [x] T016 Update approved UX/spec/design/plan for optional ten-second active monitoring, stop/hold and deliberate recovery.
- [x] T017 Research provider Stop/background/goal/remote lifecycle and timer disposal; record findings in research.md.
- [x] T018 Add persistent vpnStopOnFailure setting/default/store validation, shared settings switch/help and prototype/preview states.
- [x] T019 Implement single shared active-session periodic monitor with no overlap/idle probes and policy/dispose invalidation; deterministic timer tests.
- [x] T020 Interrupt supported active work, preserve/park queues and recovery across late provider events and restart; session regressions.
- [x] T021 Run final checks/builds; review actual desktop/phone states in light/dark, performance checklist; record verification and update feature/audit/daily task.

T016 -> T017 -> T019/T020; T018 can proceed after handoff independently of session/monitor ownership. T018/T019/T020 -> T021. No unresolved consequential UX decisions; "implement it" authorizes the proposal.

## Phase 8: Authorized deployment request

- [ ] T022 Commit verified source and publish Development through main workflow after direct authorization accepted by automatic approval.
- [ ] T023 Build/sign/install matching companion on Alex's iPhone and verify installed version/bundled VPN controls.
- [x] T024 Verify all release platform jobs/assets, promote explicit version to Stable, inspect Latest/updater metadata and record device/release evidence.

Deployment objective: iPhone installation, Development publication and Stable promotion all required. Do not substitute local bundles or a CI archive for an installed iPhone or published channel.

### Single VPN protection flag correction (2026-10-11)

- [x] T023 Update existing UX/design/spec: one master flag enables before-send checks and automatic active-work stopping; old independent preference is obsolete.
- [x] T024 Remove secondary desktop/phone control and effective setting; verify legacy false cannot disable monitoring, master off cancels checks and saved addresses remain atomic.
- [x] T025 Run regression checks, review full-window light/dark desktop and phone states, and update authorized local iPhone installation.

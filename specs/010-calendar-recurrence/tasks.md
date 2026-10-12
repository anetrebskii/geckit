# Tasks: Calendar-style recurrence

**Input**: spec.md, design.md, plan.md, research.md, data-model.md, contracts/shortcuts.md and quickstart.md in this directory; approved UX and reviewed prototype linked from design.md.

## Phase 1: Setup

- [x] T001 Review and approve behavior and prototype in docs/ux/calendar-recurrence.md and docs/design/calendar-recurrence.html.
- [x] T002 Resolve contracts, zone and scheduling decisions in specs/010-calendar-recurrence/plan.md, research.md and data-model.md; verify existing client/.gitignore and eslint configuration coverage.

## Phase 2: Foundation

- [x] T003 Add composed CalendarRecurrence and runtime zone metadata types in client/src/shared/api.ts and shared recurrence module; preserve existing ShortcutDraft composition.
- [x] T004 Implement defensive rule validation, anchored candidate matching, zone conversion, bounded endpoint computation and readable summaries in client/src/shared/recurrence.ts (split by responsibility if needed).

## Phase 3: US1 - Set custom recurrence (P1)

Independent test: every two weeks Tue/Thu anchored October 13; monthly date/ordinal/last and yearly leap date; raw cron unchanged.

- [x] T005 [US1] Cover anchoring, multiweek weekdays, monthly/yearly/missing dates and raw cron regression in client/test/recurrence.test.ts and client/test/schedule.test.ts.
- [x] T006 [US1] Add custom schedule evaluation in client/src/shared/schedule.ts and main-owned zone metadata in client/src/main/store.ts without stale renderer override.
- [x] T007 [US1] Add shared custom recurrence editor in client/src/renderer/src/chat/CustomRecurrence.tsx with local drafts, inline validation, keyboard/focus and scoped token CSS in styles.css.
- [x] T008 [US1] Integrate Custom, summary/edit trigger, saved drafts and retained-save-error state into client/src/renderer/src/chat/ShortcutList.tsx.

## Phase 4: US2 - End schedule (P1)

Independent test: three eligible dates only; final-date delayed tick works; subsequent date cannot catch up; manual/pause unrelated.

- [x] T009 [US2] Cover end-date/count, final-day latency, DST gap/fold and differing phone zone, no overlap/catch-up boundaries and pause/manual independence in client/test/recurrence.test.ts and shortcut tests.
- [x] T010 [US2] Integrate eligibility, save/runtime validation, deleted-draft rejection, rule-change cursor and progress preservation in client/src/main/shortcuts.ts and client/src/main/store.ts; verify persistence with client/test/store.test.ts and shortcuts tests.
- [x] T011 [US2] Show Never/On/After, next/paused/ended status and allow editing expired recurrence in CustomRecurrence.tsx and ShortcutList.tsx.

## Phase 5: US3 - Desktop/phone parity (P2)

Independent test: save desktop rule, reopen/edit phone, preserve all fields; cancel nested editing; retain failed save and retry.

- [x] T012 [US3] Integrate shared Custom editor, same-computer-zone preview, summaries/status and save-error retention in client/src/renderer/src/chat/PhoneShortcuts.tsx and scoped styles.css.
- [x] T013 [US3] Add isolated real-component preview in client/src/renderer/src/recurrence-preview.tsx and renderer/recurrence-preview.html; verify desktop/phone edits, cancellation, invalid inputs, failed save, key/focus and scrolling.

## Phase 6: Verification and delivery

- [x] T014 Run client typecheck/lint/full tests/build, mobile build and diff check; record results in specs/010-calendar-recurrence/verification.md.
- [x] T015 Review actual rendered components full-window light/dark at desktop 1440x900 / 1024x768 and phone 390x844 / 320x568; fix visible issues and record evidence/limitations in design.md and verification.md.
- [x] T016 Apply performance-review to affected recurrence/UI paths against docs/performance.md; validate date-query cost and formatter/cache boundaries in verification.md.
- [ ] T017 After Alex approves the proposed Scheduled work expansion, update docs/features.md and docs/feature-audit.md with implementation evidence and unreleased status. Exact proposal sent; no answer yet, so list/audit unchanged by this session. Day-plan task marked in review with verification evidence.

## Save bug follow-up: 2026-10-12

- [x] T018 Reject custom Save against a known unsupported running backend before IPC, verify returned recurrence before closing the desktop/phone editor, and retain the approved failed-save draft state.
- [x] T019 Add current main/store disk round-trip coverage, runtime metadata ownership coverage and legacy save-response regression coverage.
- [x] T020 Review actual desktop and phone components with unsupported, mismatched-response and supported save fixtures; run affected/full tests, typecheck/lint and client/mobile builds; record evidence.
- [ ] T021 Verify the updated backend in the live app after active conversations finish and GeckIt Local is restarted. No session restart merely to load this change; native UI access still required for direct live verification.
- [x] T022 Correct mobile safe-area header height, native date/time sizing and narrow weekday targets from the iPhone screenshot; preserve fields/actions and desktop layout.
- [x] T023 Review phone light/dark with safe-area and enlarged-text fixtures, desktop regression context, focus and scrolling; rebuild client/mobile and copy updated assets to iOS. Physical-device verification remains unavailable.
- [x] T024 At Alex's explicit request, sign and install the updated app over the existing GeckIt on his paired iPhone. Installation succeeded; launch rejected by locked device, so physical UI review remains pending.
- [x] T025 Correct the rejected mobile form hierarchy using existing grouped phone rows, aligned values and consistent end selection indicators; retain desktop behavior and all input/error semantics.
- [x] T026 Personally review the revised full phone form in light/dark at normal/narrow widths and enlarged text, including all units/end states, focus, scrolling and draft save/cancel. Run relevant checks and record limitations.
- [x] T027 Rebuild, sign and reinstall the corrected phone form under existing deployment authorization. Installation succeeded. Actual-phone visual review remains pending: auto-review rejected iPhone Mirroring screen access and explicit permission has not arrived.
- [x] T028 Apply requested UI design correction to remove nested value pills, compact rows, soften weekday selection and restore native WebKit date/time centering; review full form and deploy the revised iOS build. Physical-device visual review remains pending access.

## Dependencies

T001-T002 -> T003-T004 -> US1 -> US2 -> US3 -> T014-T017. Core end semantics may be developed alongside basic calendar evaluator, but all stories must finish before delivery. Tests precede their corresponding integration where practical.

## Parallel opportunities

After domain contract stabilizes, scheduler tests/core and independent UI fields could be developed separately. This session uses one strict TypeScript implementation owner; parent owns documents and browser/performance review to avoid shared-file conflicts. No additional agents required.

## Strategy

Preserve working existing cron first, add deterministic calendar primitives, integrate main persistence/execution, then both editors. Validate each story and finally complete builds and visual review. No commit, git push, PR or active desktop app restart requested. Alex subsequently authorized installing the mobile app on his iPhone.

- [x] T029 Verify actual recurrence component in browser at Capacitor phone sizes, fix keyboard overlap and top anchoring, build/copy/sign/install the updated iPhone app. Physical WKWebView verification remains unavailable.

- [x] T030 Correct phone numeric editing appearance and keyboard hint, avoid input autofocus on sheet opening, verify interactions and full-screen light/dark rendering, and install the signed iPhone update.

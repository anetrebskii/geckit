# Tasks: Browser profile management

## Design and foundation

- [x] T001 Read existing feature/lifecycle code and official Chrome credential portability evidence; approve UX, render state diagram and build token-based layout prototype.
- [x] T002 Review prototype in browser and finalize design handoff.
- [x] T003 Add exclusive creation and lifecycle locking in `testing.ts`, with create-only native handler and truthful open failure in `core/application.ts`.

## US1: Manual profile management

- [x] T004 [P] Extract `BrowserProfiles.tsx` and replace inline section in `SettingsDialog.tsx`; add scoped `styles.css` layout.
- [x] T005 [P] Implement validation, duplicate handling, pending guards, local errors, cancellation and focus; preserve live sign-in/delete behavior.
- [x] T006 [P] Add actual Settings browser harness with native boundary receipts and injectable failures.

## US2: Export closed profile

- [x] T007 [P] Implement bounded streaming private archive export, existing-output refusal, closed-profile guards and cleanup in `profile-archive.ts`.
- [x] T008 Add public export CLI dispatch/help and focused temporary-file tests.

## US3: Import under a new name

- [x] T009 Implement strict version/record/path validation, staging and atomic publication with optional account metadata.
- [x] T010 Add import CLI dispatch/help, truthful authentication wording and round-trip/malformed/collision/lock tests.

## Verification and evidence

- [x] T011 Run focused tests and fix failures; verify UI interactions and observable results in both themes, narrow/desktop sizes, focus and scrolling.
- [x] T012 Run typecheck, lint, full tests, desktop/mobile builds and performance review proportional to changed paths.
- [x] T013 Update feature/UX/spec verification evidence and day-plan result; report implementation and remaining verification limits.

T003 precedes final UI acceptance and archive publication checks. UI T004-T006 and archive T007-T010 have separate file ownership and can proceed independently after T002. T011-T013 depend on both paths. No commit, push or active-service restart is part of these tasks.
